// Realtime multiplayer: one in-memory room per active world, relaying block edits,
// player positions and chat over WebSocket, and flushing edits to the store.
const crypto = require('crypto');
const store = require('./store');

const DAY_MS = 240000; // matches the client's 240s day/night cycle
const FLUSH_MS = 2000;
const rooms = new Map();
let nextId = 1;

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(6), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 16) || 'Player';

function colorFor(name) {
  const h = crypto.createHash('md5').update(name).digest();
  return [60 + h[0] % 170, 60 + h[1] % 170, 60 + h[2] % 170];
}

async function createWorld() {
  for (;;) {
    const code = newCode();
    if (!(await store.getWorld(code))) return store.createWorld(code);
  }
}

// Loads a world into memory on first join; concurrent joiners share the same promise.
// `joining` counts connections still being set up, so the room isn't closed under them.
function openRoom(code) {
  let r = rooms.get(code);
  if (r) { r.joining++; return r.ready; }
  r = { code, clients: new Map(), edits: new Map(), pending: new Map(), timer: null, joining: 1 };
  r.ready = (async () => {
    const w = await store.getWorld(code);
    if (!w) { rooms.delete(code); return null; }
    r.epoch = w.epoch;
    for (const e of await store.loadEdits(code)) r.edits.set(e.slice(0, 4).join(), e);
    r.timer = setInterval(() => flush(r), FLUSH_MS);
    return r;
  })().catch(e => { rooms.delete(code); throw e; });
  rooms.set(code, r);
  return r.ready;
}

async function flush(r) {
  if (!r.pending.size) return;
  const batch = [...r.pending.values()];
  r.pending.clear();
  try { await store.saveEdits(r.code, batch); }
  catch (e) {
    console.error('save failed', r.code, e.message);
    for (const ed of batch) if (!r.pending.has(ed.slice(0, 4).join())) r.pending.set(ed.slice(0, 4).join(), ed);
  }
}

async function closeIfEmpty(r) {
  if (r.clients.size || r.joining) return;
  await flush(r);
  if (r.clients.size || r.joining || rooms.get(r.code) !== r) return;
  clearInterval(r.timer);
  rooms.delete(r.code);
}

const broadcast = (r, msg, except) => {
  const s = JSON.stringify(msg);
  for (const c of r.clients.values()) if (c !== except && c.ws.readyState === 1) c.ws.send(s);
};

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const validEdit = e => Array.isArray(e) && e.length === 6 && int(e[0], 0, 2) && int(e[1], -3e7, 3e7) &&
  int(e[2], 0, 63) && int(e[3], -3e7, 3e7) && int(e[4], 0, 511) && int(e[5], 0, 1);
const validPos = p => Array.isArray(p) && p.length === 6 && p.slice(0, 5).every(Number.isFinite) && int(p[5], 0, 2);

async function onConnection(ws, req) {
  const url = new URL(req.url, 'http://x');
  const code = cleanCode(url.searchParams.get('room'));
  let r;
  try { r = await openRoom(code); } catch (e) { return ws.close(1011, 'Server error'); }
  if (!r) return ws.close(4000, 'World not found');
  try { await join(r, ws, url); } finally { r.joining--; }
  closeIfEmpty(r);
}

async function join(r, ws, url) {
  const code = r.code;

  const taken = new Set([...r.clients.values()].map(c => c.name));
  const base = cleanName(url.searchParams.get('name'));
  let name = base;
  for (let i = 2; taken.has(name); i++) name = base.slice(0, 13) + ' ' + i;

  const me = { id: nextId++, name, color: colorFor(name), ws, p: null, tokens: 400 };
  const spawn = await store.getPlayer(code, name).catch(() => null);
  if (ws.readyState !== 1) return;
  r.clients.set(me.id, me);

  ws.send(JSON.stringify({
    t: 'welcome', id: me.id, name, spawn,
    day: (0.06 + (Date.now() - r.epoch) / DAY_MS) % 1,
    edits: [...r.edits.values()],
    players: [...r.clients.values()].filter(c => c !== me).map(c => ({ id: c.id, name: c.name, color: c.color, p: c.p })),
  }));
  broadcast(r, { t: 'join', id: me.id, name, color: me.color, p: me.p }, me);

  // simple token bucket so one client can't flood the room with edits
  const refill = setInterval(() => { me.tokens = Math.min(400, me.tokens + 100); }, 1000);

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'pos' && validPos(m.p)) {
      me.p = m.p;
      broadcast(r, { t: 'pos', id: me.id, p: m.p }, me);
    } else if (m.t === 'edits' && Array.isArray(m.e)) {
      const ok = m.e.filter(validEdit).slice(0, me.tokens);
      me.tokens -= ok.length;
      for (const e of ok) {
        const k = e.slice(0, 4).join();
        r.edits.set(k, e);
        r.pending.set(k, e);
      }
      if (ok.length) broadcast(r, { t: 'edits', e: ok }, me);
    } else if (m.t === 'chat' && typeof m.m === 'string' && m.m.trim()) {
      broadcast(r, { t: 'chat', name: me.name, m: m.m.trim().slice(0, 200) });
    }
  });

  ws.on('close', async () => {
    clearInterval(refill);
    r.clients.delete(me.id);
    broadcast(r, { t: 'leave', id: me.id });
    if (me.p) await store.savePlayer(code, name, me.p).catch(e => console.error('player save failed', e.message));
    closeIfEmpty(r);
  });
}

async function flushAll() {
  await Promise.all([...rooms.values()].map(flush));
}

const online = code => rooms.get(code)?.clients.size || 0;

module.exports = { createWorld, onConnection, flushAll, online, cleanCode };
