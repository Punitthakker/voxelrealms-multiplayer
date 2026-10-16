import { $, Caps, IS_TOUCH, LS, Me, Modals, Profile, SK, STARTERS, Settings, Sfx, WordFilter, clamp, ctx2d, defaultStarterIndex, drawHead, drawPngTo, hashStr, lerp, newSkinCanvas, toast, validPng } from './core.js';
import { Engine } from './render.js';
import { createAvatar, makeSkinTexture } from './avatar.js';
import { Phys } from './physics.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Game, callMode } from './game.js';
import { STARTER_CANVASES, Skins } from './skins.js';
import { Home } from './home.js';

/* ---------- 14b. Multiplayer: game rooms, presence, chat, players ---------- */
export const MAX_PLAYERS = 10, CHAT_MAX = 150, CHAT_KEEP = 50, INTERP_MS = 140;
export const NAME_COLORS = ['#FFB38A', '#FFD86B', '#8FE3C0', '#9CC2FF', '#D9B8FF', '#FF9EB5', '#A7F07A', '#7FE7F2'];
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
export const colorFor = key => NAME_COLORS[hashStr(String(key)) % NAME_COLORS.length];

// Another player's avatar in this game room.
export class Remote {
  constructor(p) {
    this.peer = p.peer; this.by = p.by && ID_RE.test(p.by) ? p.by : null; this.guest = !!p.guest; this.sameUser = !!p.isMe;
    this.canvas = newSkinCanvas(); this.tex = makeSkinTexture(this.canvas); this.skinFromDb = false; this.st = -1;
    this.nick = ''; this.dbNick = ''; this.displayName = 'Player'; this.jt = Infinity; this.lastChat = 0; this.recent = [];
    this.samples = []; this.off = null; this.lastPr = null; this.t = 0; this.unsubDb = null;
    this.sc = 0; this.x = null; this.gs = null; this.gsn = -1; this.lastAct = -1;
    this.avatar = createAvatar(this.tex, 'Player'); this.avatar.root.visible = false; World.scene.add(this.avatar.root);
    this.setStarter(hashStr(this.peer) % STARTERS.length);
    if (this.by) this.subscribeDb();
    this.refreshName();
  }
  get key() { return this.by || 'peer:' + this.peer; }
  setStarter(i) {
    if (this.skinFromDb || i === this.st) return;
    this.st = i; const g = ctx2d(this.canvas); g.clearRect(0, 0, SK, SK); g.drawImage(STARTER_CANVASES[i], 0, 0); this.tex.needsUpdate = true;
  }
  // Their saved skin and name live in players/<id>; this stays live while they are here.
  subscribeDb() {
    const db = Caps.db; if (!db || !this.by || this.unsubDb) return;
    try {
      this.unsubDb = db.doc('players/' + this.by).onSnapshot(snap => {
        const d = snap.exists ? snap.data() : null;
        if (d && validPng(d.skin)) drawPngTo(this.canvas, d.skin).then(ok => { if (ok) { this.skinFromDb = true; this.tex.needsUpdate = true; Net.playersDirty(); } });
        const n = d ? cleanNick(d.nick) : '';
        if (n !== this.dbNick) { this.dbNick = n; this.refreshName(); }
      }, () => { /* keep the starter skin */ });
    } catch (e) { this.unsubDb = null; }
  }
  async refreshName() {
    let pn = '';
    if (this.by && Caps.user) { try { const ps = await Caps.user.profiles([this.by]); pn = (ps[this.by] && ps[this.by].name) || ''; } catch (e) { /* unnamed */ } }
    const n = (this.dbNick || this.nick || pn || 'Player').slice(0, 40);
    if (n !== this.displayName) { this.displayName = n; this.avatar.setName(n); Net.playersDirty(); }
    return n;
  }
  onPresence(p) {
    const pr = p.presence || {}; if (pr === this.lastPr) return; this.lastPr = pr;
    if (!this.by && typeof pr.uid === 'string' && ID_RE.test(pr.uid)) { this.by = pr.uid; this.subscribeDb(); this.refreshName(); }
    if (Number.isInteger(pr.st) && pr.st >= 0 && pr.st < STARTERS.length) this.setStarter(pr.st);
    const nk = cleanNick(pr.nk); if (nk !== this.nick) { this.nick = nk; this.refreshName(); }
    if (Number.isFinite(pr.jt)) this.jt = pr.jt;
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
    if (this.unsubDb) { try { this.unsubDb(); } catch (e) { /* already closed */ } }
    World.scene.remove(this.avatar.root); this.avatar.dispose(); this.tex.dispose();
  }
}

