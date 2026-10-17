// Home screen data: one entry shape for built-in games, published community games and your drafts, the rows built
// from them, and search. Pure functions over the engine module E (they never touch the DOM).
//
// Entry: {key, kind: 'builtin' | 'community' | 'draft', id, title, desc, creator, accent, icon, mode, cat, ...}
//   builtin   + {def, featured}
//   community + {summary, mine, createdAt, updatedAt, thumbUrl, local (your draft of it on this device, if any)}
//   draft     + {doc, published, updatedAt, parts, thumbUrl}

export const HOME_CATS = [
  { id: 'obby', label: 'Obbies and towers', sub: 'Jump, climb and beat your best time' },
  { id: 'race', label: 'Racing', sub: 'Gates in order, rivals on your heels' },
  { id: 'arena', label: 'Blasters and battles', sub: 'Foam, snowballs and light. Last one standing wins' },
  { id: 'survival', label: 'Survival', sub: 'Keep the fire lit until morning' },
  { id: 'party', label: 'Party games', sub: 'Quick rounds for the whole room' },
  { id: 'explore', label: 'Explore and hang out', sub: 'Wander, collect and chat' },
];
export const HOME_FEATURED = ['splat-rivals', 'nights-pinewood', 'tower-of-trials', 'turbo-track', 'rising-lava', 'color-block-party'];
const MODE_ICON = { rivals: 'blaster', koth: 'trophy', knockout: 'hand', paintpark: 'drop', nights: 'fire', shadehunt: 'eye', lantern: 'fire', obby: 'flag', race: 'trophy', collect: 'coin', treasure: 'gem', rise: 'drop', meteors: 'fire', blockdrop: 'users', colorblock: 'users', glassbridge: 'flag', maze: 'key', hangout: 'sun', free: 'flag', custom: 'cube' };
const SWATCH = ['#FF6A2B', '#2D62F0', '#1A9F73', '#9A5BFF', '#E23E62', '#F0A81C', '#17A39C', '#3F9E57', '#7A4FD0', '#2E86D8'];
// Symbols in the sprite (playforge/web/icons.js); anything else draws the cube.
const ICONS = new Set('plus play sliders back close undo redo pencil eraser bucket dropper mirror grid rotate dice upload download reset leave heart users check person jump chat send chev-up hand clock coin skull flag star moon sun log fire target trophy axe bolt blaster shield key gem drop stop berry eye move scale copy trash folder cube wedge ball cyl cursor search layers tree info'.split(' '));
export const iconName = n => (ICONS.has(n) ? n : 'cube');

export const ROWS = [
  { id: 'featured', title: 'Featured', sub: 'Big games to start with', hero: true },
  { id: 'mine', title: 'Your games', sub: 'Saved on this device. Publish from Studio to share them', plus: true },
  { id: 'popular', title: 'Popular', sub: 'Most liked by players', limit: 24 },
  { id: 'new', title: 'New', sub: 'Just published by players', limit: 30 },
  ...HOME_CATS.map(c => ({ id: 'cat-' + c.id, title: c.label, sub: c.sub, cat: c.id })),
];

export function isLight(E, hex) { const [r, g, b] = E.hexToRgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 168; }
export function ago(t) {
  if (!t) return 'Not saved yet';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Edited just now';
  if (s < 3600) return `Edited ${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `Edited ${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) { const d = Math.floor(s / 86400); return `Edited ${d} day${d === 1 ? '' : 's'} ago`; }
  return 'Edited ' + new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
export function fmtCount(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n); }
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---- entries ----
const accentFor = (E, id) => SWATCH[E.hashStr(String(id)) % SWATCH.length];
const builtinCache = new WeakMap();
let modeCatCache = null;
function modeCat(E, mode) {
  if (!modeCatCache) {
    modeCatCache = {};
    for (const g of E.GAMES) if (HOME_CATS.some(c => c.id === g.cat) && !modeCatCache[g.mode]) modeCatCache[g.mode] = g.cat;
  }
  return modeCatCache[mode] || null;
}
export function fromBuiltin(E, def) {
  return {
    key: 'b:' + def.id, kind: 'builtin', id: def.id, title: def.title, desc: def.desc || '', creator: def.creator || 'PlayForge',
    accent: E.normHex(def.accent) || accentFor(E, def.id), icon: iconName(def.icon || MODE_ICON[def.mode] || 'flag'), mode: def.mode, cat: def.cat,
    featured: !!def.featured, def,
  };
}
export function fromSummary(E, s) {
  return {
    key: 'c:' + s.id, kind: 'community', id: s.id, title: s.title, desc: s.desc || '', creator: s.creatorName || 'A player',
    accent: accentFor(E, s.id), icon: iconName(MODE_ICON[s.mode] || 'cube'), mode: s.mode, cat: modeCat(E, s.mode), summary: s,
    mine: !!E.Me.id && s.creatorId === E.Me.id, createdAt: s.createdAt || s.updatedAt || 0, updatedAt: s.updatedAt || 0, thumbUrl: s.thumb || '',
  };
}
export function fromDraft(E, doc, name) {
  const thumb = typeof doc.thumb === 'string' && doc.thumb.startsWith('data:image/') ? doc.thumb : '';
  return {
    key: 'd:' + doc.id, kind: 'draft', id: doc.id, title: doc.title || 'Untitled game', desc: doc.desc || '', creator: name,
    accent: accentFor(E, doc.id), icon: iconName(MODE_ICON[doc.mode] || 'cube'), mode: doc.mode, cat: modeCat(E, doc.mode), doc,
    published: !!doc.publishedAt, updatedAt: doc.updatedAt || 0, parts: Array.isArray(doc.parts) ? doc.parts.length : 0, thumbUrl: thumb,
  };
}
export function builtinEntries(E) {
  let list = builtinCache.get(E.GAMES);
  if (!list || list.length !== E.GAMES.length) { list = E.GAMES.map(d => fromBuiltin(E, d)); builtinCache.set(E.GAMES, list); }
  return list;
}
// Everything the home screen shows. drafts and published come from libraryStore; name is your display name.
export function makeCatalog(E, drafts, published, name) {
  const mine = drafts.map(d => fromDraft(E, d, name)), byId = new Map(mine.map(d => [d.id, d]));
  const community = published.map(s => { const e = fromSummary(E, s); if (e.mine && byId.has(e.id)) e.local = byId.get(e.id); return e; });
  return { builtin: builtinEntries(E), drafts: mine, community };
}

