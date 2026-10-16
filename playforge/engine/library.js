import { Caps, LS, Me, Profile, WordFilter, toast } from './core.js';
import { createStore } from './stores.js';
import { World, mkPart, normPart } from './world.js';
import { GAME_ID_RE, Modes } from './game.js';

/* ---------- 14a. Library: your games, published games, likes ---------- */
// Drafts live on this device (localStorage 'pf.v1.drafts'). Publishing copies a game to the PlayForge server so
// everyone sees it; the server keeps the published list and like counts (playforge/WEBAPP.md, Server):
//   GET /games (summaries), GET /games/:id (full), PUT /games/:id (publish or update), PATCH (rename), DELETE,
//   GET /likes {counts, mine}, PUT /likes/:key {liked}.
// It announces changes on the page's socket: {t:'games'} reloads the list, {t:'likes', key, count} updates a count.
// A game key is a built-in id ('forge-park') or a community game id ('u-xxxxxxxx').
//
// React reads libraryStore: {ready, online, canPublish, published, likeCounts (Map), myLikes (Set), drafts, rev}.
// Every change replaces the arrays, Maps and Sets (never mutated in place), so selectors can compare by identity.
// Library.onChange(fn) still works and returns an unsubscribe function.
export const GAME_LIMITS = { parts: 1200, published: 20, title: 40, desc: 200, thumb: 24000 };
const COMMUNITY_RE = /^u-[a-z0-9]{8}$/;
const PART_ID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;
const DRAFTS_KEY = 'pf.v1.drafts';
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const validThumb = s => typeof s === 'string' && s.startsWith('data:image/jpeg;base64,') && s.length < GAME_LIMITS.thumb;
const safeId = s => (PART_ID_RE.test(String(s)) ? String(s) : String(s).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 40) || 'p');
const clone = v => JSON.parse(JSON.stringify(v));

export const libraryStore = createStore({
  ready: false, online: false, canPublish: false, published: [], likeCounts: new Map(), myLikes: new Set(), drafts: [], rev: 0,
});

// An Error with the server's code (Studio and home map codes to messages): 'limit' (20 published games),
// 'offline' (no server), 'signin' (no session), 'forbidden' (someone else's game id), 'invalid' (bad input),
// 'not_found', 'rate_limited', or 'failed'.
function libError(e) {
  if (e && e.libCode) return e;
  const code = !e ? 'failed' : e.code === 'limit' ? 'limit' : e.code === 'offline' || e.status === 0 ? 'offline' : e.code === 'forbidden' ? 'forbidden'
    : e.code === 'not_found' ? 'not_found' : e.code === 'rate_limited' ? 'rate_limited' : e.status === 400 || e.status === 413 ? 'invalid' : 'failed';
  const err = new Error(code); err.libCode = code; err.status = e && e.status; err.detail = e && e.message;
  return err;
}

// A summary from the server, checked (it is shown on tiles).
function cleanSummary(g) {
  if (!g || typeof g.id !== 'string' || !COMMUNITY_RE.test(g.id)) return null;
  return {
    id: g.id, title: String(g.title || 'Untitled game').slice(0, GAME_LIMITS.title), desc: String(g.desc || '').slice(0, GAME_LIMITS.desc),
    creatorId: String(g.creatorId || ''), creatorName: WordFilter.clean(String(g.creatorName || '').slice(0, 40)),
    thumb: validThumb(g.thumb) ? g.thumb : '', mode: typeof g.mode === 'string' ? g.mode : 'custom', sky: typeof g.sky === 'string' ? g.sky : 'day',
    parts: Number(g.parts) || 0, createdAt: Number(g.createdAt) || 0, updatedAt: Number(g.updatedAt) || 0, likes: Number(g.likes) || 0,
  };
}
const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

