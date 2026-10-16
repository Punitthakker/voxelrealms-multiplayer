// PlayForge WebSocket rooms at /pf-ws?token=<token> (protocol in playforge/WEBAPP.md, Server).
// One socket per page. A socket joins the 'lobby' (everyone on PlayForge, for "N playing" counts) and game rooms
// (a game id, up to 10 players). Each member has a presence object (merged patches) that every member sees in
// {t:'peers'} messages; {t:'emit'} relays events such as chat. All state is in memory: rooms are live only.
//
// Additions beyond the documented protocol (all optional for clients):
//   server -> client {t:'hello', peer, user}  right after the socket is accepted (peer = this connection's id)
//   client -> server {t:'ping'}  ->  {t:'pong'}  (an app-level heartbeat; browsers can't see ws pings)
//   /pf-ws?token=..&replace=<peer>  a reconnecting page takes over its previous connection (same user only):
//   it keeps that peer id and its rooms, so other players don't see it leave and come back.
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const filter = require('./filter');
const auth = require('./auth');
const { tokenBucket } = require('./limits');

const GAME_MAX = 10, LOBBY_MAX = 5000, ROOMS_PER_SOCKET = 4, SOCKETS_PER_USER = 12;
const PRESENCE_MAX = 4096, EMIT_MAX = 2048, CHAT_MAX = 150, TOPIC_RE = /^[A-Za-z0-9_.:-]{1,32}$/;
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/; // 'lobby', built-in game ids, community ids (u-xxxxxxxx)
const FLUSH_MS = { lobby: 250, game: 50 };     // peers changes are batched per room
const PING_MS = Number(process.env.PF_PING_MS) || 20000, GRACE_MS = 5000; // a dropped socket keeps its rooms for GRACE_MS

const conns = new Set();             // every accepted socket
const byPeer = new Map();            // peer id -> conn
const rooms = new Map();             // room name -> room
let wss = null, pingTimer = null;

