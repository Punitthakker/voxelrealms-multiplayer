import { $, $$, Caps, IS_TOUCH, Me, Modals, Profile, Sfx, WordFilter, askChoice, drawFigure, drawHead, hashStr, hexToRgb, normHex, shade, toast } from './core.js';
import { Engine } from './render.js';
import { World } from './world.js';
import { GAMES, Game, Modes } from './game.js';
import { Editor } from './skin-editor.js';
import { Skins } from './skins.js';
import { openSettings } from './settings-ui.js';
import { GAME_LIMITS, Library } from './library.js';
import { Net } from './net.js';
import { Studio } from './studio.js';

/* ---------- 14. Home: header and search, player card, rows of game tiles, game page ---------- */
export function statusLine() {
  if (!Caps.ready) return 'Checking your PlayForge profile…';
  if (Me.id && Caps.db) return Profile.where === 'cloud' ? 'Your skins and name are saved to your profile, so other players see them.' : 'Signed in. Save a skin to store it in your profile.';
  if (Me.id) return 'Signed in. Saving works on this device only for now.';
  return 'Playing as a guest. Your avatar is saved on this device.';
}
// Thumbnails are rendered one at a time while the home screen is idle, then cached in memory for the visit.
// The cache key is def.thumbKey when given (drafts add their updatedAt so an edited draft gets a fresh picture), else def.id.
export const Thumbs = {
  W: 400, H: 250, cache: new Map(), queue: [], busy: false, waiters: new Map(),
  key(def) { return def.thumbKey || def.id; },
  peek(def) { return this.cache.get(this.key(def)); },
  // urgent = true jumps the queue (the game page asks for its picture this way).
  get(def, cb, urgent) {
    const k = this.key(def);
    if (this.cache.has(k)) { cb(this.cache.get(k)); return; }
    if (!this.waiters.has(k)) { this.waiters.set(k, []); if (urgent) this.queue.unshift(def); else this.queue.push(def); }
    else if (urgent) { const i = this.queue.findIndex(d => this.key(d) === k); if (i > 0) this.queue.unshift(this.queue.splice(i, 1)[0]); }
    this.waiters.get(k).push(cb); this.pump();
  },
  // Drop a callback; when nobody waits for that picture any more it leaves the queue.
  cancel(def, cb) {
    const k = this.key(def), w = this.waiters.get(k); if (!w) return;
    const i = w.indexOf(cb); if (i >= 0) w.splice(i, 1);
    if (!w.length) { this.waiters.delete(k); const qi = this.queue.findIndex(d => this.key(d) === k); if (qi >= 0) this.queue.splice(qi, 1); }
  },
  store(k, url) {
    const m = /^draft:([^:]+):/.exec(k); // keep one picture per draft
    if (m) for (const old of [...this.cache.keys()]) if (old !== k && old.startsWith('draft:' + m[1] + ':')) this.cache.delete(old);
    this.cache.set(k, url);
  },
  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const run = () => {
      if (Engine.mode !== 'home' || !Engine.renderer) { this.busy = false; setTimeout(() => this.pump(), 800); return; }
      const def = this.queue.shift(); if (!def) { this.busy = false; return; }
      const k = this.key(def); let url = '';
      try {
        World.load(def, { edit: true });
        // Long courses sit far from the thumbnail camera: push the fog back so the level shows, not just haze.
        const tc = World.thumbCam && World.thumbCam(), fog = World.scene && World.scene.fog;
        if (tc && fog) {
          const d = Math.hypot(tc.pos[0] - tc.look[0], tc.pos[1] - tc.look[1], tc.pos[2] - tc.look[2]);
          fog.near = Math.max(fog.near, d * 0.85); fog.far = Math.max(fog.far, d * 2.6);
        }
        url = World.snapshot(this.W, this.H);
      } catch (e) { console.warn('PlayForge: thumbnail failed for', def.id, e); }
      try { World.unload(); } catch (e) { /* nothing loaded */ }
      this.store(k, url);
      const w = this.waiters.get(k) || []; this.waiters.delete(k);
      w.forEach(f => { try { f(url); } catch (e) { console.error(e); } });
      this.busy = false; if (this.queue.length) setTimeout(() => this.pump(), 30);
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 700 }); else setTimeout(run, 40);
  },
};

export const HOME_ICONS = new Set('plus play sliders back close undo redo pencil eraser bucket dropper mirror grid rotate dice upload download reset leave heart users check person jump chat send chev-up hand clock coin skull flag star moon sun log fire target trophy axe bolt blaster shield key gem drop stop berry eye move scale copy trash folder cube wedge ball cyl cursor search layers tree info'.split(' '));
export const HOME_CATS = [
  { id: 'obby', label: 'Obbies and towers', sub: 'Jump, climb and beat your best time' },
  { id: 'race', label: 'Racing', sub: 'Gates in order, rivals on your heels' },
  { id: 'arena', label: 'Blasters and battles', sub: 'Foam, snowballs and light. Last one standing wins' },
  { id: 'survival', label: 'Survival', sub: 'Keep the fire lit until morning' },
  { id: 'party', label: 'Party games', sub: 'Quick rounds for the whole room' },
  { id: 'explore', label: 'Explore and hang out', sub: 'Wander, collect and chat' },
];
export const HOME_FEATURED = ['splat-rivals', 'nights-pinewood', 'tower-of-trials', 'turbo-track', 'rising-lava', 'color-block-party'];
export const HOME_MODE_ICON = { rivals: 'blaster', koth: 'trophy', knockout: 'hand', paintpark: 'drop', nights: 'fire', shadehunt: 'eye', lantern: 'fire', obby: 'flag', race: 'trophy', collect: 'coin', treasure: 'gem', rise: 'drop', meteors: 'fire', blockdrop: 'users', colorblock: 'users', glassbridge: 'flag', maze: 'key', hangout: 'sun', free: 'flag', custom: 'cube' };
export const HOME_SWATCH = ['#FF6A2B', '#2D62F0', '#1A9F73', '#9A5BFF', '#E23E62', '#F0A81C', '#17A39C', '#3F9E57', '#7A4FD0', '#2E86D8'];