export function catsOf(e) {
  const out = [];
  if (e.kind === 'builtin') {
    if (HOME_CATS.some(c => c.id === e.cat)) out.push(e.cat);
    if (e.mode === 'rivals' && !out.includes('arena')) out.push('arena');
    if (e.mode === 'nights' && !out.includes('survival')) out.push('survival');
  } else if (e.cat) out.push(e.cat);
  return out;
}
export function catLabel(e) { const c = HOME_CATS.find(x => x.id === catsOf(e)[0]); return c ? c.label : ''; }
// The like key of an entry: a built-in or published id. Unpublished drafts can't be liked.
export function likeKey(e) { return e.kind === 'draft' && !e.published ? null : e.id; }
export function badge(e) { return e.kind === 'draft' ? (e.published ? 'Published' : 'Draft') : e.kind === 'community' && e.mine ? 'Yours' : ''; }

// Where an entry's picture comes from: {key, url} (a stored jpeg), {key, def()} (rendered by Thumbs), or null
// (a community game without a picture keeps its designed placeholder). key is the Thumbs cache key for def().
export function thumbSrc(E, e) {
  if (e.local) return thumbSrc(E, e.local); // your own published game: the draft on this device has the freshest picture
  if (e.thumbUrl) return { key: 'url:' + e.key + ':' + (e.updatedAt || 0) + ':' + e.thumbUrl.length, url: e.thumbUrl };
  if (e.kind === 'builtin') return { key: e.def.id, def: () => e.def };
  if (e.kind === 'draft') {
    const thumbKey = 'draft:' + e.id + ':' + (e.updatedAt || 0);
    return { key: thumbKey, def: () => Object.assign(E.Library.toDef(e.doc, e.creator), { thumbKey }) };
  }
  return null;
}

// ---- rows ----
// Featured first, then one game from each kind in turn, so an unliked Popular row still has variety.
function mixOrder(list) {
  const used = new Set(), out = [], byId = new Map(list.map(e => [e.id, e]));
  for (const id of HOME_FEATURED) { const e = byId.get(id); if (e) { out.push(e); used.add(e); } }
  const lanes = HOME_CATS.map(c => list.filter(e => !used.has(e) && e.cat === c.id));
  for (let i = 0, more = true; more; i++) { more = false; for (const l of lanes) if (i < l.length) { out.push(l[i]); used.add(l[i]); more = true; } }
  for (const e of list) if (!used.has(e)) out.push(e);
  return out;
}
// {rowId: entries}. likes(key) -> count; online(id) -> players now (a snapshot, so rows don't reshuffle live).
export function buildRows(cat, likes, online) {
  const { builtin, drafts, community } = cat;
  const byId = new Map(builtin.map(e => [e.id, e]));
  const newest = community.slice().sort((a, b) => b.createdAt - a.createdAt);
  const likesOf = e => { const k = likeKey(e); return k ? likes(k) : 0; };
  const rows = {
    featured: HOME_FEATURED.map(id => byId.get(id)).filter(Boolean),
    mine: drafts,
    popular: mixOrder(builtin).concat(newest).map((e, i) => ({ e, i, l: likesOf(e), o: online(e.id) || 0 }))
      .sort((a, b) => b.l - a.l || b.o - a.o || a.i - b.i).map(x => x.e),
    new: newest,
  };
  for (const c of HOME_CATS) rows['cat-' + c.id] = builtin.concat(community).filter(e => catsOf(e).includes(c.id));
  return rows;
}

// ---- search ----
function hay(E, e) {
  const labels = catsOf(e).map(c => HOME_CATS.find(x => x.id === c).label);
  if (e.featured) labels.push('Featured');
  if (e.kind === 'draft') labels.push('Your games', badge(e));
  if (e.kind === 'community') labels.push('Community');
  const m = E.Modes[e.mode]; if (m && m.label) labels.push(m.label);
  return { t: norm(e.title), c: norm(e.creator), l: norm(labels.join(' ')), d: norm(e.desc) };
}
function score(E, e, words) {
  const h = hay(E, e); let s = 0;
  for (const w of words) {
    const v = h.t.includes(w) ? 6 : h.c.includes(w) ? 4 : h.l.includes(w) ? 3 : h.d.includes(w) ? 1 : 0;
    if (!v) return 0; s += v;
  }
  if (h.t.startsWith(words[0])) s += 4;
  return s;
}
// Every word must match the title, creator, kind or description; title matches rank first.
export function search(E, cat, raw) {
  const words = norm(raw).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const mineIds = new Set(cat.drafts.map(d => d.id));
  const pool = cat.builtin.concat(cat.community.filter(c => !(c.mine && mineIds.has(c.id))), cat.drafts);
  return pool.map((e, i) => ({ e, i, s: score(E, e, words) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.e);
}
