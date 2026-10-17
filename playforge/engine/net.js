import { Caps, IS_TOUCH, LS, Me, Profile, SK, STARTERS, Settings, Sfx, WordFilter, clamp, ctx2d, defaultStarterIndex, drawPngTo, hashStr, lerp, newSkinCanvas, toast, validPng } from './core.js';
import { createStore, gameStore, platformStore } from './stores.js';
import { Engine } from './render.js';
import { createAvatar, makeSkinTexture } from './avatar.js';
import { Phys } from './physics.js';
import { World } from './world.js';
import { Game, callMode } from './game.js';
import { STARTER_CANVASES, Skins } from './skins.js';

/* ---------- 14b. Multiplayer: game rooms, presence, chat, players ---------- */
// No DOM in here. Net keeps the room logic (presence, interpolation, host election, Shared state and acts) and
// writes what the screen shows into two stores:
//   netStore   the game room: chat lines, unread count, players list, connection state (components/playforge/game)
//   lobbyStore "N online" per game, from everyone's lobby presence (the home screen)
// React calls back with Net.send, Net.setChatOpen, Net.focusChat, Net.toggleMute, Net.reportTarget, Net.sendReport.
export const MAX_PLAYERS = 10, CHAT_MAX = 150, CHAT_KEEP = 50, INTERP_MS = 140;
// After our own connection dropped, players missing from the room are kept this long in case they are only
// reconnecting too (a server restart gives everyone a new peer id). Covers the client's reconnect back-off.
const GHOST_MS = 20000;
export const NAME_COLORS = ['#FFB38A', '#FFD86B', '#8FE3C0', '#9CC2FF', '#D9B8FF', '#FF9EB5', '#A7F07A', '#7FE7F2'];
export const MY_COLOR = '#FF9F6E';
export const REPORT_REASONS = [['language', 'Bad language'], ['bullying', 'Bullying or being mean'], ['name', 'Inappropriate name or skin'], ['cheating', 'Cheating or griefing'], ['other', 'Something else']];
export const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,120}$/;
export const r2 = v => Math.round(v * 100) / 100;
export function lerpAngle(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
// Names and messages from other players are untrusted: re-check them on arrival.
export function cleanNick(v) {
  if (typeof v !== 'string') return '';
  v = v.replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9 _.-]{3,20}$/.test(v) && !WordFilter.hasBad(v) ? v : '';
}
// Account names come from the server; keep them short and filtered all the same.
const cleanName = v => (typeof v === 'string' ? WordFilter.clean(v.replace(/\s+/g, ' ').trim().slice(0, 40)) : '');
export const colorFor = key => NAME_COLORS[hashStr(String(key)) % NAME_COLORS.length];

//   inRoom: joined a game room (chat button, players list)    phase: 'off' | 'connecting' | 'live' | 'solo'
//   lines: [{id, key, name, text, color, mine, system}]        players: [{id, key, me, name, host, guest, sameUser, muted, away, skin, ver}]
export const netStore = createStore({
  inRoom: false, phase: 'off', status: '', lines: [], unread: 0, chatOpen: false, canChat: true, note: '', focusSeq: 0,
  players: [], count: 'Solo', empty: '', canReport: false, mutes: [],
});
//   live: the lobby is connected right now (show "N online"; while false, hide the counts: they may be stale)
//   counts: {gameId: players in that game right now}
export const lobbyStore = createStore({ live: false, counts: {} });

// Platform helpers the platform layer (playforge/client/platform.js) puts on Caps; the engine runs without them:
//   Caps.players {getPlayer(id) -> {id, name, nick, skin} | null, onPlayerChanged(fn(id)) -> unsubscribe}
//   Caps.report({target, targetNick, game, reason, note, recent})
// Without them other players wear starter skins and the Report button stays hidden.
function playerDirectory() {
  const c = Caps.players;
  return c && typeof c.getPlayer === 'function' ? c : null;
}
// The lobby room (everyone with PlayForge open), once the platform layer has started. Null without one: solo play.
async function lobbyRoom() {
  if (Caps.room) return Caps.room;
  if (Caps.roomP && typeof Caps.roomP.then === 'function') {
    try { return (await Caps.roomP) || Caps.room || null; } catch (e) { return null; }
  }
  const t0 = Date.now();
  while (!Caps.ready && !Caps.room && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 120));
  return Caps.room || null;
}

