import { Caps, LS, Me, Profile, WordFilter, toast } from './core.js';
import { World, mkPart, normPart } from './world.js';
import { GAME_ID_RE, Modes } from './game.js';
import { ID_RE } from './net.js';

/* ---------- 14a. Library: your games, published games, likes ---------- */
// Drafts live on this device (localStorage). Publishing copies a game to the db so everyone sees it:
//   games/<creatorId>                 {v, games: {<gameId>: summary}}   one doc per creator, only they can write it
//   games/<creatorId>/data/<gameId>   the full game (parts)              only the creator can write it
//   likes/<userId>                    {v, g: {<gameKey>: true}}          each person writes only their own likes
// A game key is a built-in id ('forge-park') or a user game id ('u-…'). Both are room-safe names.
export const GAME_LIMITS = { parts: 1200, published: 20, title: 40, desc: 200 };
export const Library = {
  published: [], likeCounts: new Map(), myLikes: new Set(), listeners: [], unsubs: [], ready: false,
  onChange(fn) { this.listeners.push(fn); },
  emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
  creatorKey() { return Me.id || Me.guestId; },
  canPublish() { return !!(Caps.db && Me.id && Caps.canWrite !== false); },
  // ---- drafts on this device ----
  _drafts() { const d = LS.get('pf.v1.drafts', {}); return d && typeof d === 'object' ? d : {}; },
  drafts() { return Object.values(this._drafts()).filter(g => g && g.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); },
  getDraft(id) { return this._drafts()[id] || null; },
  saveDraft(doc) {
    doc.updatedAt = Date.now(); const all = this._drafts(); all[doc.id] = doc;
    try { localStorage.setItem('pf.v1.drafts', JSON.stringify(all)); }
    catch (e) { toast('This device is out of space for drafts. Delete an old game to make room.', true); return false; }
    this.emit(); return true;
  },
  deleteDraft(id) { const all = this._drafts(); delete all[id]; LS.set('pf.v1.drafts', all); this.emit(); },
  newId() { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = 'u-'; for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)]; return s; },
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
  // A built-in game copied into an editable draft. Its rules (mode) come along.
  remix(def) {
    const g = World.generate(def), doc = this.blank(`${def.title} remix`.slice(0, GAME_LIMITS.title));
    doc.parts = g.parts.map(p => Object.assign({}, p)); doc.spawn = g.spawn; doc.spawnYaw = g.spawnYaw;
    doc.mode = Modes[def.mode] ? def.mode : 'custom'; doc.modeOpts = JSON.parse(JSON.stringify(def.modeOpts || {})); doc.env = JSON.parse(JSON.stringify(def.env || { sky: 'day' }));
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
  // Parts without default values, rounded, so a game fits in one db document.
  compact(parts) {
    const r = v => Math.round(v * 1000) / 1000;
    return parts.slice(0, GAME_LIMITS.parts).map(p => {
      if (p.shape === 'group') return Object.assign({ id: p.id, name: p.name, shape: 'group' }, p.parent ? { parent: p.parent } : {});
      const q = { id: p.id, name: p.name, shape: p.shape, pos: p.pos.map(r), size: p.size.map(r), color: p.color };
      if (p.rot && p.rot.some(v => v)) q.rot = p.rot.map(r);
      if (p.material && p.material !== 'plastic') q.material = p.material;
      if (p.anchored === false) q.anchored = false;
      if (p.canCollide === false) q.canCollide = false;
      if (p.transparency) q.transparency = r(p.transparency);
      if (p.behavior) q.behavior = p.behavior;
      if (p.bp) q.bp = p.bp;
      if (p.tag) q.tag = String(p.tag).slice(0, 24);
      if (p.parent) q.parent = p.parent;
      return q;
    });
  },
  // ---- publishing ----
  async publish(doc, thumb) {
    if (!this.canPublish()) throw new Error('signin');
    const db = Caps.db, uid = Me.id, now = Date.now();
    const title = WordFilter.clean(String(doc.title || 'Untitled game').trim().slice(0, GAME_LIMITS.title)) || 'Untitled game';
    const desc = WordFilter.clean(String(doc.desc || '').trim().slice(0, GAME_LIMITS.desc));
    const sumRef = db.doc('games/' + uid), cur = await sumRef.get();
    const games = Object.assign({}, cur.exists && cur.data().games ? cur.data().games : {});
    if (!games[doc.id] && Object.keys(games).length >= GAME_LIMITS.published) throw new Error('limit');
    const full = {
      v: 1, id: doc.id, title, desc, creatorId: uid, mode: doc.mode || 'custom', modeOpts: doc.modeOpts || {}, env: doc.env || { sky: 'day' },
      parts: this.compact(doc.parts || []), spawn: doc.spawn || null, spawnYaw: Number.isFinite(doc.spawnYaw) ? doc.spawnYaw : null, updatedAt: now,
    };
    await db.doc('games/' + uid + '/data/' + doc.id).set(full);
    const by = WordFilter.clean(String(Profile.displayName() || '').trim().slice(0, 40));
    games[doc.id] = { id: doc.id, title, desc, by, thumb: typeof thumb === 'string' && thumb.length < 24000 ? thumb : '', mode: full.mode, sky: (full.env && full.env.sky) || 'day', parts: full.parts.length, createdAt: (games[doc.id] && games[doc.id].createdAt) || now, updatedAt: now };
    await sumRef.set({ v: 1, games });
    doc.publishedAt = now; doc.title = title; doc.desc = desc; this.saveDraft(doc);
    return 'cloud';
  },
  async unpublish(id) {
    const db = Caps.db, uid = Me.id; if (!db || !uid) return;
    const sumRef = db.doc('games/' + uid), cur = await sumRef.get();
    const games = Object.assign({}, cur.exists && cur.data().games ? cur.data().games : {});
    delete games[id];
    await sumRef.set({ v: 1, games });
    await db.doc('games/' + uid + '/data/' + id).delete();
    const d = this.getDraft(id); if (d) { delete d.publishedAt; this.saveDraft(d); }
  },
  async rename(id, title) {
    title = WordFilter.clean(String(title || '').trim().slice(0, GAME_LIMITS.title)); if (!title) return;
    const d = this.getDraft(id); if (d) { d.title = title; this.saveDraft(d); }
    const s = this.published.find(g => g.id === id && g.creatorId === Me.id);
    if (s && Caps.db) {
      const sumRef = Caps.db.doc('games/' + Me.id), cur = await sumRef.get();
      const games = Object.assign({}, cur.exists && cur.data().games ? cur.data().games : {});
      if (games[id]) { games[id] = Object.assign({}, games[id], { title, updatedAt: Date.now() }); await sumRef.set({ v: 1, games }); }
      const full = await Caps.db.doc('games/' + Me.id + '/data/' + id).get();
      if (full.exists) await Caps.db.doc('games/' + Me.id + '/data/' + id).set(Object.assign({}, full.data(), { title }));
    }
  },
  // The full published game, ready for Game.enter(). Null when it can't be read.
  async loadPublished(summary) {
    if (summary.creatorId === Me.id) { const d = this.getDraft(summary.id); if (d) return this.toDef(d, Profile.displayName()); }
    if (!Caps.db || !ID_RE.test(summary.creatorId || '')) return null;
    const snap = await Caps.db.doc('games/' + summary.creatorId + '/data/' + summary.id).get();
    if (!snap.exists) return null;
    const doc = snap.data(); return this.toDef(Object.assign({}, doc, { thumb: summary.thumb }), summary.creatorName);
  },
  // ---- likes ----
  likes(key) { return this.likeCounts.get(key) || 0; },
  liked(key) { return this.myLikes.has(key); },
  async toggleLike(key) {
    if (!Caps.db || !Me.id) { toast('Sign in to like games.'); return false; }
    const ref = Caps.db.doc('likes/' + Me.id), cur = await ref.get();
    const g = Object.assign({}, cur.exists && cur.data().g ? cur.data().g : {});
    if (g[key]) delete g[key]; else g[key] = true;
    await ref.set({ v: 1, g });
    return !!g[key];
  },
  // ---- live lists (after capabilities load) ----
  init() {
    const db = Caps.db; if (!db) { this.ready = true; this.emit(); return; }
    try {
      this.unsubs.push(db.collection('games').onSnapshot(snap => {
        const list = [];
        for (const d of snap.docs) {
          const data = d.data(); if (!data || !data.games || typeof data.games !== 'object' || !ID_RE.test(d.id)) continue;
          for (const g of Object.values(data.games)) {
            if (!g || typeof g.id !== 'string' || !GAME_ID_RE.test(g.id)) continue;
            const by = typeof g.by === 'string' ? WordFilter.clean(g.by.trim().slice(0, 40)) : '';
            list.push({ id: g.id, title: String(g.title || 'Untitled game').slice(0, GAME_LIMITS.title), desc: String(g.desc || '').slice(0, GAME_LIMITS.desc), creatorName: by, thumb: typeof g.thumb === 'string' && g.thumb.startsWith('data:image/') ? g.thumb : '', mode: g.mode, sky: g.sky, parts: g.parts, createdAt: Number(g.createdAt) || 0, updatedAt: Number(g.updatedAt) || 0, creatorId: d.id });
          }
        }
        this.published = list; this.ready = true; this.emit();
      }, () => { this.ready = true; this.emit(); }));
      this.unsubs.push(db.collection('likes').onSnapshot(snap => {
        const counts = new Map(), mine = new Set();
        for (const d of snap.docs) {
          const g = d.data() && d.data().g; if (!g || typeof g !== 'object') continue;
          for (const k of Object.keys(g)) { if (!g[k] || !GAME_ID_RE.test(k)) continue; counts.set(k, (counts.get(k) || 0) + 1); if (d.id === Me.id) mine.add(k); }
        }
        this.likeCounts = counts; this.myLikes = mine; this.emit();
      }, () => {}));
    } catch (e) { console.warn('PlayForge: library unavailable', e); this.ready = true; this.emit(); }
  },
};