export const Library = {
  published: [], likeCounts: new Map(), myLikes: new Set(), listeners: [], ready: false, rev: 0,
  _inited: false, _offlineInit: false, _unsub: null, _gamesTimer: 0, _gamesLoad: null, _storageHooked: false, _draftList: null,
  onChange(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; },
  emit() {
    this.rev++;
    libraryStore.set({
      ready: this.ready, online: !!Caps.online, canPublish: this.canPublish(), published: this.published,
      likeCounts: this.likeCounts, myLikes: this.myLikes, drafts: this._draftList || (this._draftList = this.drafts()), rev: this.rev,
    });
    this.listeners.slice().forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  },
  creatorKey() { return Me.id || Me.guestId; },
  canPublish() { return !!(Caps.online && Me.id && typeof Caps.api === 'function'); },

  // ---- drafts on this device ----
  _drafts() { const d = LS.get(DRAFTS_KEY, {}); return isObj(d) ? d : {}; },
  drafts() { return Object.values(this._drafts()).filter(g => g && g.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
  getDraft(id) { return this._drafts()[id] || null; },
  saveDraft(doc) {
    doc.updatedAt = Date.now(); const all = this._drafts(); all[doc.id] = doc;
    try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(all)); }
    catch (e) { toast('This device is out of space for drafts. Delete an old game to make room.', true); return false; }
    this._draftList = null; this.emit(); return true;
  },
  deleteDraft(id) { const all = this._drafts(); delete all[id]; LS.set(DRAFTS_KEY, all); this._draftList = null; this.emit(); },
  newId() {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789', r = new Uint8Array(8);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(r); else for (let i = 0; i < 8; i++) r[i] = Math.floor(Math.random() * 256);
    let s = 'u-'; for (let i = 0; i < 8; i++) s += a[r[i] % a.length];
    return s;
  },
  blank(title = 'My game') {
    return {
      v: 1, id: this.newId(), title, desc: '', creatorId: this.creatorKey(), mode: 'custom', modeOpts: {}, env: { sky: 'day' },
      parts: [
        normPart(mkPart('block', [0, -1, 0], [128, 2, 128], '#6CC38A', 'grass', { name: 'Baseplate' })),
        normPart(mkPart('spawn', [0, 0.2, 0], [6, 0.4, 6], '#FF6A2B', 'plastic', { name: 'Spawn' })),
      ],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
  },
  // A game (built-in or community) copied into an editable draft. Its rules (mode) and fall height come along.
  remix(def) {
    const g = World.generate(def), doc = this.blank(`${def.title} remix`.slice(0, GAME_LIMITS.title));
    doc.parts = g.parts.map(p => Object.assign({}, p)); doc.spawn = g.spawn; doc.spawnYaw = g.spawnYaw;
    doc.mode = Modes[def.mode] ? def.mode : 'custom'; doc.modeOpts = clone(def.modeOpts || {}); doc.env = clone(def.env || { sky: 'day' });
    if (Number.isFinite(def.killY)) doc.killY = def.killY;
    doc.desc = `A remix of ${def.title}.`; doc.remixOf = def.id;
    return doc;
  },
  // A game definition Game.enter() can play.
  toDef(doc, creatorName) {
    return {
      id: doc.id, title: doc.title || 'Untitled game', desc: doc.desc || '', creator: creatorName || 'A player', creatorId: doc.creatorId,
      cat: 'community', builtin: false, mode: Modes[doc.mode] ? doc.mode : 'custom', modeOpts: doc.modeOpts || {}, env: doc.env || { sky: 'day' },
      parts: doc.parts || [], spawn: doc.spawn, spawnYaw: doc.spawnYaw, killY: doc.killY, thumbUrl: doc.thumb || '',
    };
  },
  // Parts without default values, rounded, so a game stays small. Ids are made server-safe.
  compact(parts) {
    const r = v => Math.round(v * 1000) / 1000;
    return (parts || []).slice(0, GAME_LIMITS.parts).filter(p => p && typeof p === 'object').map(p0 => {
      if (p0.shape === 'group') return Object.assign({ id: safeId(p0.id || 'g'), name: String(p0.name || 'Group').slice(0, 40), shape: 'group' }, p0.parent ? { parent: safeId(p0.parent) } : {});
      const p = normPart(p0);
      const q = { id: safeId(p.id), name: p.name, shape: /^[a-z]{1,16}$/.test(p.shape) ? p.shape : 'block', pos: p.pos.map(r), size: p.size.map(r), color: p.color };
      if (p.rot && p.rot.some(v => v)) q.rot = p.rot.map(r);
      if (p.material && p.material !== 'plastic') q.material = p.material;
      if (p.anchored === false) q.anchored = false;
      if (p.canCollide === false) q.canCollide = false;
      if (p.transparency) q.transparency = r(p.transparency);
      if (p.behavior) q.behavior = p.behavior;
      if (isObj(p.bp) && JSON.stringify(p.bp).length <= 600) q.bp = p.bp;
      if (p.tag) q.tag = String(p.tag).slice(0, 24);
      if (p.parent) q.parent = safeId(p.parent);
      return q;
    });
  },

  // ---- publishing ----
  async publish(doc, thumb) {
    if (!Caps.online) throw libError({ code: 'offline' });
    if (!this.canPublish()) throw libError({ code: 'signin' });
    const body = {
      title: WordFilter.clean(String(doc.title || 'Untitled game').replace(/\s+/g, ' ').trim().slice(0, GAME_LIMITS.title)) || 'Untitled game',
      desc: WordFilter.clean(String(doc.desc || '').replace(/\s+/g, ' ').trim().slice(0, GAME_LIMITS.desc)),
      mode: typeof doc.mode === 'string' && /^[a-z0-9_-]{1,32}$/.test(doc.mode) ? doc.mode : 'custom',
      modeOpts: isObj(doc.modeOpts) ? doc.modeOpts : {}, env: isObj(doc.env) ? doc.env : { sky: 'day' },
      killY: Number.isFinite(doc.killY) ? doc.killY : null, spawnYaw: Number.isFinite(doc.spawnYaw) ? doc.spawnYaw : null,
      spawn: Array.isArray(doc.spawn) && doc.spawn.length >= 3 && doc.spawn.slice(0, 3).every(Number.isFinite) ? doc.spawn.slice(0, 3) : null,
      parts: this.compact(doc.parts || []), thumb: validThumb(thumb) ? thumb : validThumb(doc.thumb) ? doc.thumb : '',
    };
    let s;
    try { s = cleanSummary(await Caps.api('PUT', '/games/' + doc.id, body)); }
    catch (e) { throw libError(e); }
    if (s) this._upsert(s);
    doc.publishedAt = Date.now(); doc.title = body.title; doc.desc = body.desc; doc.creatorId = Me.id;
    this.saveDraft(doc);
    return 'cloud';
  },
  async unpublish(id) {
    if (!this.canPublish()) throw libError({ code: Caps.online ? 'signin' : 'offline' });
    try { await Caps.api('DELETE', '/games/' + id); }
    catch (e) { if (!e || e.code !== 'not_found') throw libError(e); }
    this._remove(id);
    const d = this.getDraft(id); if (d) { delete d.publishedAt; this.saveDraft(d); } else this.emit();
  },
  async rename(id, title) {
    title = WordFilter.clean(String(title || '').replace(/\s+/g, ' ').trim().slice(0, GAME_LIMITS.title)); if (!title) return;
    const d = this.getDraft(id); if (d) { d.title = title; this.saveDraft(d); }
    const s = this.published.find(g => g.id === id && g.creatorId === Me.id);
    if (s && this.canPublish()) {
      try { const n = cleanSummary(await Caps.api('PATCH', '/games/' + id, { title })); if (n) this._upsert(n); }
      catch (e) { throw libError(e); }
    }
  },
  // The full published game, ready for Game.enter(). Your own game plays from your draft when you have one.
  // Null when it can't be read (unpublished, or the server is away).
  async loadPublished(summary) {
    if (!summary || !summary.id) return null;
    if (summary.creatorId && summary.creatorId === Me.id) { const d = this.getDraft(summary.id); if (d) return this.toDef(d, Profile.displayName()); }
    return this._fetch(summary.id, summary);
  },
  // Any community game by id (for /g/u-xxxxxxxx): your draft, else the published game. Null when unknown.
  async loadById(gameId) {
    if (typeof gameId !== 'string' || !COMMUNITY_RE.test(gameId)) return null;
    const d = this.getDraft(gameId); // drafts are always this player's own
    if (d) return this.toDef(d, Profile.displayName());
    return this._fetch(gameId, this.published.find(g => g.id === gameId));
  },
  async _fetch(id, summary) {
    if (!Caps.online || typeof Caps.api !== 'function' || !COMMUNITY_RE.test(id)) return null;
    let g;
    try { g = await Caps.api('GET', '/games/' + id); }
    catch (e) { if (e && (e.status === 404 || e.code === 'not_found')) return null; throw libError(e); }
    if (!g || !Array.isArray(g.parts)) return null;
    const s = cleanSummary(g);
    if (s) this._upsert(s, true);
    return this.toDef({
      id: g.id, title: s ? s.title : 'Untitled game', desc: s ? s.desc : '', creatorId: g.creatorId, mode: g.mode, modeOpts: isObj(g.modeOpts) ? g.modeOpts : {},
      env: isObj(g.env) ? g.env : { sky: 'day' }, parts: g.parts, spawn: Array.isArray(g.spawn) ? g.spawn : undefined,
      spawnYaw: Number.isFinite(g.spawnYaw) ? g.spawnYaw : undefined, killY: Number.isFinite(g.killY) ? g.killY : undefined,
      thumb: (s && s.thumb) || (summary && summary.thumb) || '',
    }, (s && s.creatorName) || (summary && summary.creatorName) || 'A player');
  },

  // ---- likes ----
  likes(key) { return this.likeCounts.get(key) || 0; },
  liked(key) { return this.myLikes.has(key); },
  // Resolves to the new liked state. Updates counts at once; the server's answer (and its broadcast) settle them.
  async toggleLike(key) {
    if (!this.canPublish()) { toast(Caps.online ? 'Likes are not available right now.' : 'Likes need the PlayForge server, which is not reachable right now.'); return this.liked(key); }
    if (typeof key !== 'string' || !GAME_ID_RE.test(key)) return false;
    const want = !this.myLikes.has(key);
    let res;
    try { res = await Caps.api('PUT', '/likes/' + encodeURIComponent(key), { liked: want }); }
    catch (e) { throw libError(e); }
    const mine = new Set(this.myLikes); if (res.liked) mine.add(key); else mine.delete(key);
    this.myLikes = mine; this._setCount(key, res.count);
    return !!res.liked;
  },
  _setCount(key, n) {
    n = Math.max(0, Number(n) || 0);
    if (this.likes(key) === n && (n > 0 || !this.likeCounts.has(key))) { this.emit(); return; }
    const m = new Map(this.likeCounts); if (n) m.set(key, n); else m.delete(key);
    this.likeCounts = m; this.emit();
  },

  // ---- live lists ----
  _upsert(s, quiet) {
    const i = this.published.findIndex(g => g.id === s.id);
    if (i >= 0 && quiet && JSON.stringify(this.published[i]) === JSON.stringify(s)) return;
    const list = this.published.slice(); if (i >= 0) list[i] = s; else list.push(s);
    this.published = list.sort(byNewest);
    if (s.likes !== this.likes(s.id)) { const m = new Map(this.likeCounts); if (s.likes) m.set(s.id, s.likes); else m.delete(s.id); this.likeCounts = m; }
    this.emit();
  },
  _remove(id) { if (this.published.some(g => g.id === id)) this.published = this.published.filter(g => g.id !== id); },
  async loadGames() {
    if (!Caps.online || typeof Caps.api !== 'function') return;
    if (this._gamesLoad) { this._gamesAgain = true; return this._gamesLoad; }
    this._gamesLoad = (async () => {
      try {
        const d = await Caps.api('GET', '/games');
        this.published = (Array.isArray(d && d.games) ? d.games : []).map(cleanSummary).filter(Boolean).sort(byNewest);
      } catch (e) { /* keep the last list; the next {t:'games'} or reconnect tries again */ }
      this.ready = true; this.emit();
    })().finally(() => { this._gamesLoad = null; if (this._gamesAgain) { this._gamesAgain = false; this.loadGames(); } });
    return this._gamesLoad;
  },
  async loadLikes() {
    if (!Caps.online || typeof Caps.api !== 'function') return;
    try {
      const d = await Caps.api('GET', '/likes');
      const counts = new Map();
      for (const [k, n] of Object.entries((d && d.counts) || {})) if (GAME_ID_RE.test(k) && Number(n) > 0) counts.set(k, Number(n));
      this.likeCounts = counts;
      this.myLikes = new Set(((d && d.mine) || []).filter(k => typeof k === 'string' && GAME_ID_RE.test(k)));
      this.emit();
    } catch (e) { /* counts stay as they were */ }
  },
  refresh() { return Promise.all([this.loadGames(), this.loadLikes()]); },
  // After start-up (client/platform.js). Offline it only marks the library ready (drafts work); called again once
  // the server answers, it loads the lists and follows the server's broadcasts.
  init() {
    if (!this._storageHooked) {
      this._storageHooked = true;
      // Drafts saved in another tab show up here too.
      window.addEventListener('storage', e => { if (e.key === DRAFTS_KEY || e.key === null) { this._draftList = null; this.emit(); } });
    }
    if (!Caps.online || typeof Caps.api !== 'function') { this._offlineInit = true; this.ready = true; this.emit(); return; }
    if (this._inited) return; this._inited = true;
    if (typeof Caps.onServer === 'function') {
      this._unsub = Caps.onServer(m => {
        if (m.t === 'games') { clearTimeout(this._gamesTimer); this._gamesTimer = setTimeout(() => this.loadGames(), 150); }
        else if (m.t === 'likes' && typeof m.key === 'string' && GAME_ID_RE.test(m.key)) this._setCount(m.key, m.count);
        else if (m.t === 'connected' && m.reconnect) this.refresh(); // changes made while this page was offline
      });
    }
    this.emit();
    this.refresh();
  },
};