// Another player's avatar in this game room.
export class Remote {
  constructor(p) {
    this.peer = p.peer; this.by = p.by && ID_RE.test(p.by) ? p.by : null; this.guest = !!p.guest; this.sameUser = !!p.isMe;
    this.canvas = newSkinCanvas(); this.tex = makeSkinTexture(this.canvas); this.skinFromDb = false; this.st = -1; this.skinVer = 0;
    this.nick = ''; this.dbNick = ''; this.dbName = ''; this.pnm = ''; this.displayName = 'Player'; this.jt = Infinity; this.lastChat = 0; this.recent = [];
    this.samples = []; this.off = null; this.lastPr = null; this.t = 0; this.loadSeq = 0; this.disposed = false;
    this.sc = 0; this.x = null; this.gs = null; this.gsn = -1; this.lastAct = -1; this.away = false;
    this.avatar = createAvatar(this.tex, 'Player'); this.avatar.root.visible = false; if (World.scene) World.scene.add(this.avatar.root);
    this.setStarter(hashStr(this.peer) % STARTERS.length);
    this.ready = this.by ? this.loadProfile() : Promise.resolve();
    this.refreshName();
  }
  get key() { return this.by || 'peer:' + this.peer; }
  setStarter(i) {
    if (this.skinFromDb || i === this.st || !STARTER_CANVASES[i]) return;
    this.st = i; const g = ctx2d(this.canvas); g.clearRect(0, 0, SK, SK); g.drawImage(STARTER_CANVASES[i], 0, 0); this.tex.needsUpdate = true;
    this.skinVer++; Net.playersDirty();
  }
  // Their saved skin and name come from the server's player directory. Net reloads them when they save a change.
  async loadProfile() {
    if (!this.by || this.disposed) return;
    const seq = ++this.loadSeq;
    let d = null;
    try { const dir = playerDirectory(); if (!dir) return; d = await dir.getPlayer(this.by); }
    catch (e) { return; } // keep the starter skin
    if (seq !== this.loadSeq || this.disposed || !d) return;
    if (validPng(d.skin)) {
      if (await drawPngTo(this.canvas, d.skin) && !this.disposed) { this.skinFromDb = true; this.tex.needsUpdate = true; this.skinVer++; }
    } else if (this.skinFromDb) {
      this.skinFromDb = false; const st = this.st; this.st = -1; this.setStarter(st >= 0 ? st : hashStr(this.peer) % STARTERS.length);
    }
    this.dbNick = cleanNick(d.nick); this.dbName = cleanName(d.name);
    this.refreshName(); Net.playersDirty();
  }
  refreshName() {
    const n = (this.dbNick || this.nick || this.dbName || this.pnm || 'Player').slice(0, 40);
    if (n !== this.displayName) { this.displayName = n; this.avatar.setName(n); Net.playersDirty(); }
    return n;
  }
  onPresence(p) {
    const pr = p.presence || {}; if (pr === this.lastPr) return; this.lastPr = pr;
    if (!this.by && typeof pr.uid === 'string' && ID_RE.test(pr.uid)) { this.by = pr.uid; this.ready = this.loadProfile(); }
    if (Number.isInteger(pr.st) && pr.st >= 0 && pr.st < STARTERS.length) this.setStarter(pr.st);
    const nk = cleanNick(pr.nk); if (nk !== this.nick) { this.nick = nk; this.refreshName(); }
    const nm = cleanNick(pr.nm); if (nm !== this.pnm) { this.pnm = nm; this.refreshName(); }
    if (Number.isFinite(pr.jt)) this.jt = pr.jt;
    const away = pr.aw === 1; if (away !== this.away) { this.away = away; Net.playersDirty(); }
    this.sc = Number.isFinite(pr.sc) ? pr.sc : 0;
    this.x = pr.x && typeof pr.x === 'object' ? pr.x : null;
    if (pr.gs && typeof pr.gs === 'object' && Number.isFinite(pr.gsn)) { this.gs = pr.gs; this.gsn = pr.gsn; }
    if (Array.isArray(pr.act)) {
      const acts = pr.act.filter(a => a && Number.isFinite(a.n) && typeof a.k === 'string');
      if (this.lastAct < 0) this.lastAct = acts.reduce((m, a) => Math.max(m, a.n), 0); // ignore actions from before we met
      else for (const a of acts) if (a.n > this.lastAct) { this.lastAct = a.n; Shared.incoming.push({ from: this, k: a.k.slice(0, 24), d: a.d }); }
    } else if (this.lastAct < 0) this.lastAct = 0;
    const q = pr.p;
    if (Array.isArray(q) && q.length === 3 && q.every(v => Number.isFinite(v) && Math.abs(v) < 5000) && Number.isFinite(pr.t)) {
      // Map the sender's clock onto ours with a slowly drifting offset, then buffer the sample.
      const d = Date.now() - pr.t;
      this.off = this.off === null ? d : d < this.off ? d : this.off + (d - this.off) * 0.05;
      const s = { t: pr.t + this.off, x: q[0], y: q[1], z: q[2], r: Number.isFinite(pr.r) ? pr.r : 0, sp: clamp(Number(pr.s) || 0, 0, 1.5), g: pr.m !== 1 };
      const last = this.samples[this.samples.length - 1];
      if (!last || s.t > last.t) { this.samples.push(s); if (this.samples.length > 30) this.samples.shift(); }
      this.avatar.root.visible = true;
    }
  }
  // Render INTERP_MS behind real time so there are two samples to blend between.
  update(dt, rt) {
    const S = this.samples; this.t += dt; if (!S.length) return;
    let i = S.length - 1; while (i > 0 && S[i].t > rt) i--;
    const a = S[i], b = S[i + 1]; let x = a.x, y = a.y, z = a.z, r = a.r, sp = rt - a.t > 400 ? 0 : a.sp, g = a.g;
    if (b && rt >= a.t) {
      const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
      x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k); z = lerp(a.z, b.z, k); r = lerpAngle(a.r, b.r, k); sp = lerp(a.sp, b.sp, k); g = k < 0.5 ? a.g : b.g;
    } else if (!b && i > 0 && rt > a.t && a.sp > 0.05) {
      const pv = S[i - 1], k = clamp(rt - a.t, 0, 80) / Math.max(1, a.t - pv.t);
      x = a.x + (a.x - pv.x) * k; y = a.y + (a.y - pv.y) * k; z = a.z + (a.z - pv.z) * k;
    }
    this.avatar.root.position.set(x, y, z); this.avatar.root.rotation.y = r;
    this.avatar.animate(dt, { speed: sp, grounded: g, t: this.t });
  }
  say(text) { if (Settings.bubbles) this.avatar.say(text); }
  dispose() {
    this.disposed = true; clearTimeout(this.ghostTimer); this.ghostTimer = 0;
    if (this.avatar.root.parent) this.avatar.root.parent.remove(this.avatar.root);
    this.avatar.dispose(); this.tex.dispose();
  }
}

