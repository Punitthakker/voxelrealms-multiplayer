// Live rooms over one WebSocket per page (/pf-ws, protocol in playforge/WEBAPP.md).
// RoomClient has the same interface as the claude.ai room capability, so engine/net.js keeps its logic:
//   name, presence(patch) -> Promise, emit(topic, data) -> Promise, on(topic, fn, onError) -> unsubscribe,
//   onPeers(fn, onError) -> unsubscribe (fn gets {peers, joined, left, updated}), peers(), connected(),
//   onConnection(fn, onError) -> unsubscribe (fn gets true / false), join(name, presence?) -> Promise<RoomClient>, leave() -> Promise.
// join's optional presence goes out with the join message itself, so the room never sees this member without it.
// Peers: {peer, by, isMe, sameTab, kind: 'viewer', guest: false, presence, updatedAt}.
//
// The socket reconnects by itself (1 s, 2 s, 4 s ... 15 s). A reconnecting page asks the server to hand it its
// previous connection (same peer id, same rooms), rejoins every room and re-sends its whole presence, so other
// players see at most a short pause. Presence patches are merged and sent at most 20 times a second.
import { getSession, getUser, onSessionChanged, renewSession } from './session.js';

const JOIN_TIMEOUT = 15000, HEARTBEAT = 25000, SILENT_LIMIT = 65000, MAX_BACKOFF = 15000, PRESENCE_MS = 50;
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const later = fn => setTimeout(fn, 0);
const roomError = (code, message) => Object.assign(new Error(message), { code });
const safe = (fn, ...a) => { try { fn(...a); } catch (e) { console.error(e); } };

export class RoomClient {
  constructor(conn, name, persistent) {
    this.name = name;
    this._c = conn; this._persistent = !!persistent;
    this._presence = {}; this._pending = null; this._sendTimer = 0; this._lastSend = 0;
    this._peers = new Map(); this._have = false; this._left = false; this._sentOn = -1; this._liveOn = -1;
    this._peerL = new Set(); this._topicL = new Map(); this._connL = new Set(); this._errL = new Set();
    this._ready = null; this._resolve = null; this._reject = null; this._joinTimer = 0;
  }
  // ---- the room capability interface ----
  presence(patch) {
    if (this._left) return Promise.reject(roomError('left', 'This room was left.'));
    if (!isObj(patch)) return Promise.reject(roomError('invalid_argument', 'presence() takes an object.'));
    for (const k of Object.keys(patch)) { if (patch[k] === null) delete this._presence[k]; else this._presence[k] = patch[k]; }
    this._pending = Object.assign(this._pending || {}, patch);
    this._schedule();
    return Promise.resolve();
  }
  emit(topic, data) {
    if (this._left) return Promise.reject(roomError('left', 'This room was left.'));
    if (!this.connected()) return Promise.reject(roomError('disconnected', 'Not connected right now.'));
    this._c.send({ t: 'emit', room: this.name, topic: String(topic), data: data === undefined ? null : data });
    return Promise.resolve();
  }
  on(topic, fn, onError) {
    let s = this._topicL.get(topic); if (!s) this._topicL.set(topic, s = new Set());
    s.add(fn); if (onError) this._errL.add(onError);
    return () => { s.delete(fn); if (onError) this._errL.delete(onError); };
  }
  onPeers(fn, onError) {
    this._peerL.add(fn); if (onError) this._errL.add(onError);
    // A late subscriber gets the room as it is now, as if everyone had just joined.
    if (this._have) later(() => { if (this._peerL.has(fn) && this._have) { const peers = this.peers(); safe(fn, { peers, joined: peers, left: [], updated: [] }); } });
    return () => { this._peerL.delete(fn); if (onError) this._errL.delete(onError); };
  }
  peers() { return [...this._peers.values()]; }
  connected() { return !this._left && this._c.open && this._liveOn === this._c.gen; }
  onConnection(fn, onError) {
    this._connL.add(fn); if (onError) this._errL.add(onError);
    later(() => { if (this._connL.has(fn)) safe(fn, this.connected()); });
    return () => { this._connL.delete(fn); if (onError) this._errL.delete(onError); };
  }
  join(name, presence) { return this._c.join(name, presence); }
  // Sends a waiting presence change now instead of after the usual short delay (the page is being hidden).
  flush() { if (this._left) return; if (this._sendTimer) { clearTimeout(this._sendTimer); this._sendTimer = 0; } this._flush(); }
  leave() {
    if (this._left) return Promise.resolve();
    this._left = true; clearTimeout(this._sendTimer); clearTimeout(this._joinTimer);
    this._c.forget(this);
    if (this._reject) { this._reject(roomError('left', 'Left before the room opened.')); this._resolve = this._reject = null; }
    this._peerL.clear(); this._topicL.clear(); this._connL.clear(); this._errL.clear(); this._peers.clear();
    return Promise.resolve();
  }