const newPeerId = () => 'c' + crypto.randomBytes(6).toString('base64url');
const send = (conn, msg) => { if (conn.ws.readyState === 1) conn.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const err = (conn, code, message, room) => send(conn, room ? { t: 'error', room, code, message } : { t: 'error', code, message });
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/* ---------- peers serialization ---------- */
// A member as seen by one recipient: isMe = same user, sameTab = this very connection.
// The fixed parts are serialized once per change, so a flush to N members costs N string joins.
function memberJson(m) {
  if (!m.json) {
    m.json = {
      head: '{"peer":' + JSON.stringify(m.peer) + ',"by":' + JSON.stringify(m.by),
      tail: ',"kind":"viewer","guest":false,"presence":' + JSON.stringify(m.presence) + ',"updatedAt":' + m.updatedAt + '}',
    };
  }
  return m.json;
}
const peerFor = (m, to) => { const j = memberJson(m); return j.head + ',"isMe":' + (m.by === to.user.id) + ',"sameTab":' + (m.peer === to.peer) + j.tail; };
const listFor = (members, to) => '[' + members.map(m => peerFor(m, to)).join(',') + ']';

function peersMessage(room, to, joined, left, updated) {
  const all = [...room.members.values()];
  return '{"t":"peers","room":' + JSON.stringify(room.name) + ',"peers":' + listFor(all, to) +
    ',"joined":' + listFor(joined, to) + ',"left":' + listFor(left, to) + ',"updated":' + listFor(updated, to) + '}';
}

/* ---------- rooms ---------- */
function getRoom(name) {
  let r = rooms.get(name);
  if (!r) {
    r = { name, lobby: name === 'lobby', members: new Map(), joined: new Map(), left: new Map(), updated: new Set(), timer: null, lastFlush: 0 };
    rooms.set(name, r);
  }
  return r;
}
function schedule(r) {
  if (r.timer) return;
  const wait = Math.max(0, (r.lobby ? FLUSH_MS.lobby : FLUSH_MS.game) - (Date.now() - r.lastFlush));
  r.timer = wait ? setTimeout(() => flush(r), wait) : setImmediate(() => flush(r));
  r.timerIsImmediate = !wait;
}
function cancel(r) {
  if (!r.timer) return;
  if (r.timerIsImmediate) clearImmediate(r.timer); else clearTimeout(r.timer);
  r.timer = null;
}
function flush(r) {
  cancel(r); r.lastFlush = Date.now();
  if (!r.joined.size && !r.left.size && !r.updated.size) return;
  const joined = [...r.joined.values()], left = [...r.left.values()];
  const updated = [...r.updated].map(p => r.members.get(p)).filter(m => m && !r.joined.has(m.peer));
  r.joined.clear(); r.left.clear(); r.updated.clear();
  for (const m of r.members.values()) {
    // A member never hears about its own arrival: its join snapshot already listed it.
    const j = joined.filter(x => x !== m);
    if (!j.length && !left.length && !updated.length) continue;
    send(m.conn, peersMessage(r, m.conn, j, left, updated));
  }
  if (!r.members.size && rooms.get(r.name) === r) rooms.delete(r.name);
}

function join(conn, name, presence) {
  if (typeof name !== 'string' || !ROOM_RE.test(name)) return err(conn, 'bad_room', 'Room names are lobby or a game id.', typeof name === 'string' ? name.slice(0, 48) : undefined);
  if (presence !== undefined && presence !== null && (!isObj(presence) || JSON.stringify(presence).length > PRESENCE_MAX)) return err(conn, 'too_large', `Presence must be an object under ${PRESENCE_MAX} bytes.`, name);
  const r = getRoom(name);
  let m = r.members.get(conn.peer);
  if (m) { // already here (for example after a reconnect took over this connection): just send a fresh snapshot
    // The page re-sends its whole presence when it rejoins, so it replaces what the server had.
    if (presence) { m.presence = stripNulls(presence); m.updatedAt = Date.now(); m.json = null; if (!r.joined.has(m.peer)) r.updated.add(m.peer); schedule(r); }
  } else {
    if (conn.rooms.size >= ROOMS_PER_SOCKET) { if (!r.members.size) rooms.delete(name); return err(conn, 'too_many_rooms', `A connection can be in ${ROOMS_PER_SOCKET} rooms at once.`, name); }
    if (r.members.size >= (r.lobby ? LOBBY_MAX : GAME_MAX)) return err(conn, 'full', r.lobby ? 'PlayForge is full right now.' : `This game is full (${GAME_MAX} players).`, name);
    if (r.joined.size || r.left.size || r.updated.size) flush(r); // members already here get earlier changes first
    m = { peer: conn.peer, by: conn.user.id, conn, presence: presence ? stripNulls(presence) : {}, updatedAt: Date.now(), json: null, presRate: tokenBucket(20, 30) };
    r.members.set(conn.peer, m); conn.rooms.set(name, r);
    r.joined.set(m.peer, m); schedule(r);
  }
  const all = [...r.members.values()];
  send(conn, peersMessage(r, conn, all, [], []));
}
function stripNulls(o) { const q = {}; for (const k of Object.keys(o)) if (o[k] !== null) q[k] = o[k]; return q; }

function leave(conn, name) {
  const r = conn.rooms.get(name); if (!r) return;
  conn.rooms.delete(name);
  const m = r.members.get(conn.peer); if (!m) return;
  r.members.delete(conn.peer); r.updated.delete(conn.peer);
  if (r.joined.has(conn.peer)) r.joined.delete(conn.peer); // came and went inside one batch: nobody needs to know
  else r.left.set(conn.peer, m);
  if (!r.members.size) { cancel(r); rooms.delete(r.name); return; }
  schedule(r);
}

function presence(conn, name, patch) {
  const r = conn.rooms.get(name); if (!r) return err(conn, 'not_joined', 'Join the room first.', typeof name === 'string' ? name : undefined);
  const m = r.members.get(conn.peer);
  if (!isObj(patch)) return err(conn, 'bad_message', 'patch must be an object.', name);
  if (!m.presRate()) return err(conn, 'rate_limited', 'Presence changes are limited to 20 per second.', name);
  const next = Object.assign({}, m.presence);
  for (const k of Object.keys(patch)) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
  if (JSON.stringify(next).length > PRESENCE_MAX) return err(conn, 'too_large', `Presence must stay under ${PRESENCE_MAX} bytes.`, name);
  m.presence = next; m.updatedAt = Date.now(); m.json = null;
  if (!r.joined.has(m.peer)) r.updated.add(m.peer);
  schedule(r);
}

function emit(conn, name, topic, data) {
  const r = conn.rooms.get(name); if (!r) return err(conn, 'not_joined', 'Join the room first.', typeof name === 'string' ? name : undefined);
  if (typeof topic !== 'string' || !TOPIC_RE.test(topic)) return err(conn, 'bad_message', 'topic must be a short name.', name);
  if (data === undefined) data = null;
  let size; try { size = JSON.stringify(data).length; } catch (e) { size = Infinity; }
  if (size > EMIT_MAX) return err(conn, 'too_large', `Events must be under ${EMIT_MAX} bytes.`, name);
  if (topic === 'chat') {
    const raw = isObj(data) && typeof data.text === 'string' ? data.text : '';
    const t = filter.clean(raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX));
    if (!t) return;
    const now = Date.now();
    if (now - conn.lastChat < 1000) return err(conn, 'rate_limited', 'One chat message per second.', name);
    conn.lastChat = now;
    data = { text: t };
  } else if (!conn.emitRate()) return err(conn, 'rate_limited', 'Too many events. Slow down.', name);
  const msg = JSON.stringify({ t: 'event', room: name, topic, data, peer: conn.peer, by: conn.user.id });
  for (const m of r.members.values()) send(m.conn, msg);
}