export const Net = {
  lobby: null, room: null, leaving: null, gameId: null, token: 0, joinedAt: 0, jt: 0, remotes: new Map(), myPeer: null, hostPeer: null,
  lastSendAt: 0, lastSent: null, lines: [], lineSeq: 0, unread: 0, lastChatAt: 0, chatOpen: false, canChat: true, unsubs: [], lobbyPeers: [], lobbyLive: false,
  mutes: new Set((LS.get('pf.v1.mutes', []) || []).filter(k => typeof k === 'string')), dirtyQueued: false, retried: false,
  discTimer: 0, noteTimer: 0, phase: 'off', focusSeq: 0, meVer: 0, started: false, downAt: 0, upAt: 0,
  // Once, at engine start-up (index.js): connects the lobby when the platform layer has one, and follows profile changes.
  start() {
    if (this.started) return; this.started = true;
    netStore.set({ mutes: [...this.mutes] });
    Profile.onChange(() => {
      if (Game.avatar) Game.avatar.setName(Profile.displayName());
      this.meVer++; this.updateIdentity(); this.playersDirty();
    });
    lobbyRoom().then(room => { if (room) this.initLobby(room); });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.onVisibility());
    // A game that went solo because the server was away joins its room once the server answers again.
    let was = platformStore.get().connected;
    platformStore.subscribe(s => { const now = !!s.connected; if (now && !was) this.rejoinSolo(); was = now; });
  },
  rejoinSolo() {
    const gid = this.gameId;
    if (this.phase !== 'solo' || !gid || this.room || !Game.active || (Game.opts && Game.opts.test) || Engine.mode !== 'game') return;
    this.join(gid);
  },
  title() { return (Game.def && Game.def.title) || (World.def && World.def.title) || 'this game'; },

  // ---- lobby: everyone with the page open; used for "N online" on tiles ----
  initLobby(room) {
    if (this.lobby || !room) return; this.lobby = room;
    try { room.onPeers(ch => { this.lobbyPeers = (ch && ch.peers) || []; this.publishLobby(); }, () => { this.lobbyPeers = []; this.publishLobby(); }); } catch (e) { /* optional */ }
    // The platform's lobby exists even while the server is away; it is live only while connected.
    if (typeof room.onConnection === 'function') {
      try { room.onConnection(c => { this.lobbyLive = !!c; this.publishLobby(); }, () => {}); } catch (e) { this.lobbyLive = true; }
    } else this.lobbyLive = true;
    this.setLobbyGame(this.gameId);
    this.publishLobby();
  },
  setLobbyGame(g) { if (this.lobby) Promise.resolve(this.lobby.presence({ v: 1, g: g || null })).catch(() => {}); },
  onlineCount(gameId) {
    const seen = new Set();
    for (const p of this.lobbyPeers) if (p.kind === 'viewer' && p.presence && p.presence.g === gameId) seen.add(p.peer);
    return seen.size;
  },
  publishLobby() {
    const seen = new Set(), counts = {};
    for (const p of this.lobbyPeers) {
      const g = p && p.kind === 'viewer' && p.presence && p.presence.g;
      if (typeof g !== 'string' || seen.has(g + '\n' + p.peer)) continue;
      seen.add(g + '\n' + p.peer); counts[g] = (counts[g] || 0) + 1;
    }
    const prev = lobbyStore.get().counts;
    lobbyStore.set({ live: !!this.lobbyLive, counts: JSON.stringify(prev) === JSON.stringify(counts) ? prev : counts });
  },

  // ---- joining and leaving a game room ----
  enterGame(gameId) { this.retried = false; return this.join(gameId); },
  async join(gameId) {
    this.leave();
    const token = ++this.token; this.gameId = gameId; this.jt = Date.now(); this.joinedAt = performance.now(); this.canChat = true;
    this.away = typeof document !== 'undefined' && !!document.hidden;
    this.setPhase('connecting');
    const lobby = await lobbyRoom();
    await this.leaving; // a quick rejoin must not get back the room that is still closing
    if (token !== this.token) return;
    if (!lobby) { this.setPhase('solo'); return; } // no rooms: play solo, chat stays hidden
    this.initLobby(lobby);
    // The platform already knows the server is unreachable: play solo now; start() joins when it answers.
    if (Caps.ready && Caps.online === false) { this.setPhase('solo'); return; }
    let r;
    // Who we are (with our join time) goes out with the join itself, so the players already in the room never
    // see us without a join time (that would make both sides think they are the host for a moment).
    try { r = await lobby.join(gameId, this.identity()); }
    catch (e) {
      if (token !== this.token) return;
      this.setPhase('solo');
      if (e && e.code === 'full') { toast(`${this.title()} is full (${MAX_PLAYERS} players). Try again soon.`, true); Game.leave(); }
      else toast('Multiplayer is not available right now, so you are playing solo.');
      return;
    }
    if (token !== this.token) {
      // A newer join of the same room gets this same room object: leave it only when nobody wants it any more.
      if (this.room !== r && !(this.gameId === gameId && this.phase === 'connecting')) Promise.resolve(r.leave()).catch(() => {});
      return;
    }
    this.room = r; this.joinedAt = performance.now(); this.setLobbyGame(gameId);
    // Take in the players already here before anything else runs: until then this page would count itself
    // alone in the room and act as the host. (The onPeers subscription below delivers them again; harmless.)
    if (typeof r.peers === 'function') { const now = r.peers(); if (now.length) this.onPeers({ peers: now, joined: now, left: [], updated: [] }); }
    this.unsubs.push(r.onPeers(ch => this.onPeers(ch), e => this.onRoomLost(e, token)));
    this.unsubs.push(r.on('chat', m => this.onChat(m), () => {}));
    if (typeof r.onConnection === 'function') this.unsubs.push(r.onConnection(c => this.onConnection(c), () => {}));
    this.watchDirectory(token);
    this.sendPresence(true);
    this.setPhase('live');
    this.system(`You joined ${this.title()}. Be kind, and never share personal info like your address or school.`);
    if (!IS_TOUCH && innerWidth >= 900) this.setChatOpen(true);
    setTimeout(() => { if (token === this.token) this.checkFull(); }, 2500);
  },
  setPhase(phase) {
    this.phase = phase; const inRoom = !!this.room;
    netStore.set({ phase, inRoom, canChat: this.canChat });
    gameStore.set({ mp: inRoom });
    this.playersDirty();
  },
  leave() {
    this.token++;
    this.unsubs.forEach(u => { try { if (typeof u === 'function') u(); } catch (e) { /* already closed */ } }); this.unsubs = [];
    if (this.room) {
      const room = this.room; this.room = null;
      try { this.leaving = Promise.resolve(room.leave()).catch(() => {}); } catch (e) { this.leaving = null; }
    }
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear(); this.lines = []; this.unread = 0; this.myPeer = null; this.hostPeer = null; this.lastSent = null; this.gameId = null; this.score = 0; this.pubJson = 'null';
    this.downAt = 0; this.upAt = 0;
    clearTimeout(this.discTimer); clearTimeout(this.noteTimer);
    this.setLobbyGame(null); this.chatOpen = false; this.canChat = true;
    netStore.set({ status: '', note: '', lines: [], unread: 0, chatOpen: false });
    gameStore.set({ chatOpen: false });
    this.setPhase('off');
  },
  onRoomLost(e, token) {
    if (token !== this.token) return;
    const gid = this.gameId, code = e && e.code;
    this.leave(); this.gameId = gid; this.setPhase('solo');
    toast('Lost the connection to the game room. You are playing solo.', true);
    if (code !== 'not_permitted' && !this.retried) {
      this.retried = true;
      setTimeout(() => { if (Engine.mode === 'game' && Game.active && this.gameId === gid && !this.room) this.join(gid); }, 2000);
    }
  },
  onConnection(c) {
    clearTimeout(this.discTimer);
    if (c) { netStore.set({ status: '' }); if (this.downAt) this.upAt = Date.now(); }
    else { this.downAt = Date.now(); this.discTimer = setTimeout(() => netStore.set({ status: 'Reconnecting…' }), 2000); }
  },
  // True from a drop of our connection until GHOST_MS after it came back.
  recovering() { return !!this.downAt && (this.upAt < this.downAt || Date.now() - this.upAt < GHOST_MS); },
  onPeers(ch) {
    const settled = performance.now() - this.joinedAt > 2500, recovering = this.recovering();
    for (const p of ch.left || []) {
      const r = this.remotes.get(p.peer); if (!r) continue;
      // Missing after our reconnect: probably reconnecting too. Keep their avatar a moment (see findGhost).
      if (recovering && r.by) { this.ghost(r); continue; }
      this.dropRemote(r);
    }
    for (const p of ch.joined || []) this.upsert(p, settled);
    for (const p of ch.updated || []) this.upsert(p, false);
    this.electHost(settled && !recovering); this.playersDirty();
  },
  dropRemote(r) { this.system(`${r.displayName} left`); r.dispose(); this.remotes.delete(r.peer); },
  ghost(r) {
    if (r.ghostTimer) return;
    r.ghostTimer = setTimeout(() => {
      r.ghostTimer = 0;
      if (this.remotes.get(r.peer) !== r) return;
      this.dropRemote(r); this.electHost(true); this.playersDirty();
    }, GHOST_MS);
  },
  // The same player back under a new peer id: same user and the same join time.
  findGhost(p) {
    const jt = p.presence && p.presence.jt;
    for (const r of this.remotes.values()) if (r.ghostTimer && r.by && r.by === p.by && Number.isFinite(jt) && r.jt === jt) return r;
    return null;
  },
  upsert(p, announce) {
    if (p.kind !== 'viewer') return;
    if (p.sameTab) {
      // Our own new peer id after a reconnect: if we were the host, we still are.
      if (this.myPeer && this.myPeer !== p.peer && this.hostPeer === this.myPeer) this.hostPeer = p.peer;
      this.myPeer = p.peer; return;
    }
    let r = this.remotes.get(p.peer);
    if (!r) {
      const g = this.findGhost(p);
      if (g) {
        clearTimeout(g.ghostTimer); g.ghostTimer = 0;
        this.remotes.delete(g.peer); if (this.hostPeer === g.peer) this.hostPeer = p.peer;
        g.peer = p.peer; this.remotes.set(p.peer, g); g.onPresence(p);
        return;
      }
      if (this.remotes.size >= 30) return;
      r = new Remote(p); this.remotes.set(p.peer, r);
      if (announce) {
        const rr = r;
        Promise.race([rr.ready, new Promise(res => setTimeout(res, 1500))]).then(() => { if (this.remotes.get(rr.peer) === rr) this.system(`${rr.displayName} joined`); });
      }
    }
    r.onPresence(p);
  },
  // Other players' skins and names change while they play (they save in the avatar editor): reload them.
  watchDirectory(token) {
    const dir = playerDirectory();
    if (!dir || typeof dir.onPlayerChanged !== 'function' || token !== this.token) return;
    const un = dir.onPlayerChanged(x => {
      const id = typeof x === 'string' ? x : x && x.id;
      for (const r of this.remotes.values()) if (r.by && r.by === id) r.loadProfile();
    });
    if (token !== this.token) { try { if (typeof un === 'function') un(); } catch (e) { /* closed */ } return; }
    this.unsubs.push(un);
  },
  // The earliest joiner hosts the shared game state; when they leave, the next earliest takes over.
  // Players whose page is hidden (away) can't run the shared state, so they host only when everyone is away.
  electHost(announce) {
    if (!this.room) { this.hostPeer = null; return; }
    const all = [];
    if (this.myPeer) all.push({ peer: this.myPeer, jt: this.jt, away: !!this.away });
    for (const r of this.remotes.values()) all.push({ peer: r.peer, jt: r.jt, away: r.away });
    const pool = all.some(c => !c.away) ? all.filter(c => !c.away) : all;
    let best = null;
    for (const c of pool) if (!best || c.jt < best.jt || (c.jt === best.jt && c.peer < best.peer)) best = c;
    const h = best ? best.peer : null;
    if (h === this.hostPeer) return;
    const had = this.hostPeer !== null; this.hostPeer = h;
    if (had && h && announce) this.system(h === this.myPeer ? 'You are the host now. Your game keeps the shared state running.' : `${(this.remotes.get(h) || {}).displayName || 'Someone'} is the host now`);
  },
  isHost() { return !this.room || !this.hostPeer || this.hostPeer === this.myPeer; },
  // A hidden page stops its game loop, so it can't keep the shared state running: while hidden we tell the room we
  // are away and the next player hosts. Coming back we take a new join time (the back of the queue), so hosting
  // doesn't flip back to a page whose shared state went stale while it was hidden.
  away: false,
  onVisibility() {
    const away = !!document.hidden;
    if (away === this.away) return;
    this.away = away;
    if (!this.room) return; // a join on its way sends it with the identity
    if (!away) this.jt = Date.now();
    this.room.presence(away ? { aw: 1 } : { aw: null, jt: this.jt }).catch(() => {});
    if (typeof this.room.flush === 'function') this.room.flush(); // a phone may freeze the page right after this
    this.electHost(true); this.playersDirty();
  },
  checkFull() {
    const ahead = [...this.remotes.values()].filter(r => r.jt < this.jt || (r.jt === this.jt && r.peer < (this.myPeer || ''))).length;
    if (ahead >= MAX_PLAYERS) { toast(`${this.title()} is full (${MAX_PLAYERS} players). Try again soon.`, true); Game.leave(); }
  },

  // ---- presence: who I am plus position and rotation, about 10 times a second ----
  identity() { return { v: 1, uid: Me.id || null, nk: Profile.nick || null, nm: Profile.displayName() || null, st: defaultStarterIndex(), jt: this.jt, sc: this.score || 0, aw: this.away ? 1 : null }; },
  score: 0, pubJson: 'null',
  setScore(n) { n = Number(n) || 0; if (n === this.score) return; this.score = n; if (this.room) this.room.presence({ sc: n }).catch(() => {}); },
  // Small per-mode data other players can read through Game.others()[i].x (health, team, carrying...).
  setPublic(obj) {
    const j = JSON.stringify(obj === undefined ? null : obj); if (j === this.pubJson) return; this.pubJson = j;
    if (this.room && j.length < 600) this.room.presence({ x: obj === undefined ? null : obj }).catch(() => {});
  },
  // A new world was built: put the other players' avatars into it.
  reattach() { for (const r of this.remotes.values()) if (World.scene) World.scene.add(r.avatar.root); },
  sendPresence(full) {
    const b = Game.body; if (!this.room || !b) return;
    const p = [r2(b.pos.x), r2(Game.visY), r2(b.pos.z)], r = r2(Math.atan2(Math.sin(Game.facing), Math.cos(Game.facing)));
    const s = r2(clamp(Math.hypot(b.vel.x, b.vel.z) / Phys.SPEED, 0, 1)), m = b.grounded ? 0 : 1, L = this.lastSent;
    if (!full && L && L.p[0] === p[0] && L.p[1] === p[1] && L.p[2] === p[2] && L.r === r && L.s === s && L.m === m) return;
    this.lastSent = { p, r, s, m };
    const patch = { p, r, s, m, t: Date.now() };
    if (full) Object.assign(patch, this.identity());
    this.room.presence(patch).catch(() => {});
  },
  updateIdentity() { if (this.room) this.room.presence(this.identity()).catch(() => {}); },
  tick(dt) {
    if (!this.room) return;
    const now = performance.now();
    if (now - this.lastSendAt >= 100) { this.lastSendAt = now; this.sendPresence(false); }
    const rt = Date.now() - INTERP_MS;
    for (const r of this.remotes.values()) r.update(dt, rt);
  },

  // ---- chat ----
  setChatOpen(o) {
    this.chatOpen = !!(o && this.room);
    if (this.chatOpen) this.unread = 0;
    netStore.set({ chatOpen: this.chatOpen, unread: this.unread });
    gameStore.set({ chatOpen: this.chatOpen });
  },
  // Enter or / in a game: open the chat and put the cursor in it (the chat panel focuses on focusSeq).
  focusChat() { if (!this.room) return; this.setChatOpen(true); netStore.set({ focusSeq: ++this.focusSeq }); },
  note(msg) {
    netStore.set({ note: msg });
    clearTimeout(this.noteTimer); this.noteTimer = setTimeout(() => netStore.set({ note: '' }), 3500);
  },
  // Returns true when the message went out (the panel then clears its input).
  send(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text || !this.room || !this.canChat) return false;
    const now = Date.now();
    if (now - this.lastChatAt < 1000) { this.note('One message per second. Wait a moment, then send.'); Sfx.play('error'); return false; }
    if (typeof this.room.connected === 'function' && !this.room.connected()) { this.note('Reconnecting. Your message was not sent.'); return false; }
    const clean = WordFilter.clean(text); this.lastChatAt = now;
    const line = { key: 'me', name: Profile.displayName(), text: clean, mine: true };
    let sent; try { sent = Promise.resolve(this.room.emit('chat', { text: clean })); } catch (e) { sent = Promise.reject(e); }
    sent.catch(e => {
      if (e && e.code === 'not_permitted') {
        this.canChat = false; this.lines = this.lines.filter(l => l !== line);
        netStore.set({ lines: this.lines.slice(), canChat: false });
        this.note("You can read chat here, but you can't send messages.");
      } else if (e && e.code === 'rate') this.note('One message per second. Wait a moment, then send.');
    });
    this.addLine(line);
    if (Settings.bubbles) Game.avatar.say(clean);
    Sfx.play('click');
    return true;
  },
  onChat(m) {
    if (m.sameTab) return; // already shown when sent
    const r = this.remotes.get(m.peer); if (!r) return;
    // The server already holds everyone to one message a second, and network jitter can bring two of them closer
    // together on the way here: only drop what arrives in a burst.
    const now = Date.now(); if (now - r.lastChat < 300) return; r.lastChat = now;
    const raw = m.data && typeof m.data.text === 'string' ? m.data.text : '';
    const text = WordFilter.clean(raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)); if (!text) return;
    r.recent.push(text); if (r.recent.length > 5) r.recent.shift();
    if (this.mutes.has(r.key)) return;
    this.addLine({ key: r.key, name: r.displayName, text });
    r.say(text);
  },
  system(text) { this.addLine({ system: true, text }); },
  addLine(l) {
    l.id = ++this.lineSeq;
    if (!l.system) l.color = l.mine ? MY_COLOR : colorFor(l.key);
    this.lines.push(l); if (this.lines.length > CHAT_KEEP) this.lines.shift();
    if (!this.chatOpen && !l.system && !l.mine) this.unread++;
    netStore.set({ lines: this.lines.slice(), unread: this.unread });
  },

  // ---- players list, mute, report ----
  playersDirty() {
    if (this.dirtyQueued) return; this.dirtyQueued = true;
    const run = () => { if (!this.dirtyQueued) return; this.dirtyQueued = false; this.publishPlayers(); };
    if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(run);
    setTimeout(run, 120); // background tabs get no animation frames
  },
  publishPlayers() {
    this.dirtyQueued = false;
    const room = !!this.room, test = !!(Game.opts && Game.opts.test);
    const others = [...this.remotes.values()].sort((a, b) => a.jt - b.jt || (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0));
    const rows = [{ id: 'me', key: 'me', me: true, name: Profile.displayName(), host: room && this.isHost(), guest: false, sameUser: false, muted: false, away: false, skin: Skins.worn, ver: this.meVer }];
    for (const r of others) rows.push({ id: r.peer, key: r.key, me: false, name: r.displayName, host: room && this.hostPeer === r.peer, guest: r.guest, sameUser: r.sameUser, muted: this.mutes.has(r.key), away: r.away, skin: r.canvas, ver: r.skinVer });
    const empty = others.length ? ''
      : test ? 'Test runs are solo. Publish your game and friends can play it with you.'
      : room ? 'Nobody else is here yet. Share the link to this game and friends who open it can join you.'
      : this.phase === 'connecting' ? 'Connecting to the game room…'
      : "Multiplayer isn't available right now, so you're playing solo.";
    netStore.set({ players: rows, count: room ? `${others.length + 1} of ${MAX_PLAYERS}` : 'Solo', empty, canReport: !!(typeof Caps.report === 'function' && Me.id && Caps.online) });
  },
  toggleMute(peer) {
    const r = this.remotes.get(peer); if (!r) return;
    const k = r.key;
    if (this.mutes.has(k)) { this.mutes.delete(k); toast(`${r.displayName} is unmuted`); }
    else { this.mutes.add(k); r.avatar.bubble.userData.hide(); toast(`${r.displayName} is muted. You won't see their chat.`); }
    LS.set('pf.v1.mutes', [...this.mutes].filter(x => !x.startsWith('peer:')));
    netStore.set({ mutes: [...this.mutes] }); this.publishPlayers(); Sfx.play('click');
  },
  // A snapshot of who is being reported, taken when the report sheet opens (they may leave before it is sent).
  reportTarget(peer) {
    const r = this.remotes.get(peer); if (!r) return null;
    return { peer, by: r.by, nick: r.dbNick || r.nick || null, name: r.displayName, recent: r.recent.slice(-5) };
  },
  async sendReport(t, reason, note) {
    if (!t || !reason || typeof Caps.report !== 'function' || !Me.id) return false;
    try {
      await Caps.report({
        target: t.by || null, targetNick: t.nick || null, game: this.gameId || (Game.def && Game.def.id) || null,
        reason, note: String(note || '').replace(/\s+/g, ' ').trim().slice(0, 200), recent: t.recent || [],
      });
      toast('Report sent. Thanks for helping keep PlayForge friendly.'); Sfx.play('save');
      return true;
    } catch (e) { toast("The report didn't send. Try again in a moment.", true); Sfx.play('error'); return false; }
  },
};