  // ---- internals ----
  _schedule() {
    if (this._sendTimer) return;
    this._sendTimer = setTimeout(() => this._flush(), Math.max(0, PRESENCE_MS - (Date.now() - this._lastSend)));
  }
  _flush() {
    this._sendTimer = 0;
    const patch = this._pending; if (!patch) return;
    this._pending = null;
    // Not connected: the whole presence goes out with the next join instead.
    if (!this._c.open || this._sentOn !== this._c.gen) return;
    this._lastSend = Date.now();
    this._c.send({ t: 'presence', room: this.name, patch });
  }
  _sendJoin() {
    this._sentOn = this._c.gen; this._pending = null; clearTimeout(this._sendTimer); this._sendTimer = 0;
    this._c.send({ t: 'join', room: this.name, presence: this._presence });
  }
  _onPeers(m) {
    if (!Array.isArray(m.peers)) return;
    const me = getUser(), myPeer = this._c.peer, next = new Map(), joined = [], updated = [];
    for (const raw of m.peers) {
      if (!raw || typeof raw.peer !== 'string') continue;
      const old = this._peers.get(raw.peer);
      // Keep the same object while nothing changed, so `presence === lastPresence` checks work.
      if (old && old.updatedAt === raw.updatedAt && old.sameTab === (raw.peer === myPeer)) { next.set(raw.peer, old); continue; }
      const p = Object.freeze({
        peer: raw.peer, by: raw.by, isMe: !!(me && raw.by === me.id), sameTab: raw.peer === myPeer, kind: 'viewer', guest: false,
        presence: Object.freeze(isObj(raw.presence) ? raw.presence : {}), updatedAt: raw.updatedAt,
      });
      next.set(p.peer, p);
      (old ? updated : joined).push(p);
    }
    // After a reconnect the first snapshot is diffed against what we had, so players who stayed don't flicker.
    const left = [...this._peers.values()].filter(p => !next.has(p.peer));
    const first = !this._have, fresh = this._liveOn !== this._c.gen;
    this._peers = next; this._have = true; this._liveOn = this._c.gen;
    if (first) { clearTimeout(this._joinTimer); if (this._resolve) { this._resolve(this); this._resolve = this._reject = null; } }
    if (joined.length || left.length || updated.length || first) {
      const ch = { peers: this.peers(), joined, left, updated };
      this._peerL.forEach(fn => safe(fn, ch));
    }
    if (fresh) { this._connL.forEach(fn => safe(fn, true)); if (this._pending) this._schedule(); }
  }
  _onEvent(m) {
    const s = this._topicL.get(m.topic); if (!s || !s.size) return;
    const me = getUser();
    const ev = { peer: m.peer, by: m.by, isMe: !!(me && m.by === me.id), sameTab: m.peer === this._c.peer, kind: 'viewer', guest: false, topic: m.topic, data: m.data };
    s.forEach(fn => safe(fn, ev));
  }
  _onError(m) {
    if (m.code === 'not_joined') { if (this._c.open && this._liveOn === this._c.gen) this._sendJoin(); return; } // the server lost us: join again
    if (this._persistent) return;
    // A join that failed (full, or a rejoin after a reconnect found the room full) loses the room; on a live room
    // rate_limited / too_large only mean that one patch or event was dropped.
    const joinFailed = m.code === 'full' || m.code === 'bad_room' || m.code === 'too_many_rooms' || !this._have;
    if (!joinFailed || this._liveOn === this._c.gen) return;
    this._fail(roomError(m.code || 'error', m.message || 'Could not join the room.'));
  }
  _fail(e) {
    const rej = this._reject; this._resolve = this._reject = null;
    const errs = [...this._errL];
    this.leave();
    if (rej) rej(e);
    errs.forEach(fn => safe(fn, e));
  }
  _disconnected(gen) {
    if (this._liveOn === gen) this._connL.forEach(fn => safe(fn, false));
  }
}