/* ---------- connections ---------- */
function onMessage(conn, raw) {
  conn.alive = true;
  if (!conn.msgRate()) { if (Date.now() - conn.warnedAt > 1000) { conn.warnedAt = Date.now(); err(conn, 'rate_limited', 'Too many messages.'); } return; }
  let m; try { m = JSON.parse(raw); } catch (e) { return err(conn, 'bad_message', 'Messages are JSON objects.'); }
  if (!isObj(m)) return err(conn, 'bad_message', 'Messages are JSON objects.');
  switch (m.t) {
    case 'join': return join(conn, m.room, m.presence);
    case 'leave': return leave(conn, m.room);
    case 'presence': return presence(conn, m.room, m.patch);
    case 'emit': return emit(conn, m.room, m.topic, m.data);
    case 'ping': return send(conn, { t: 'pong' });
    default: return err(conn, 'bad_message', 'Unknown message type.');
  }
}

function drop(conn) {
  if (conn.dropped) return; conn.dropped = true;
  clearTimeout(conn.graceTimer);
  for (const name of [...conn.rooms.keys()]) leave(conn, name);
  conns.delete(conn);
  if (byPeer.get(conn.peer) === conn) byPeer.delete(conn.peer);
}

// A new socket from the same page takes over the old connection: same peer id, same rooms.
function takeOver(conn, old) {
  clearTimeout(old.graceTimer); old.replaced = true;
  try { old.ws.terminate(); } catch (e) { /* already gone */ }
  conns.delete(old);
  conn.peer = old.peer; conn.rooms = old.rooms; conn.lastChat = old.lastChat;
  for (const r of conn.rooms.values()) { const m = r.members.get(conn.peer); if (m) m.conn = conn; }
  byPeer.set(conn.peer, conn);
}

async function onConnection(ws, req) {
  const url = new URL(req.url, 'http://x');
  const pending = [];
  const conn = {
    ws, peer: null, user: null, rooms: new Map(), alive: true, lastChat: 0, warnedAt: 0, dropped: false, replaced: false, graceTimer: null,
    msgRate: tokenBucket(60, 120), emitRate: tokenBucket(10, 20),
  };
  ws.on('message', (data, isBinary) => { if (isBinary) return; if (conn.user) onMessage(conn, data.toString()); else if (pending.length < 50) pending.push(data.toString()); });
  ws.on('pong', () => { conn.alive = true; });
  ws.on('error', () => {});
  ws.on('close', code => {
    if (conn.replaced || !conn.user) return;
    // A page that closes or navigates sends a close frame; a socket that just dropped (1006, no close frame)
    // keeps its seat for a moment so the page can reconnect and take it over.
    if (code !== 1006 || conn.dead) drop(conn);
    else conn.graceTimer = setTimeout(() => drop(conn), GRACE_MS);
  });

  let user = null;
  try { user = await auth.userForToken(url.searchParams.get('token')); } catch (e) { user = null; }
  if (ws.readyState !== 1) return;
  if (!user) { err(conn, 'unauthorized', 'Start a session first.'); ws.close(4401, 'unauthorized'); return; }
  let mine = 0; for (const c of conns) if (c.user.id === user.id && !c.dropped) mine++;
  if (mine >= SOCKETS_PER_USER) { err(conn, 'too_many', 'Too many PlayForge pages are open. Close one and reload.'); ws.close(4429, 'too many connections'); return; }

  conn.user = user;
  const old = byPeer.get(url.searchParams.get('replace') || '');
  if (old && old.user.id === user.id && old !== conn) takeOver(conn, old);
  else { conn.peer = newPeerId(); byPeer.set(conn.peer, conn); }
  conns.add(conn);
  send(conn, { t: 'hello', peer: conn.peer, user: { id: user.id, name: user.name } });
  for (const raw of pending.splice(0)) onMessage(conn, raw);
}

/* ---------- server wiring ---------- */
function attach() {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  wss.on('connection', onConnection);
  pingTimer = setInterval(() => {
    for (const c of conns) {
      if (c.graceTimer) continue; // already closed; its grace timer drops it
      if (!c.alive) { c.dead = true; try { c.ws.terminate(); } catch (e) { /* gone */ } drop(c); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch (e) { /* closing */ }
    }
  }, PING_MS);
  pingTimer.unref();
  return wss;
}
function handleUpgrade(req, socket, head) {
  const w = attach();
  w.handleUpgrade(req, socket, head, ws => w.emit('connection', ws, req));
}
// To every open PlayForge socket: {t:'games'}, {t:'likes', key, count}, {t:'player', id}.
function broadcast(msg) {
  const s = JSON.stringify(msg);
  for (const c of conns) if (c.user && !c.dropped) send(c, s);
}
function close() {
  clearInterval(pingTimer);
  for (const c of conns) { try { c.ws.close(1001, 'server shutting down'); } catch (e) { /* gone */ } }
}
const online = name => { const r = rooms.get(name); return r ? r.members.size : 0; };

module.exports = { handleUpgrade, broadcast, close, online, GAME_MAX, _state: { rooms, conns } };