// Shared game state. The host (earliest player in the room, or you when solo) runs the rules that everyone
// shares and publishes a small state object about 5 times a second; everyone else mirrors it. Actions
// (feed the fire, hit a player) travel to every client through presence, including late joiners' hosts.
export const Shared = {
  incoming: [], queue: [], seq: 0, st: null, stateN: 0, seenN: -1, seenHost: null, pubT: 0, lastPub: '',
  resetLocal() {
    this.incoming = []; this.queue = []; this.st = null; this.seenN = -1; this.seenHost = null; this.pubT = 0; this.lastPub = '';
    if (Net.room) Net.room.presence({ gs: null, gsn: null, act: null }).catch(() => {});
  },
  isHost() { return Net.isHost(); },
  // The latest shared state: your own when you host, otherwise the host's.
  state() {
    if (this.isHost()) return this.st;
    const h = Net.remotes.get(Net.hostPeer); return h && h.gs ? h.gs : this.st;
  },
  publish(obj) { this.st = obj; this.pubT = 0; },
  // Tell everyone (and yourself) that something happened. data must be small JSON.
  act(kind, data) {
    const a = { n: ++this.seq, k: String(kind).slice(0, 24), d: data === undefined ? null : data };
    this.queue.push(a); if (this.queue.length > 6) this.queue.shift();
    if (Net.room) Net.room.presence({ act: this.queue.slice() }).catch(() => {});
    callMode('onAct', { key: 'me', peer: Game.myPeer(), name: Profile.displayName(), isMe: true }, a.k, a.d, Game);
  },
  tick(dt) {
    if (this.incoming.length) {
      const list = this.incoming; this.incoming = [];
      for (const it of list) callMode('onAct', { key: it.from.key, peer: it.from.peer, name: it.from.displayName, isMe: false, remote: it.from }, it.k, it.d, Game);
    }
    if (this.isHost()) {
      if ((this.pubT -= dt) > 0) return;
      this.pubT = 0.2;
      const s = callMode('hostState', Game); if (s === undefined || s === null) return;
      this.st = s; const j = JSON.stringify(s);
      if (Net.room && j !== this.lastPub && j.length < 2400) { this.lastPub = j; this.stateN++; Net.room.presence({ gs: s, gsn: this.stateN }).catch(() => {}); }
    } else {
      const h = Net.remotes.get(Net.hostPeer); if (!h) return;
      if (h.peer !== this.seenHost) { this.seenHost = h.peer; this.seenN = -1; }
      if (h.gs && h.gsn !== this.seenN) { this.seenN = h.gsn; this.st = h.gs; callMode('onShared', h.gs, Game); }
    }
  },
};