export function homeEl(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
export function homeIcon(name, fill) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
  s.setAttribute('class', 'i' + (fill ? ' fill' : '')); s.setAttribute('aria-hidden', 'true');
  u.setAttribute('href', '#i-' + (HOME_ICONS.has(name) ? name : 'cube')); s.appendChild(u); return s;
}
export function homeBtn(cls, icon, label, onClick, fill) {
  const b = homeEl('button', cls); b.type = 'button';
  if (icon) b.appendChild(homeIcon(icon, fill));
  b.appendChild(homeEl('span', 'lbl', label)); b.addEventListener('click', onClick); return b;
}
export function homeLight(hex) { const [r, g, b] = hexToRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 168; }
export function homeAgo(t) {
  if (!t) return 'Not saved yet';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Edited just now';
  if (s < 3600) return `Edited ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `Edited ${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) { const d = Math.floor(s / 86400); return `Edited ${d} day${d === 1 ? '' : 's'} ago`; }
  return 'Edited ' + new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function homeNorm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function homeCount(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }

export const Home = {
  ready: false, view: 'rows', allRow: null, rows: new Map(), io: null, renderT: 0, searchT: 0, dirty: false, memoScroll: 0,
  pageEntry: null, pageThumb: null, likeOverride: null, starting: false, lastName: null, _builtin: null, _modeCat: null,

  init() {
    $('#home-me').addEventListener('click', () => Editor.enter());
    $('#pc-edit').addEventListener('click', () => Editor.enter());
    $('#pc-make').addEventListener('click', () => this.makeGame());
    $('#hr-make').addEventListener('click', () => this.makeGame());
    $('#home-settings').addEventListener('click', () => openSettings());
    const q = $('#home-q');
    q.addEventListener('input', () => this.onSearchInput());
    $('#home-search').addEventListener('submit', e => { e.preventDefault(); clearTimeout(this.searchT); this.applySearch(); if (IS_TOUCH) q.blur(); });
    $('#home-q-clear').addEventListener('click', () => { this.leaveSearch(); q.focus(); });
    $('#hr-back').addEventListener('click', () => this.leaveSearch());
    $('#gp-play').addEventListener('click', () => { if (this.pageEntry) this.play(this.pageEntry); });
    $('#tx-form').addEventListener('submit', e => { e.preventDefault(); if (this._txSubmit) this._txSubmit(); });
    $('#tx-input').addEventListener('input', () => this.txCount());
    const home = $('#home');
    home.addEventListener('scroll', () => home.classList.toggle('scrolled', home.scrollTop > 4), { passive: true });
    let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => this.rows.forEach(r => this.updateArrows(r)), 150); });
    this.io = 'IntersectionObserver' in window ? new IntersectionObserver(en => this.onSeen(en), { rootMargin: '280px 160px' }) : null;
    Engine.views.home = { onEscape: () => this.onEscape(), onKey: e => this.onKey(e) };
    this.buildShelves();
    Library.onChange(() => this.scheduleRender());
    this.ready = true;
    this.renderRows(true);
  },

  // ---- entries: one shape for built-in games, community games, your drafts ----
  modeCat(mode) {
    if (!this._modeCat) {
      this._modeCat = {};
      for (const g of GAMES) if (HOME_CATS.some(c => c.id === g.cat) && !this._modeCat[g.mode]) this._modeCat[g.mode] = g.cat;
    }
    return this._modeCat[mode] || null;
  },
  accentFor(id) { return HOME_SWATCH[hashStr(String(id)) % HOME_SWATCH.length]; },
  fromBuiltin(def) {
    return { key: 'b:' + def.id, kind: 'builtin', id: def.id, title: def.title, desc: def.desc || '', creator: def.creator || 'PlayForge',
      accent: normHex(def.accent) || this.accentFor(def.id), icon: def.icon || HOME_MODE_ICON[def.mode] || 'flag', mode: def.mode, cat: def.cat, featured: !!def.featured, def };
  },
  fromSummary(s) {
    return { key: 'c:' + s.creatorId + '/' + s.id, kind: 'community', id: s.id, title: s.title, desc: s.desc || '', creator: s.creatorName || 'A player',
      accent: this.accentFor(s.id), icon: HOME_MODE_ICON[s.mode] || 'cube', mode: s.mode, cat: this.modeCat(s.mode), summary: s,
      mine: !!Me.id && s.creatorId === Me.id, createdAt: s.createdAt || s.updatedAt || 0, updatedAt: s.updatedAt || 0, thumbUrl: s.thumb || '' };
  },
  fromDraft(doc, name) {
    const thumb = typeof doc.thumb === 'string' && doc.thumb.startsWith('data:image/') ? doc.thumb : '';
    return { key: 'd:' + doc.id, kind: 'draft', id: doc.id, title: doc.title || 'Untitled game', desc: doc.desc || '', creator: name || Profile.displayName(),
      accent: this.accentFor(doc.id), icon: HOME_MODE_ICON[doc.mode] || 'cube', mode: doc.mode, cat: this.modeCat(doc.mode), doc,
      published: !!doc.publishedAt, updatedAt: doc.updatedAt || 0, parts: Array.isArray(doc.parts) ? doc.parts.length : 0, thumbUrl: thumb };
  },
  fromDef(def) { // any other playable definition handed to openGamePage()
    return { key: 'x:' + def.id, kind: 'def', id: def.id, title: def.title || 'Untitled game', desc: def.desc || '', creator: def.creator || 'A player',
      accent: normHex(def.accent) || this.accentFor(def.id), icon: def.icon || HOME_MODE_ICON[def.mode] || 'cube', mode: def.mode, cat: this.modeCat(def.mode), def,
      thumbUrl: typeof def.thumbUrl === 'string' && def.thumbUrl.startsWith('data:image/') ? def.thumbUrl : '' };
  },
  builtin() { if (!this._builtin) this._builtin = GAMES.map(d => this.fromBuiltin(d)); return this._builtin; },
  catalog() {
    const name = Profile.displayName(), drafts = Library.drafts().map(d => this.fromDraft(d, name)), byId = new Map(drafts.map(d => [d.id, d]));
    const community = Library.published.map(s => { const e = this.fromSummary(s); if (e.mine && byId.has(e.id)) e.local = byId.get(e.id); return e; });
    return { builtin: this.builtin(), drafts, community };
  },
  catsOf(e) {
    const out = [];
    if (e.kind === 'builtin') {
      if (HOME_CATS.some(c => c.id === e.cat)) out.push(e.cat);
      if (e.mode === 'rivals' && !out.includes('arena')) out.push('arena');
      if (e.mode === 'nights' && !out.includes('survival')) out.push('survival');
    } else if (e.cat) out.push(e.cat);
    return out;
  },
  catLabel(e) { const c = HOME_CATS.find(x => x.id === this.catsOf(e)[0]); return c ? c.label : ''; },
  likeKey(e) { return e.kind === 'draft' && !e.published ? null : e.id; },
  likes(e) { const k = this.likeKey(e); return k ? Library.likes(k) : 0; },
  online(e) { return Net.lobby ? Net.onlineCount(e.id) : null; },
  badge(e) { return e.kind === 'draft' ? (e.published ? 'Published' : 'Draft') : e.kind === 'community' && e.mine ? 'Yours' : ''; },
  thumbSrc(e) {
    if (e.local) return this.thumbSrc(e.local); // your own published game: the draft on this device has the freshest picture
    if (e.thumbUrl) return { url: e.thumbUrl };
    if (e.kind === 'builtin' || e.kind === 'def') return { def: e.def };
    if (e.kind === 'draft') return { def: Object.assign(Library.toDef(e.doc, e.creator), { thumbKey: 'draft:' + e.id + ':' + (e.updatedAt || 0) }) };
    return null; // community game without a picture: the designed placeholder stays
  },

  // ---- shelves ----
  shelfDefs() {
    return [
      { id: 'featured', title: 'Featured', sub: 'Big games to start with', hero: true },
      { id: 'mine', title: 'Your games', sub: 'Saved on this device. Publish from Studio to share them' },
      { id: 'popular', title: 'Popular', sub: 'Most liked by players' },
      { id: 'new', title: 'New', sub: 'Just published by players' },
      ...HOME_CATS.map(c => ({ id: 'cat-' + c.id, title: c.label, sub: c.sub })),
    ];
  },
  buildShelves() {
    const root = $('#home-rows'); root.textContent = '';
    for (const s of this.shelfDefs()) {
      const sec = homeEl('section', 'shelf' + (s.hero ? ' shelf-hero' : '')), hid = 'sh-' + s.id;
      sec.dataset.row = s.id; sec.setAttribute('aria-labelledby', hid);
      const head = homeEl('div', 'shelf-head'), txt = homeEl('div', 'sh-text'), h = homeEl('h2', null, s.title); h.id = hid;
      txt.append(h, homeEl('small', null, s.sub));
      const acts = homeEl('div', 'sh-acts');
      const all = homeEl('button', 'sh-all', 'See all'); all.type = 'button'; all.hidden = true; all.addEventListener('click', () => this.showAll(s.id));
      const row = homeEl('div', 'tile-row' + (s.hero ? ' hero-row' : ''));
      const prev = homeEl('button', 'icon-btn sh-arrow'); prev.type = 'button'; prev.appendChild(homeIcon('back')); prev.setAttribute('aria-label', `Scroll ${s.title} back`);
      const next = homeEl('button', 'icon-btn sh-arrow sh-next'); next.type = 'button'; next.appendChild(homeIcon('back')); next.setAttribute('aria-label', `Scroll ${s.title} forward`);
      prev.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth * 0.85, behavior: 'smooth' }));
      next.addEventListener('click', () => row.scrollBy({ left: row.clientWidth * 0.85, behavior: 'smooth' }));
      acts.append(all, prev, next); head.append(txt, acts); sec.append(head, row); root.appendChild(sec);
      const r = { def: s, sec, row, all, prev, next, sig: null, items: [] }; this.rows.set(s.id, r);
      let raf = 0; row.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.updateArrows(r); }); }, { passive: true });
      sec.addEventListener('pointerenter', () => this.updateArrows(r));
    }
  },
  updateArrows(r) {
    const row = r.row, max = row.scrollWidth - row.clientWidth - 2;
    r.prev.disabled = row.scrollLeft <= 2; r.next.disabled = row.scrollLeft >= max;
    r.sec.classList.toggle('scrolls', max > 2);
  },
  // Featured first, then one game from each kind in turn, so an unliked Popular row still has variety.
  mixOrder(list) {
    const used = new Set(), out = [], byId = new Map(list.map(e => [e.id, e]));
    for (const id of HOME_FEATURED) { const e = byId.get(id); if (e) { out.push(e); used.add(e); } }
    const lanes = HOME_CATS.map(c => list.filter(e => !used.has(e) && e.cat === c.id));
    for (let i = 0, more = true; more; i++) { more = false; for (const l of lanes) if (i < l.length) { out.push(l[i]); used.add(l[i]); more = true; } }
    for (const e of list) if (!used.has(e)) out.push(e);
    return out;
  },
  scheduleRender() { clearTimeout(this.renderT); this.renderT = setTimeout(() => this.renderRows(), 150); },
  renderRows(force) {
    if (!this.ready) return;
    if (!force && $('#home').hidden) { this.dirty = true; return; } // built when you come back
    this.dirty = false;
    const { builtin, drafts, community } = this.catalog();
    const byId = new Map(builtin.map(e => [e.id, e]));
    const newest = community.slice().sort((a, b) => b.createdAt - a.createdAt);
    this.fill('featured', HOME_FEATURED.map(id => byId.get(id)).filter(Boolean));
    this.fill('mine', drafts, { plus: true, empty: ['Your games show up here', 'Start from a blank baseplate, or open any game and tap Edit a copy.'] });
    const pop = this.mixOrder(builtin).concat(newest).map((e, i) => ({ e, i, l: this.likes(e), o: this.online(e) || 0 }))
      .sort((a, b) => b.l - a.l || b.o - a.o || a.i - b.i).map(x => x.e);
    this.fill('popular', pop, { limit: 24 });
    this.fill('new', newest, { limit: 30, empty: ['Nothing new yet', 'Games people publish from Studio land here, newest first. Make one and be the first.'] });
    for (const c of HOME_CATS) this.fill('cat-' + c.id, builtin.concat(community).filter(e => this.catsOf(e).includes(c.id)));
    if (this.view === 'search') this.applySearch();
    else if (this.view === 'all') this.showAll(this.allRow, true);
    this.updateOnline();
    if (this.view === 'rows') this.rows.forEach(r => this.updateArrows(r));
    if (this.pageEntry) this.refreshPage();
  },
  sig(e) { const p = e.local || e; return [e.key, e.title, e.creator, this.likes(e), this.badge(e), p.updatedAt || 0, p.thumbUrl ? p.thumbUrl.length : 0, e.desc.length].join('|'); },
  fill(id, items, opts = {}) {
    const r = this.rows.get(id); if (!r) return;
    r.items = items;
    const shown = opts.limit ? items.slice(0, opts.limit) : items;
    r.all.hidden = r.def.hero || items.length < 5;
    r.all.textContent = `See all ${items.length}`; r.all.setAttribute('aria-label', `See all ${items.length} games in ${r.def.title}`);
    const sig = (opts.plus ? '+\n' : '') + shown.map(e => this.sig(e)).join('\n');
    if (sig === r.sig) return;
    r.sig = sig;
    const keep = r.row.scrollLeft;
    this.release(r.row);
    if (opts.plus) r.row.appendChild(this.plusTile());
    for (const e of shown) r.row.appendChild(r.def.hero ? this.hero(e) : this.tile(e));
    if (!shown.length && opts.empty) {
      const c = homeEl('div', 'empty-card' + (opts.plus ? ' empty-side' : ' empty-row'));
      c.append(homeEl('strong', null, opts.empty[0]), homeEl('span', null, opts.empty[1])); r.row.appendChild(c);
    }
    r.row.scrollLeft = keep;
  },

  // ---- tiles ----
  thumb(e, cls) {
    const th = homeEl('span', 'thumb' + (cls ? ' ' + cls : ''));
    th.style.setProperty('--accent', e.accent); th.style.setProperty('--accent-2', shade(e.accent, -0.45));
    if (homeLight(e.accent)) th.classList.add('light');
    const ph = homeEl('span', 'ph'), big = homeIcon(e.icon), ic = homeEl('span', 'ph-icon');
    ph.setAttribute('aria-hidden', 'true'); big.classList.add('ph-big'); ic.appendChild(homeIcon(e.icon)); ph.append(big, ic);
    const img = homeEl('img'); img.alt = ''; img.decoding = 'async'; img.draggable = false;
    th.append(ph, img);
    return th;
  },
  showImg(th, url) {
    if (!url) { th.classList.remove('loading'); return; }
    const img = th.querySelector('img');
    img.onload = () => { th.classList.remove('loading'); th.classList.add('ready'); };
    img.onerror = () => th.classList.remove('loading');
    img.src = url;
  },
  // Pictures load only when their tile scrolls near the screen.
  lazy(holder, th, e) {
    const src = this.thumbSrc(e); if (!src) return;
    if (src.def) { const c = Thumbs.peek(src.def); if (c !== undefined) { this.showImg(th, c); return; } }
    holder._thumb = { th, url: src.url, def: src.def, pending: false, cb: null };
    if (this.io) this.io.observe(holder); else this.loadThumb(holder);
  },
  loadThumb(holder) {
    const t = holder._thumb; if (!t || t.pending) return;
    if (t.url) { this.unwatch(holder); this.showImg(t.th, t.url); return; }
    t.pending = true; t.th.classList.add('loading');
    t.cb = url => { t.pending = false; this.unwatch(holder); this.showImg(t.th, url); };
    Thumbs.get(t.def, t.cb);
  },
  unwatch(holder) {
    if (this.io) this.io.unobserve(holder);
    const t = holder._thumb; holder._thumb = null;
    if (t && t.pending) { Thumbs.cancel(t.def, t.cb); t.pending = false; }
  },
  onSeen(entries) {
    for (const en of entries) {
      const h = en.target, t = h._thumb;
      if (!t) { this.io.unobserve(h); continue; }
      if (en.isIntersecting) this.loadThumb(h);
      else if (t.pending) { Thumbs.cancel(t.def, t.cb); t.pending = false; t.th.classList.remove('loading'); }
    }
  },
  release(box) { for (const c of box.children) if (c._thumb) this.unwatch(c); box.textContent = ''; },
  onlineTag(e) {
    const s = homeEl('span', 't-on'); s.dataset.online = e.id;
    s.append(homeEl('i', 'dot-online'), homeEl('span', 't-online', 'Solo')); return s;
  },
  tile(e) {
    const t = homeEl('button', 'tile'); t.type = 'button';
    const th = this.thumb(e), badge = this.badge(e), likes = this.likes(e);
    if (badge) th.appendChild(homeEl('span', 'badge badge-' + badge.toLowerCase(), badge));
    if (likes > 0) { const l = homeEl('span', 'likes'); l.append(homeIcon('heart', true), homeEl('span', null, homeCount(likes))); th.appendChild(l); }
    const meta = homeEl('span', 't-meta');
    meta.appendChild(homeEl('span', 't-by', 'by ' + e.creator));
    if (e.kind === 'draft' && !e.published) meta.appendChild(homeEl('span', 't-on', homeAgo(e.updatedAt).replace('Edited ', '')));
    else meta.appendChild(this.onlineTag(e));
    t.append(th, homeEl('span', 't-title', e.title), meta);
    const label = `${e.title}, by ${e.creator}` + (badge ? `, ${badge.toLowerCase()}` : '') + (likes ? `, ${likes} ${likes === 1 ? 'like' : 'likes'}` : '');
    t.dataset.label = label; t.setAttribute('aria-label', label);
    t.addEventListener('click', () => { Sfx.play('click'); this.openEntry(e); });
    this.lazy(t, th, e);
    return t;
  },
  hero(e) {
    const a = homeEl('article', 'hero'); a.style.setProperty('--accent', e.accent);
    const th = this.thumb(e, 'hero-art');
    const open = homeEl('button', 'hero-open'); open.type = 'button'; open.setAttribute('aria-label', `${e.title}, by ${e.creator}. Open game page`);
    open.addEventListener('click', () => { Sfx.play('click'); this.openEntry(e); });
    open.addEventListener('contextmenu', ev => { ev.preventDefault(); this.openEntry(e); });
    const body = homeEl('div', 'hero-body'), cta = homeEl('div', 'hero-cta');
    const play = homeBtn('btn btn-ember hero-play', 'play', 'Play', () => this.play(e), true); play.setAttribute('aria-label', 'Play ' + e.title);
    cta.append(play, this.onlineTag(e));
    body.append(homeEl('span', 'hero-kicker', this.catLabel(e) || 'Featured'), homeEl('h3', 'hero-title', e.title), homeEl('p', 'hero-desc', e.desc), cta);
    a.append(th, homeEl('span', 'hero-shade'), open, body);
    this.lazy(a, th, e);
    return a;
  },
  plusTile() {
    const t = homeEl('button', 'tile tile-plus'); t.type = 'button'; t.setAttribute('aria-label', 'Make a new game');
    const th = homeEl('span', 'thumb plus-art'), p = homeEl('span', 'plus'); p.appendChild(homeIcon('plus')); th.appendChild(p);
    t.append(th, homeEl('span', 't-title', 'New game'), homeEl('span', 't-meta', 'Start from a baseplate'));
    t.addEventListener('click', () => this.makeGame());
    return t;
  },
  updateOnline() {
    if (!this.ready) return;
    const lobby = !!Net.lobby;
    for (const el of $$('#home [data-online]')) {
      const n = lobby ? Net.onlineCount(el.dataset.online) : null, txt = n === null ? 'Solo' : `${n} online`;
      const o = el.querySelector('.t-online'); if (o && o.textContent !== txt) o.textContent = txt;
      el.classList.toggle('live', !!n);
      const tile = el.closest('[data-label]');
      if (tile) { const l = tile.dataset.label + '. ' + (n === null ? 'Solo play' : txt); if (tile.getAttribute('aria-label') !== l) tile.setAttribute('aria-label', l); }
    }
    const e = this.pageEntry;
    if (e) {
      const n = e.kind === 'draft' && !e.published ? null : this.online(e);
      $('#gp-online').textContent = n === null ? (e.kind === 'draft' && !e.published ? 'Only you' : 'Solo') : !n ? 'Nobody playing right now' : n === 1 ? '1 player here now' : `${n} players here now`;
      $('#gp-online-wrap').classList.toggle('live', !!n);
    }
  },

  // ---- search and See all ----
  onSearchInput() {
    $('#home-q-clear').hidden = !$('#home-q').value;
    clearTimeout(this.searchT); this.searchT = setTimeout(() => this.applySearch(), 90);
  },
  searchPool() {
    const { builtin, drafts, community } = this.catalog(), mineIds = new Set(drafts.map(d => d.id));
    return builtin.concat(community.filter(c => !(c.mine && mineIds.has(c.id))), drafts);
  },
  hay(e) {
    const labels = this.catsOf(e).map(c => HOME_CATS.find(x => x.id === c).label);
    if (e.featured) labels.push('Featured');
    if (e.kind === 'draft') labels.push('Your games', this.badge(e));
    if (e.kind === 'community') labels.push('Community');
    const m = Modes[e.mode]; if (m && m.label) labels.push(m.label);
    return { t: homeNorm(e.title), c: homeNorm(e.creator), l: homeNorm(labels.join(' ')), d: homeNorm(e.desc) };
  },
  score(e, words) {
    const h = this.hay(e); let s = 0;
    for (const w of words) {
      const v = h.t.includes(w) ? 6 : h.c.includes(w) ? 4 : h.l.includes(w) ? 3 : h.d.includes(w) ? 1 : 0;
      if (!v) return 0; s += v;
    }
    if (h.t.startsWith(words[0])) s += 4;
    return s;
  },
  applySearch() {
    const raw = $('#home-q').value.trim();
    $('#home-q-clear').hidden = !$('#home-q').value;
    if (!raw) { if (this.view === 'search') this.showRows(); return; }
    const words = homeNorm(raw).split(/\s+/).filter(Boolean);
    const list = this.searchPool().map((e, i) => ({ e, i, s: this.score(e, words) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.e);
    $('#hr-empty-title').textContent = `No games match “${raw}”`;
    this.showGrid('search', 'Search results', list.length === 1 ? '1 game' : `${list.length} games`, list);
  },
  showAll(id, keep) {
    const r = this.rows.get(id); if (!r) { this.showRows(); return; }
    this.allRow = id;
    $('#hr-empty-title').textContent = 'Nothing here yet';
    this.showGrid('all', r.def.title, r.items.length === 1 ? '1 game' : `${r.items.length} games`, r.items, keep);
  },
  showGrid(view, title, sub, list, keep) {
    const was = this.view;
    if (was === 'rows') this.memoScroll = $('#home').scrollTop;
    this.view = view;
    $('#home-rows').hidden = true; $('#home-card').hidden = true; $('#home-results').hidden = false;
    $('#hr-title').textContent = title; $('#hr-count').textContent = sub;
    $('#hr-back').setAttribute('aria-label', view === 'search' ? 'Clear search' : 'Back to all games');
    const grid = $('#hr-grid'), top = $('#home').scrollTop;
    this.release(grid);
    for (const e of list) grid.appendChild(this.tile(e));
    grid.hidden = !list.length; $('#hr-empty').hidden = !!list.length;
    if (was === 'rows' && !keep) $('#home').scrollTop = 0; else $('#home').scrollTop = top;
    this.updateOnline();
  },
  showRows() {
    if (this.view === 'rows') return;
    this.view = 'rows'; this.allRow = null;
    this.release($('#hr-grid'));
    $('#home-results').hidden = true; $('#home-rows').hidden = false; $('#home-card').hidden = false;
    if (this.dirty) this.renderRows(true);
    this.rows.forEach(r => this.updateArrows(r));
    $('#home').scrollTop = this.memoScroll;
  },
  leaveSearch() {
    clearTimeout(this.searchT);
    $('#home-q').value = ''; $('#home-q-clear').hidden = true;
    this.showRows();
  },
  onEscape() {
    if (this.view !== 'rows') { this.leaveSearch(); return; }
    const q = $('#home-q'); if (document.activeElement === q) q.blur();
  },
  onKey(e) {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); const q = $('#home-q'); q.focus(); q.select(); }
  },

  // ---- game page ----
  // Public: open the page for any game definition (built-in, Library.toDef, or a def handed over by Studio).
  openGamePage(def) {
    if (!def) return;
    const d = Library.getDraft(def.id);
    let e;
    if (def.builtin) e = this.builtin().find(x => x.id === def.id) || this.fromBuiltin(def);
    else if (d) e = this.fromDraft(d, Profile.displayName());
    else { const s = Library.published.find(g => g.id === def.id); e = s ? this.fromSummary(s) : this.fromDef(def); }
    this.openEntry(e);
  },
  openEntry(e) {
    if (e.kind === 'community' && e.mine) { const d = Library.getDraft(e.id); if (d) e = this.fromDraft(d, Profile.displayName()); }
    const m = $('#gamepage-modal'), was = !m.hidden;
    this.pageEntry = e; this.likeOverride = null; this.renderPage();
    if (!was) { this.opener = document.activeElement; Modals.open(m); m.onClose = () => this.closedPage(); }
  },
  closedPage() {
    this.pageEntry = null; this.likeOverride = null;
    const o = this.opener; this.opener = null; // keyboard users land back on the tile they opened
    if (o && o.isConnected && o.focus && Engine.mode === 'home' && !Modals.top()) { try { o.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    if (this.pageThumb) { const t = this.pageThumb; if (t.cb) Thumbs.cancel(t.def, t.cb); this.pageThumb = null; }
  },
  setPageThumb(e) {
    const sig = e.key + '|' + (e.thumbUrl ? e.thumbUrl.length : 0) + '|' + (e.updatedAt || 0);
    if (this.pageThumb && this.pageThumb.sig === sig) return;
    if (this.pageThumb && this.pageThumb.cb) Thumbs.cancel(this.pageThumb.def, this.pageThumb.cb);
    const art = $('#gp-art'), old = art.querySelector('.thumb'); if (old) old.remove();
    const th = this.thumb(e, 'gp-pic'); art.insertBefore(th, art.firstChild);
    const src = this.thumbSrc(e), t = { sig, def: src && src.def, cb: null }; this.pageThumb = t;
    if (!src) return;
    if (src.url) { this.showImg(th, src.url); return; }
    const c = Thumbs.peek(src.def); if (c !== undefined) { this.showImg(th, c); return; }
    th.classList.add('loading');
    t.cb = url => { t.cb = null; this.showImg(th, url); };
    Thumbs.get(src.def, t.cb, true);
  },
  renderPage() {
    const e = this.pageEntry; if (!e) return;
    this.setPageThumb(e);
    $('#gp-title').textContent = e.title;
    $('#gp-creator').textContent = 'by ' + e.creator;
    $('#gp-desc').textContent = e.desc || (e.kind === 'draft' ? 'No description yet. Add one in Studio.' : 'No description yet.');
    const chips = $('#gp-chips'); chips.textContent = '';
    const chip = (t, cls) => chips.appendChild(homeEl('span', 'gp-chip' + (cls ? ' ' + cls : ''), t));
    if (e.featured) chip('Featured', 'ember');
    for (const c of this.catsOf(e)) chip(HOME_CATS.find(x => x.id === c).label);
    if (e.kind === 'draft') chip(e.published ? 'Published' : 'Draft', e.published ? 'mint' : 'ink');
    else if (e.kind === 'community') chip(e.mine ? 'Yours' : 'Community');
    $('#gp-edited-wrap').hidden = e.kind !== 'draft';
    if (e.kind === 'draft') $('#gp-edited').textContent = `${homeAgo(e.updatedAt)} · ${e.parts} ${e.parts === 1 ? 'part' : 'parts'}`;
    this.setBusy(this.starting);
    // actions
    const more = $('#gp-more'); more.textContent = '';
    let note = '';
    if (e.kind === 'draft') {
      more.appendChild(homeBtn('btn', 'cube', 'Edit in Studio', () => this.editDraft(e)));
      more.appendChild(homeBtn('btn', 'pencil', 'Rename', () => this.rename(e)));
      if (e.published && Caps.db) more.appendChild(homeBtn('btn', 'download', 'Unpublish', () => this.unpublish(e)));
      more.appendChild(homeBtn('btn btn-danger', 'trash', 'Delete', () => this.remove(e)));
      if (!e.published) note = Library.canPublish() ? 'Only you can see this draft. Publish it from Studio so others can play.' : 'Only you can see this draft. It is saved on this device.';
    } else {
      if (Caps.db && this.likeKey(e)) {
        const b = homeBtn('btn gp-like', 'heart', 'Like', () => this.like(e)); b.appendChild(homeEl('span', 'n', '0')); b.id = 'gp-like'; more.appendChild(b);
      }
      more.appendChild(homeBtn('btn', 'copy', 'Edit a copy', () => this.editCopy(e)));
    }
    more.classList.toggle('two', more.children.length === 4);
    $('#gp-note').hidden = !note; $('#gp-note').textContent = note;
    this.renderPageLike();
    this.updateOnline();
  },
  renderPageLike() {
    const e = this.pageEntry; if (!e) return;
    const key = this.likeKey(e), show = !!(Caps.db && key);
    let liked = key ? Library.liked(key) : false, n = key ? Library.likes(key) : 0;
    const o = this.likeOverride;
    if (o && o.id === key) { if (o.liked === liked) this.likeOverride = null; else { liked = o.liked; n = Math.max(0, o.n); } }
    $('#gp-likes-wrap').hidden = !show;
    $('#gp-likes').textContent = n === 1 ? '1 like' : `${homeCount(n)} likes`;
    const b = $('#gp-like'); if (!b) return;
    b.setAttribute('aria-pressed', liked ? 'true' : 'false');
    b.querySelector('svg').setAttribute('class', 'i' + (liked ? ' fill' : ''));
    b.querySelector('.lbl').textContent = liked ? 'Liked' : 'Like';
    b.querySelector('.n').textContent = homeCount(n);
    b.setAttribute('aria-label', `${liked ? 'Liked' : 'Like'}, ${n} ${n === 1 ? 'like' : 'likes'}`);
  },
  refreshPage() {
    const e = this.pageEntry; if (!e) return;
    let next = e;
    if (e.kind === 'draft') {
      const d = Library.getDraft(e.id);
      if (!d) { Modals.close($('#gamepage-modal')); return; }
      next = this.fromDraft(d, Profile.displayName());
    } else if (e.kind === 'community') {
      const s = Library.published.find(g => g.id === e.id && g.creatorId === e.summary.creatorId); if (s) next = this.fromSummary(s);
    }
    this.pageEntry = next; this.renderPage();
  },
  setBusy(on) {
    const b = $('#gp-play'); b.disabled = !!on;
    $('#gp-play-label').textContent = on ? 'Loading…' : 'Play';
  },

  // ---- actions ----
  studio() {
    if (typeof Studio === 'undefined') { toast('Studio is loading. Try again in a moment.'); return null; }
    return Studio;
  },
  makeGame() {
    Sfx.play('click');
    const S = this.studio(); if (!S) return;
    this.navAway(); S.newGame();
  },
  editDraft(e) {
    const S = this.studio(); if (!S) return;
    const d = Library.getDraft(e.id); if (!d) { toast('That game is no longer on this device.', true); return; }
    this.navAway(); S.open(d);
  },
  async editCopy(e) {
    if (!this.studio()) return;
    const def = await this.defFor(e); if (!def) return;
    if (!this.studio()) return;
    this.navAway(); Studio.remix(def);
  },
  // The playable definition behind an entry; community games are fetched first.
  async defFor(e) {
    if (e.kind === 'builtin' || e.kind === 'def') return e.def;
    if (e.kind === 'draft') { const d = Library.getDraft(e.id) || e.doc; return Library.toDef(d, Profile.displayName()); }
    if (this.starting) return null;
    this.starting = true; this.setBusy(true);
    let def = null;
    try { def = await Library.loadPublished(e.summary); } catch (err) { console.warn('PlayForge: could not load game', err); }
    this.starting = false; this.setBusy(false);
    if (!def) toast("This game couldn't be loaded. It may have been unpublished.", true);
    return def;
  },
  async play(e) {
    if (Engine.mode !== 'home' || this.starting) return;
    const def = await this.defFor(e);
    if (!def || Engine.mode !== 'home') return;
    this.navAway();
    Game.enter(def);
  },
  // Leaving home for a game or Studio: close the page without handing focus back to a tile that is about to hide.
  navAway() {
    this.opener = null; Modals.close($('#gamepage-modal'));
    const a = document.activeElement; if (a && a !== document.body && a.blur && $('#home').contains(a)) a.blur();
  },
  async like(e) {
    const key = this.likeKey(e);
    if (!Caps.db || !key) return;
    if (!Me.id) { toast('Sign in to like games.'); return; }
    if (this.liking) return;
    this.liking = true;
    const was = this.likeOverride && this.likeOverride.id === key ? this.likeOverride.liked : Library.liked(key);
    const base = this.likeOverride && this.likeOverride.id === key ? this.likeOverride.n : Library.likes(key);
    this.likeOverride = { id: key, liked: !was, n: base + (was ? -1 : 1), at: Date.now() };
    this.renderPageLike(); Sfx.play(was ? 'click' : 'pop');
    try { await Library.toggleLike(key); }
    catch (err) { console.warn('PlayForge: like failed', err); this.likeOverride = null; this.renderPageLike(); toast("Couldn't save your like. Try again.", true); }
    this.liking = false;
    setTimeout(() => { if (this.likeOverride && this.likeOverride.id === key) { this.likeOverride = null; this.renderPageLike(); } }, 4000);
  },
  async rename(e) {
    const d = Library.getDraft(e.id); if (!d) return;
    const v = await this.askText({ title: 'Rename game', label: 'Game name', value: d.title || '', max: GAME_LIMITS.title, ok: 'Save name', help: 'Shown on the tile and the game page.' });
    if (v == null) return;
    const title = WordFilter.clean(v.trim().slice(0, GAME_LIMITS.title));
    if (!title || title === d.title) return;
    try { await Library.rename(e.id, title); Sfx.play('save'); toast('Renamed to ' + title); }
    catch (err) { console.warn('PlayForge: rename failed', err); toast("Renamed here, but the published copy didn't update. Try again later.", true); }
    this.refreshPage();
  },
  async unpublish(e) {
    const v = await askChoice({ title: 'Unpublish this game?', body: `“${e.title}” leaves Popular and New, and nobody else can play it. Your draft stays on this device.`,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Unpublish', value: 'go', kind: 'danger' }] });
    if (v !== 'go') return;
    try { await Library.unpublish(e.id); toast('Unpublished. Your draft is still here.'); }
    catch (err) { console.warn('PlayForge: unpublish failed', err); toast("Couldn't unpublish right now. Try again.", true); }
    this.refreshPage();
  },
  async remove(e) {
    const d = Library.getDraft(e.id); if (!d) return;
    const pub = !!d.publishedAt;
    const v = await askChoice({ title: 'Delete this game?',
      body: pub ? `“${e.title}” is removed from this device and unpublished, so nobody can play it. This can't be undone.` : `“${e.title}” is removed from this device. This can't be undone.`,
      buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete game', value: 'delete', kind: 'danger' }] });
    if (v !== 'delete') return;
    if (pub && Caps.db && Me.id) {
      try { await Library.unpublish(e.id); }
      catch (err) { console.warn('PlayForge: unpublish failed', err); toast("Couldn't unpublish it, so it wasn't deleted. Try again.", true); return; }
    }
    Library.deleteDraft(e.id);
    Modals.close($('#gamepage-modal'));
    Sfx.play('break'); toast('Game deleted.');
  },
  // A small sheet for typing one line of text. Resolves to the text, or null when closed.
  askText({ title, label, value = '', max = 40, ok = 'Save', help = '' }) {
    return new Promise(resolve => {
      const m = $('#text-modal'), inp = $('#tx-input');
      $('#tx-title').textContent = title; $('#tx-label').textContent = label; $('#tx-ok').textContent = ok;
      this._txHelp = help; $('#tx-help').textContent = help; $('#tx-help').classList.remove('bad');
      inp.maxLength = max; inp.value = String(value).slice(0, max); this.txCount();
      let done = false;
      const finish = v => { if (done) return; done = true; this._txSubmit = null; resolve(v); };
      this._txSubmit = () => {
        if (!inp.value.trim()) { $('#tx-help').textContent = 'Type a name first.'; $('#tx-help').classList.add('bad'); Sfx.play('error'); inp.focus(); return; }
        finish(inp.value); Modals.close(m);
      };
      Modals.open(m); m.onClose = () => finish(null);
      setTimeout(() => { try { inp.select(); } catch (e) { /* not focusable yet */ } }, 40);
    });
  },
  txCount() {
    const inp = $('#tx-input'); $('#tx-count').textContent = `${inp.value.length}/${inp.maxLength}`;
    if ($('#tx-help').classList.contains('bad') && inp.value.trim()) { $('#tx-help').textContent = this._txHelp || ''; $('#tx-help').classList.remove('bad'); }
  },

  // ---- profile and coming back ----
  renderMe() {
    const name = Profile.displayName();
    $('#home-me-name').textContent = name; $('#pc-name').textContent = name;
    $('#home-me').setAttribute('aria-label', `Edit your avatar, ${name}`);
    drawHead($('#home-me-head'), Skins.worn); drawFigure($('#home-fig'), Skins.worn);
    $('#pc-status').textContent = statusLine();
    if (this.ready && name !== this.lastName) { this.lastName = name; this.scheduleRender(); }
  },
  onReturn() {
    this.renderRows(true);
    this.rows.forEach(r => this.updateArrows(r));
    Thumbs.pump();
  },
};