class Connection {
  constructor() {
    this.ws = null; this.open = false; this.gen = 0; this.peer = null; this.prevPeer = null;
    this.rooms = new Map(); this.serverL = new Set();
    this.backoff = 1000; this.retryTimer = 0; this.started = false; this.lastMsgAt = 0; this.hbTimer = 0; this.hellos = 0;
    this._lobby = null;
  }
  start() {
    if (this.started) return; this.started = true;
    window.addEventListener('online', () => this.kick());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
    onSessionChanged(() => { this.prevPeer = null; this.reset(); });
    this.connect();
  }
  // Reconnect now instead of waiting for the back-off timer (the network came back, the page is visible again).
  kick() { if (this.started && !this.ws && this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = 0; this.backoff = 1000; this.connect(); } }
  url() {
    const s = getSession();
    let u = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/pf-ws?token=${encodeURIComponent(s.token)}`;
    if (this.prevPeer) u += '&replace=' + encodeURIComponent(this.prevPeer);
    return u;
  }
  connect() {
    this.retryTimer = 0;
    if (this.ws) return;
    if (!getSession()) { this.retry(); return; }
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { this.retry(); return; }
    this.ws = ws;
    ws.onmessage = ev => { if (this.ws === ws) this.onMessage(ev.data); };
    ws.onclose = ev => { if (this.ws === ws) this.onClose(ev.code); };
    ws.onerror = () => {};
  }
  retry(ms) {
    if (this.retryTimer) return;
    const wait = ms || this.backoff;
    this.backoff = Math.min(MAX_BACKOFF, this.backoff * 2);
    this.retryTimer = setTimeout(() => this.connect(), wait * (0.8 + Math.random() * 0.4));
  }
  // Drop the socket and connect again (a silent connection, or a new session token).
  reset() {
    const ws = this.ws;
    if (ws) { ws.onclose = null; ws.onmessage = null; try { ws.close(4000, 'reconnect'); } catch (e) { /* closed */ } this.onClose(0); }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = 0; }
    this.connect();
  }
  onClose(code) {
    const wasOpen = this.open;
    this.ws = null; this.open = false; clearInterval(this.hbTimer); this.hbTimer = 0;
    if (wasOpen) {
      for (const r of this.rooms.values()) r._disconnected(this.gen);
      this.serverL.forEach(fn => safe(fn, { t: 'disconnected' }));
    }
    if (code === 4401) { renewSession().then(() => this.retry(500), () => this.retry()); return; }
    if (code === 4429) { this.retry(30000); return; }
    if (code !== 0) this.retry();
  }
  send(m) { if (this.ws && this.open && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  onMessage(raw) {
    this.lastMsgAt = Date.now();
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!isObj(m)) return;
    const r = typeof m.room === 'string' ? this.rooms.get(m.room) : null;
    switch (m.t) {
      case 'hello': return this.onHello(m);
      case 'peers': if (r) r._onPeers(m); return;
      case 'event': if (r) r._onEvent(m); return;
      case 'error': if (r) r._onError(m); return;
      case 'pong': return;
      default: this.serverL.forEach(fn => safe(fn, m)); // {t:'games'}, {t:'likes', key, count}, {t:'player', id}
    }
  }
  onHello(m) {
    this.peer = m.peer; this.prevPeer = m.peer; this.open = true; this.gen++; this.backoff = 1000; this.hellos++;
    clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      if (Date.now() - this.lastMsgAt > SILENT_LIMIT) { this.reset(); return; }
      this.send({ t: 'ping' });
    }, HEARTBEAT);
    for (const r of this.rooms.values()) r._sendJoin();
    // Listeners hear about every (re)connect, so they can reload what they may have missed while away.
    const ev = { t: 'connected', reconnect: this.hellos > 1 };
    this.serverL.forEach(fn => safe(fn, ev));
  }
  join(name, presence) {
    name = String(name);
    const cur = this.rooms.get(name);
    if (cur && !cur._left) { if (isObj(presence)) cur.presence(presence); return cur._ready; }
    const r = new RoomClient(this, name, name === 'lobby');
    if (isObj(presence)) for (const k of Object.keys(presence)) if (presence[k] !== null && presence[k] !== undefined) r._presence[k] = presence[k];
    r._ready = new Promise((res, rej) => { r._resolve = res; r._reject = rej; });
    r._ready.catch(() => {}); // a failed join is reported to the caller that awaits it
    this.rooms.set(name, r);
    if (!r._persistent) r._joinTimer = setTimeout(() => { if (!r._have && !r._left) r._fail(roomError('timeout', 'The game room did not answer.')); }, JOIN_TIMEOUT);
    if (this.open) r._sendJoin();
    return r._ready;
  }
  forget(r) {
    if (this.rooms.get(r.name) === r) this.rooms.delete(r.name);
    if (this.open && r._sentOn === this.gen) this.send({ t: 'leave', room: r.name });
  }
  // The lobby: everyone with PlayForge open. It is created at once and connects whenever the server is reachable.
  lobby() {
    if (!this._lobby || this._lobby._left) { this.join('lobby'); this._lobby = this.rooms.get('lobby'); }
    return this._lobby;
  }
  onServer(fn) { this.serverL.add(fn); return () => this.serverL.delete(fn); }
}

let conn = null;
export function getConnection() { if (!conn) conn = new Connection(); return conn; }
// Server broadcasts to every page: {t:'games'}, {t:'likes', key, count}, {t:'player', id}, plus
// {t:'connected', reconnect} each time the socket (re)connects and {t:'disconnected'} when it drops.
export function onServer(fn) { return getConnection().onServer(fn); }