export const Net = {
  lobby: null, room: null, leaving: null, gameId: null, token: 0, joinedAt: 0, jt: 0, remotes: new Map(), myPeer: null, hostPeer: null,
  lastSendAt: 0, lastSent: null, lines: [], unread: 0, lastChatAt: 0, chatOpen: false, canChat: true, unsubs: [], lobbyPeers: [],
  mutes: new Set((LS.get('pf.v1.mutes', []) || []).filter(k => typeof k === 'string')), dirtyQueued: false, retried: false,
  discTimer: 0, noteTimer: 0, reportTarget: null, reason: null,
  init() {
    const input = $('#chat-input');
    $('#hud-chat').addEventListener('click', () => { this.setChatOpen(!this.chatOpen); Sfx.play('click'); });
    $('#chat-close').addEventListener('click', () => this.setChatOpen(false));
    $('#chat-form').addEventListener('submit', e => { e.preventDefault(); if (this.send(input.value)) { input.value = ''; this.count(); } });
    input.addEventListener('input', () => this.count());
    input.addEventListener('focus', () => Input.release());
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); input.blur(); } });
    $('#rp-send').addEventListener('click', () => this.sendReport());
    this.count();
  },

  // ---- lobby: everyone with the page open; used for "N online" on tiles ----
  initLobby(room) {
    if (this.lobby || !room) return; this.lobby = room;
    try { room.onPeers(ch => { this.lobbyPeers = ch.peers; Home.updateOnline(); }, () => { this.lobbyPeers = []; Home.updateOnline(); }); } catch (e) { /* optional */ }
    this.setLobbyGame(this.gameId);
    Home.updateOnline();
  },
  setLobbyGame(g) { if (this.lobby) this.lobby.presence({ v: 1, g: g || null }).catch(() => {}); },
  onlineCount(gameId) {
    const seen = new Set();
    for (const p of this.lobbyPeers) if (p.kind === 'viewer' && p.presence && p.presence.g === gameId) seen.add(p.peer);
    return seen.size;
  },

  // ---- joining and leaving a game room ----
  enterGame(gameId) { this.retried = false; return this.join(gameId); },
  async join(gameId) {
    this.leave();
    const token = ++this.token; this.gameId = gameId; this.jt = Date.now(); this.joinedAt = performance.now(); this.canChat = true;
    const lobby = await (Caps.roomP || Promise.resolve(null));
    await this.leaving; // a quick rejoin must not get back the room that is still closing
    if (token !== this.token || !lobby) return; // no room capability: play solo, chat stays hidden
    this.initLobby(lobby);
    let r;
    try { r = await lobby.join(gameId); }
    catch (e) { if (token === this.token) toast('Multiplayer is not available right now, so you are playing solo.'); return; }
    if (token !== this.token) { r.leave().catch(() => {}); return; }
    this.room = r; this.setLobbyGame(gameId);
    this.unsubs.push(r.onPeers(ch => this.onPeers(ch), e => this.onRoomLost(e, token)));
    this.unsubs.push(r.on('chat', m => this.onChat(m), () => {}));
    this.unsubs.push(r.onConnection(c => this.onConnection(c), () => {}));
    this.sendPresence(true);
    $('#hud-chat').hidden = false; $('#game').classList.add('mp');
    this.system(`You joined ${World.def.title}. Be kind, and never share personal info like your address or school.`);
    if (!IS_TOUCH && innerWidth >= 900) this.setChatOpen(true);
    setTimeout(() => { if (token === this.token) this.checkFull(); }, 2500);
  },
  leave() {
    this.token++;
    this.unsubs.forEach(u => { try { u(); } catch (e) { /* already closed */ } }); this.unsubs = [];
    if (this.room) { this.leaving = this.room.leave().catch(() => {}); this.room = null; }
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear(); this.lines = []; this.unread = 0; this.myPeer = null; this.hostPeer = null; this.lastSent = null; this.gameId = null; this.score = 0; this.pubJson = 'null';
    clearTimeout(this.discTimer); $('#chat-status').textContent = ''; $('#chat-note').hidden = true;
    this.setLobbyGame(null); this.setChatOpen(false); this.renderChat(); this.renderBadge();
    $('#hud-chat').hidden = true; $('#game').classList.remove('mp');
  },
  onRoomLost(e, token) {
    if (token !== this.token) return;
    const gid = this.gameId, code = e && e.code;
    this.leave(); this.gameId = gid;
    toast('Lost the connection to the game room. You are playing solo.', true);
    if (code !== 'not_permitted' && !this.retried) {
      this.retried = true;
      setTimeout(() => { if (Engine.mode === 'game' && this.gameId === gid && !this.room) this.join(gid); }, 2000);
    }
  },
  onConnection(c) {
    clearTimeout(this.discTimer);
    if (c) $('#chat-status').textContent = '';
    else this.discTimer = setTimeout(() => { $('#chat-status').textContent = 'Reconnecting…'; }, 2000);
  },
  onPeers(ch) {
    const settled = performance.now() - this.joinedAt > 2500;
    for (const p of ch.joined) this.upsert(p, settled);
    for (const p of ch.updated) this.upsert(p, false);
    for (const p of ch.left) {
      const r = this.remotes.get(p.peer); if (!r) continue;
      this.system(`${r.displayName} left`); r.dispose(); this.remotes.delete(p.peer);
    }
    this.electHost(settled); this.playersDirty();
  },
  upsert(p, announce) {
    if (p.kind !== 'viewer') return;
    if (p.sameTab) { this.myPeer = p.peer; return; }
    let r = this.remotes.get(p.peer);
    if (!r) {
      if (this.remotes.size >= 30) return;
      r = new Remote(p); this.remotes.set(p.peer, r);
      if (announce) {
        const rr = r;
        Promise.race([rr.refreshName(), new Promise(res => setTimeout(res, 1500))]).then(() => { if (this.remotes.get(rr.peer) === rr) this.system(`${rr.displayName} joined`); });
      }
    }
    r.onPresence(p);
  },
  // The earliest joiner hosts the shared game state; when they leave, the next earliest takes over.
  electHost(announce) {
    if (!this.room) { this.hostPeer = null; return; }
    let best = this.myPeer ? { peer: this.myPeer, jt: this.jt } : null;
    for (const r of this.remotes.values()) if (!best || r.jt < best.jt || (r.jt === best.jt && r.peer < best.peer)) best = { peer: r.peer, jt: r.jt };
    const h = best ? best.peer : null;
    if (h === this.hostPeer) return;
    const had = this.hostPeer !== null; this.hostPeer = h;
    if (had && h && announce) this.system(h === this.myPeer ? 'You are the host now. Your game keeps the shared state running.' : `${(this.remotes.get(h) || {}).displayName || 'Someone'} is the host now`);
  },
  isHost() { return !this.room || !this.hostPeer || this.hostPeer === this.myPeer; },
  checkFull() {
    const ahead = [...this.remotes.values()].filter(r => r.jt < this.jt || (r.jt === this.jt && r.peer < (this.myPeer || ''))).length;
    if (ahead >= MAX_PLAYERS) { toast(`${World.def.title} is full (${MAX_PLAYERS} players). Try again soon.`, true); Game.leave(); }
  },

  // ---- presence: who I am plus position and rotation, about 10 times a second ----
  identity() { return { v: 1, uid: Me.id || null, nk: Profile.nick || null, st: defaultStarterIndex(), jt: this.jt, sc: this.score || 0 }; },
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
    $('#chat').hidden = !this.chatOpen; $('#hud-chat').setAttribute('aria-expanded', String(this.chatOpen));
    if (this.chatOpen) { this.unread = 0; this.renderBadge(); const log = $('#chat-log'); log.scrollTop = log.scrollHeight; }
  },
  focusChat() { if (!this.room) return; this.setChatOpen(true); setTimeout(() => $('#chat-input').focus(), 0); },
  count() { $('#chat-count').textContent = `${$('#chat-input').value.length}/${CHAT_MAX}`; },
  note(msg) {
    const el = $('#chat-note'); el.textContent = msg; el.hidden = false;
    clearTimeout(this.noteTimer); this.noteTimer = setTimeout(() => { el.hidden = true; }, 3500);
  },
  send(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    if (!text || !this.room || !this.canChat) return false;
    const now = Date.now();
    if (now - this.lastChatAt < 1000) { this.note('One message per second. Wait a moment, then send.'); Sfx.play('error'); return false; }
    if (!this.room.connected()) { this.note('Reconnecting. Your message was not sent.'); return false; }
    const clean = WordFilter.clean(text); this.lastChatAt = now;
    const line = { key: 'me', name: Profile.displayName(), text: clean, mine: true };
    this.room.emit('chat', { text: clean }).catch(e => {
      if (e && e.code === 'not_permitted') {
        this.canChat = false; this.lines = this.lines.filter(l => l !== line); this.renderChat();
        this.note("You can read chat here, but your access to this PlayForge doesn't include sending messages.");
      }
    });
    this.addLine(line);
    if (Settings.bubbles) Game.avatar.say(clean);
    Sfx.play('click');
    return true;
  },
  onChat(m) {
    if (m.sameTab) return; // already shown when sent
    const r = this.remotes.get(m.peer); if (!r) return;
    const now = Date.now(); if (now - r.lastChat < 800) return; r.lastChat = now;
    const raw = m.data && typeof m.data.text === 'string' ? m.data.text : '';
    const text = WordFilter.clean(raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)); if (!text) return;
    r.recent.push(text); if (r.recent.length > 5) r.recent.shift();
    if (this.mutes.has(r.key)) return;
    this.addLine({ key: r.key, name: r.displayName, text });
    r.say(text);
  },
  system(text) { this.addLine({ system: true, text }); },
  addLine(l) {
    this.lines.push(l); if (this.lines.length > CHAT_KEEP) this.lines.shift();
    if (!this.chatOpen && !l.system && !l.mine) { this.unread++; this.renderBadge(); }
    this.renderChat();
  },
  renderBadge() { const b = $('#chat-badge'); b.hidden = !this.unread; b.textContent = this.unread > 9 ? '9+' : String(this.unread); },
  renderChat() {
    const log = $('#chat-log'), stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 40;
    log.textContent = '';
    for (const l of this.lines) {
      if (l.key && this.mutes.has(l.key)) continue;
      const li = document.createElement('li');
      if (l.system) { li.className = 'sys'; li.textContent = l.text; }
      else {
        const w = document.createElement('span'); w.className = 'who'; w.style.color = l.mine ? '#FF9F6E' : colorFor(l.key); w.textContent = l.name;
        li.append(w, document.createTextNode(l.text));
      }
      log.appendChild(li);
    }
    if (stick) log.scrollTop = log.scrollHeight;
    const input = $('#chat-input'); input.disabled = !this.canChat; $('#chat-send').disabled = !this.canChat;
    input.placeholder = this.canChat ? 'Say something nice…' : 'Chat is read-only for you';
  },

  // ---- players list, mute, report ----
  playersDirty() {
    if (this.dirtyQueued) return; this.dirtyQueued = true;
    requestAnimationFrame(() => { this.dirtyQueued = false; if (!$('#game-menu').hidden) this.renderPlayers(); });
  },
  renderPlayers() {
    const box = $('#gm-players'); box.textContent = '';
    const canReport = !!(Caps.db && Me.id && Caps.canWrite !== false);
    const others = [...this.remotes.values()].sort((a, b) => a.jt - b.jt);
    $('#gm-pcount').textContent = this.room ? `${others.length + 1} of ${MAX_PLAYERS}` : 'Solo';
    for (const it of [null, ...others]) {
      const me = it === null, el = document.createElement('div'); el.className = 'prow';
      const c = document.createElement('canvas'); c.width = 8; c.height = 8; c.className = 'px'; drawHead(c, me ? Skins.worn : it.canvas);
      const mid = document.createElement('div'), nm = document.createElement('div'), tags = document.createElement('div');
      nm.className = 'pn'; nm.textContent = me ? Profile.displayName() : it.displayName; tags.className = 'tags';
      const chip = (t, cls) => { const s = document.createElement('span'); s.className = 'chip ' + cls; s.textContent = t; tags.appendChild(s); };
      if (me) chip('You', 'you');
      if (this.room && (me ? this.isHost() : this.hostPeer === it.peer)) chip('Host', 'host');
      const muted = !me && this.mutes.has(it.key);
      if (!me && it.sameUser) chip('Your other tab', '');
      if (!me && it.guest) chip('Guest', '');
      if (muted) chip('Muted', 'muted');
      mid.append(nm, tags); el.append(c, mid);
      if (!me) {
        const acts = document.createElement('div'); acts.className = 'acts';
        const mb = document.createElement('button'); mb.className = 'btn btn-sm'; mb.textContent = muted ? 'Unmute' : 'Mute';
        mb.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} ${it.displayName}`); mb.addEventListener('click', () => this.toggleMute(it));
        acts.appendChild(mb);
        if (canReport) {
          const rb = document.createElement('button'); rb.className = 'btn btn-sm btn-danger'; rb.textContent = 'Report';
          rb.setAttribute('aria-label', `Report ${it.displayName}`); rb.addEventListener('click', () => this.openReport(it));
          acts.appendChild(rb);
        }
        el.appendChild(acts);
      }
      box.appendChild(el);
    }
    if (!others.length) {
      const p = document.createElement('p'); p.className = 'help';
      p.textContent = this.room ? 'Nobody else is here yet. Share this PlayForge and friends who open it can join you.'
        : Caps.room === null ? "Multiplayer isn't available on this page, so you're playing solo." : 'Connecting to the game room…';
      box.appendChild(p);
    }
  },
  toggleMute(r) {
    const k = r.key;
    if (this.mutes.has(k)) { this.mutes.delete(k); toast(`${r.displayName} is unmuted`); }
    else { this.mutes.add(k); r.avatar.bubble.userData.hide(); toast(`${r.displayName} is muted. You won't see their chat.`); }
    LS.set('pf.v1.mutes', [...this.mutes].filter(x => !x.startsWith('peer:')));
    this.renderChat(); this.renderPlayers(); Sfx.play('click');
  },
  openReport(r) {
    this.reportTarget = { by: r.by, nick: r.dbNick || r.nick, recent: r.recent.slice(-5) }; this.reason = null;
    $('#rp-title').textContent = `Report ${r.displayName}`; $('#rp-note').value = ''; $('#rp-send').disabled = true;
    this.renderReasons(); Modals.open($('#report-modal'));
  },
  renderReasons() {
    const box = $('#rp-reasons'); box.textContent = '';
    for (const [v, label] of REPORT_REASONS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'reason'; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(this.reason === v)); b.textContent = label;
      b.addEventListener('click', () => { this.reason = v; this.renderReasons(); $('#rp-send').disabled = false; Sfx.play('click'); });
      box.appendChild(b);
    }
  },
  async sendReport() {
    const t = this.reportTarget, db = Caps.db; if (!t || !this.reason || !db || !Me.id) return;
    const btn = $('#rp-send'); btn.disabled = true;
    try {
      await db.collection('reports/' + Me.id + '/items').add({
        v: 1, kind: 'player', game: this.gameId || World.def.id, target: t.by || null, targetNick: t.nick || null,
        reason: this.reason, note: $('#rp-note').value.replace(/\s+/g, ' ').trim().slice(0, 200), recent: t.recent, at: Date.now(),
      });
      Modals.close($('#report-modal')); toast('Report sent. Thanks for helping keep PlayForge friendly.'); Sfx.play('save');
    } catch (e) { btn.disabled = false; toast("The report didn't send. Try again in a moment.", true); Sfx.play('error'); }
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
