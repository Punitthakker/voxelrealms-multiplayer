// PlayForge REST API, mounted at /api/pf (see playforge/WEBAPP.md, Server). JSON in, JSON out.
// Every route but POST /session needs `Authorization: Bearer <token>`. Errors are {code, message}.
const express = require('express');
const store = require('./store');
const filter = require('./filter');
const rooms = require('./rooms');
const auth = require('./auth');
const { hit, retryAfter, clientIp } = require('./limits');

const LIMITS = {
  published: 20, parts: 1200, title: 40, desc: 200, thumb: 24000, nick: 20, png: 120000,
  likesPerUser: 5000, modeOpts: 4000, env: 1000, bp: 600, note: 200,
};
const GAME_ID_RE = /^u-[a-z0-9]{8}$/;          // community games
const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;  // like keys: built-in game ids or community ids
const PART_ID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;
const WORD_RE = /^[a-z0-9_-]{1,32}$/;
const REASONS = ['language', 'bullying', 'name', 'cheating', 'other'];
const RATE = {
  guests: [Number(process.env.PF_GUEST_LIMIT) || 100, 10 * 60e3], // new guest accounts per IP (a school shares one IP)
  writes: [60, 60e3],                                            // any write, per user
  publish: [30, 5 * 60e3],                                       // PUT /games/:id, per user
  reports: [10, 10 * 60e3],                                      // POST /reports, per user
};

class ApiError extends Error {
  constructor(status, code, message, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
const fail = (status, code, message, extra) => { throw new ApiError(status, code, message, extra); };
const bad = (code, message) => fail(400, code, message);

// Wraps an async handler: a returned value is sent as JSON, a thrown ApiError as {code, message}.
const route = fn => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res)).then(v => { if (v !== undefined && !res.headersSent) res.json(v); }).catch(next);
};
function limit(name, keyFn) {
  const [max, windowMs] = RATE[name];
  return (req, res, next) => {
    const key = keyFn(req);
    if (hit(name, key, max, windowMs)) return next();
    res.set('Retry-After', String(retryAfter(name, key)));
    next(new ApiError(429, 'rate_limited', 'Too many requests. Wait a moment, then try again.'));
  };
}
const byUser = req => req.user.id;

/* ---------- validation helpers ---------- */
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const jsonSize = v => { try { return JSON.stringify(v).length; } catch (e) { return Infinity; } };
const oneLine = s => String(s).replace(/\s+/g, ' ').trim();
const fin = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
const vec3 = (v, lim) => Array.isArray(v) && v.length === 3 && v.every(x => fin(x, lim));
const validPng = s => typeof s === 'string' && s.startsWith('data:image/png;base64,') && s.length < LIMITS.png && /^[A-Za-z0-9+/=]*$/.test(s.slice(22));
const validThumb = s => typeof s === 'string' && s.startsWith('data:image/jpeg;base64,') && s.length < LIMITS.thumb && /^[A-Za-z0-9+/=]*$/.test(s.slice(23));

function text(v, max, field, fallback = '') {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'string') bad('bad_' + field, `${field} must be text.`);
  const s = oneLine(v);
  if (s.length > max) bad('too_long', `${field} is longer than ${max} characters.`);
  return filter.clean(s) || fallback;
}
function checkNick(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v !== 'string') bad('bad_nick', 'nick must be text.');
  const s = oneLine(v);
  if (s && (s.length < 3 || s.length > LIMITS.nick || !/^[A-Za-z0-9 _.-]+$/.test(s))) bad('bad_nick', 'Use 3 to 20 letters, numbers, spaces, dots, dashes or underscores.');
  if (filter.hasBad(s)) bad('bad_word', "That name isn't allowed. Try a different one.");
  return s;
}

// A part as Studio stores it (Library.compact): known fields only, numbers checked. Unknown fields are dropped;
// the browser normalizes parts again when it loads a game (normPart).
function cleanPart(p, i) {
  const no = msg => bad('bad_parts', `Part ${i + 1}: ${msg}.`);
  if (!isObj(p)) no('not an object');
  if (typeof p.id !== 'string' || !PART_ID_RE.test(p.id)) no('bad id');
  const name = typeof p.name === 'string' ? p.name.slice(0, 60) : '';
  if (typeof p.shape !== 'string' || !/^[a-z]{1,16}$/.test(p.shape)) no('bad shape');
  const parent = p.parent === undefined || p.parent === null ? null : typeof p.parent === 'string' && PART_ID_RE.test(p.parent) ? p.parent : no('bad parent');
  if (p.shape === 'group') return Object.assign({ id: p.id, name, shape: 'group' }, parent ? { parent } : {});
  if (!vec3(p.pos, 1e5)) no('pos must be three numbers');
  if (!vec3(p.size, 4096)) no('size must be three numbers up to 4096');
  if (typeof p.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(p.color)) no('color must be #RRGGBB');
  const q = { id: p.id, name, shape: p.shape, pos: p.pos, size: p.size, color: p.color };
  if (p.rot !== undefined) { if (!vec3(p.rot, 1e4)) no('rot must be three numbers'); if (p.rot.some(v => v)) q.rot = p.rot; }
  if (p.material !== undefined) { if (typeof p.material !== 'string' || !/^[a-z]{1,16}$/.test(p.material)) no('bad material'); q.material = p.material; }
  for (const k of ['anchored', 'canCollide']) if (p[k] !== undefined) { if (typeof p[k] !== 'boolean') no(`${k} must be true or false`); q[k] = p[k]; }
  if (p.transparency !== undefined) { if (!fin(p.transparency, 1) || p.transparency < 0) no('transparency must be 0 to 1'); q.transparency = p.transparency; }
  if (p.behavior !== undefined && p.behavior !== null) { if (typeof p.behavior !== 'string' || !/^[a-z]{1,16}$/.test(p.behavior)) no('bad behavior'); q.behavior = p.behavior; }
  if (p.bp !== undefined && p.bp !== null) { if (!isObj(p.bp) || jsonSize(p.bp) > LIMITS.bp) no('bp must be a small object'); q.bp = p.bp; }
  if (p.tag !== undefined && p.tag !== null && p.tag !== '') { if (typeof p.tag !== 'string') no('tag must be text'); q.tag = p.tag.slice(0, 24); }
  if (parent) q.parent = parent;
  return q;
}

function cleanGame(b) {
  if (!isObj(b)) bad('bad_body', 'Send the game as a JSON object.');
  const title = text(b.title, LIMITS.title, 'title', 'Untitled game');
  const desc = text(b.desc, LIMITS.desc, 'desc');
  const mode = b.mode === undefined || b.mode === null ? 'custom' : typeof b.mode === 'string' && WORD_RE.test(b.mode) ? b.mode : bad('bad_mode', 'mode must be a rule set name.');
  const modeOpts = b.modeOpts === undefined || b.modeOpts === null ? {} : isObj(b.modeOpts) && jsonSize(b.modeOpts) <= LIMITS.modeOpts ? b.modeOpts : bad('bad_modeOpts', 'modeOpts must be a small object.');
  const env = b.env === undefined || b.env === null ? { sky: 'day' } : isObj(b.env) && jsonSize(b.env) <= LIMITS.env ? Object.assign({}, b.env) : bad('bad_env', 'env must be a small object.');
  if (env.sky === undefined) env.sky = 'day';
  else if (typeof env.sky !== 'string' || !WORD_RE.test(env.sky)) bad('bad_env', 'env.sky must be a sky name.');
  const killY = b.killY === undefined || b.killY === null ? null : fin(b.killY, 10000) ? b.killY : bad('bad_killY', 'killY must be a number between -10000 and 10000.');
  const spawnYaw = b.spawnYaw === undefined || b.spawnYaw === null ? null : fin(b.spawnYaw, 1000) ? b.spawnYaw : bad('bad_spawnYaw', 'spawnYaw must be a number.');
  const spawn = b.spawn === undefined || b.spawn === null ? null : vec3(b.spawn, 1e5) ? b.spawn : bad('bad_spawn', 'spawn must be three numbers.');
  if (!Array.isArray(b.parts)) bad('bad_parts', 'parts must be a list.');
  if (b.parts.length > LIMITS.parts) bad('too_many_parts', `A game can have up to ${LIMITS.parts} parts.`);
  const parts = b.parts.map(cleanPart);
  const thumb = b.thumb === undefined || b.thumb === null || b.thumb === '' ? '' : validThumb(b.thumb) ? b.thumb : bad('bad_thumb', `thumb must be a data:image/jpeg URL under ${LIMITS.thumb} characters.`);
  return { title, desc, mode, modeOpts, env, killY, spawnYaw, spawn, parts, thumb };
}

/* ---------- response shapes ---------- */
function summary(g, likes) {
  return {
    id: g._id, title: g.title, desc: g.desc || '', thumb: g.thumb || '', mode: g.mode || 'custom', sky: (g.env && g.env.sky) || 'day',
    parts: g.partsCount || 0, createdAt: g.createdAt || 0, updatedAt: g.updatedAt || 0, creatorId: g.creatorId, creatorName: g.creatorName || 'A player',
    likes: likes || 0,
  };
}
const fullGame = (g, likes) => Object.assign(summary(g, likes), {
  partsCount: g.partsCount || 0, modeOpts: g.modeOpts || {}, env: g.env || { sky: 'day' }, killY: Number.isFinite(g.killY) ? g.killY : null,
  spawnYaw: Number.isFinite(g.spawnYaw) ? g.spawnYaw : null, spawn: Array.isArray(g.spawn) ? g.spawn : null, parts: Array.isArray(g.parts) ? g.parts : [],
});
const displayName = u => u.nick || u.name || 'A player';

function gameId(req) {
  const id = req.params.id;
  if (!GAME_ID_RE.test(id)) fail(404, 'not_found', 'There is no game with that id.');
  return id;
}

/* ---------- router ---------- */
function createRouter() {
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));

  // Sessions: resume with a known token, otherwise start a new guest player.
  r.post('/session', route(async (req, res) => {
    const t = req.body && req.body.token;
    if (t !== undefined && t !== null && typeof t !== 'string') bad('bad_token', 'token must be text.');
    if (t) { const user = await auth.userForToken(t); if (user) return { token: t, user }; }
    const ip = clientIp(req);
    if (!hit('guests', ip, ...RATE.guests)) {
      res.set('Retry-After', String(retryAfter('guests', ip)));
      fail(429, 'rate_limited', 'Too many new players from this network. Try again in a few minutes.');
    }
    res.status(201);
    return auth.createGuest();
  }));

  // Everything below needs a session.
  r.use((req, res, next) => {
    auth.userForToken(auth.bearer(req)).then(user => {
      if (!user) return next(new ApiError(401, 'unauthorized', 'Start a session first (POST /api/pf/session).'));
      req.user = user; next();
    }, next);
  });
  const write = limit('writes', byUser);

  // ---- profile ----
  r.get('/me/profile', route(async req => {
    const [s, u] = await Promise.all([store.getSkins(req.user.id), store.getUser(req.user.id)]);
    const slots = [0, 1, 2, 3, 4].map(i => (s && Array.isArray(s.slots) && validPng(s.slots[i]) ? s.slots[i] : ''));
    return { slots, active: s && Number.isInteger(s.active) ? s.active : 0, nick: (u && u.nick) || '', updatedAt: (s && s.updatedAt) || 0 };
  }));

  r.put('/me/profile', write, route(async req => {
    const b = req.body; if (!isObj(b)) bad('bad_body', 'Send the profile as a JSON object.');
    if (!Array.isArray(b.slots) || b.slots.length > 5) bad('bad_slots', 'slots must be a list of up to 5 skins.');
    const slots = [0, 1, 2, 3, 4].map(i => {
      const v = b.slots[i];
      if (v === undefined || v === null || v === '') return '';
      if (!validPng(v)) bad('bad_slots', `Skin ${i + 1} must be a data:image/png URL under ${LIMITS.png} characters.`);
      return v;
    });
    const active = b.active === undefined ? 0 : Number.isInteger(b.active) && b.active >= 0 && b.active <= 4 ? b.active : bad('bad_active', 'active must be 0 to 4.');
    const nick = checkNick(b.nick);
    const skin = b.skin === undefined || b.skin === null || b.skin === '' ? '' : validPng(b.skin) ? b.skin : bad('bad_skin', 'skin must be a data:image/png URL.');
    const now = Date.now(), uid = req.user.id;
    await Promise.all([
      store.putSkins(uid, { slots, active, updatedAt: now }),
      store.putPlayer(uid, { nick, skin, updatedAt: now }),
      store.setUserNick(uid, nick),
    ]);
    auth.updateCachedUser(uid, { nick });
    const renamed = await store.setCreatorName(uid, displayName({ nick, name: req.user.name }));
    rooms.broadcast({ t: 'player', id: uid });
    if (renamed) rooms.broadcast({ t: 'games' });
    return { ok: true };
  }));

  r.get('/players/:id', route(async req => {
    const id = req.params.id;
    if (!auth.USER_ID_RE.test(id)) fail(404, 'not_found', 'There is no player with that id.');
    const [u, p] = await Promise.all([store.getUser(id), store.getPlayer(id)]);
    if (!u) fail(404, 'not_found', 'There is no player with that id.');
    return { id, name: u.name, nick: (p && p.nick) || u.nick || '', skin: p && validPng(p.skin) ? p.skin : '' };
  }));

  // ---- games ----
  r.get('/games', route(async () => {
    const [rows, counts] = await Promise.all([store.listGames(), store.likeCounts()]);
    return { games: rows.map(g => summary(g, counts[g._id])) };
  }));

  r.get('/games/:id', route(async req => {
    const id = gameId(req), g = await store.getGame(id);
    if (!g) fail(404, 'not_found', 'This game is not published (any more).');
    return fullGame(g, await store.likeCount(id));
  }));

  r.put('/games/:id', write, limit('publish', byUser), route(async req => {
    const id = gameId(req), uid = req.user.id, body = cleanGame(req.body);
    const cur = await store.getGame(id);
    if (cur && cur.creatorId !== uid) fail(403, 'forbidden', 'Only the creator can change this game.');
    if (!cur && await store.countGames(uid) >= LIMITS.published) fail(403, 'limit', `You can publish up to ${LIMITS.published} games. Unpublish one first.`);
    const u = await store.getUser(uid), now = Date.now();
    const g = Object.assign({ _id: id, creatorId: uid, creatorName: filter.clean(displayName(u || req.user)) }, body, {
      partsCount: body.parts.length, createdAt: cur ? cur.createdAt || now : now, updatedAt: now,
    });
    await store.saveGame(g);
    rooms.broadcast({ t: 'games' });
    return summary(g, cur ? await store.likeCount(id) : 0);
  }));

  r.patch('/games/:id', write, route(async req => {
    const id = gameId(req), b = req.body;
    if (!isObj(b) || typeof b.title !== 'string') bad('bad_title', 'Send {title}.');
    const title = text(b.title, LIMITS.title, 'title');
    if (!title) bad('bad_title', 'The title is empty.');
    const g = await store.getGame(id);
    if (!g) fail(404, 'not_found', 'This game is not published.');
    if (g.creatorId !== req.user.id) fail(403, 'forbidden', 'Only the creator can rename this game.');
    const updatedAt = Date.now();
    await store.patchGame(id, { title, updatedAt });
    rooms.broadcast({ t: 'games' });
    return summary(Object.assign(g, { title, updatedAt }), await store.likeCount(id));
  }));

  r.delete('/games/:id', write, route(async req => {
    const id = gameId(req), g = await store.getGame(id);
    if (!g) fail(404, 'not_found', 'This game is not published.');
    if (g.creatorId !== req.user.id) fail(403, 'forbidden', 'Only the creator can unpublish this game.');
    await store.deleteGame(id);
    rooms.broadcast({ t: 'games' });
    return { ok: true };
  }));

  // ---- likes ----
  r.get('/likes', route(async req => {
    const [counts, mine] = await Promise.all([store.likeCounts(), store.myLikes(req.user.id)]);
    return { counts, mine };
  }));

  r.put('/likes/:key', write, route(async req => {
    const key = req.params.key, b = req.body;
    if (!KEY_RE.test(key)) fail(404, 'not_found', 'There is no game with that id.');
    if (!isObj(b) || typeof b.liked !== 'boolean') bad('bad_liked', 'Send {liked: true} or {liked: false}.');
    const uid = req.user.id;
    if (key.startsWith('u-')) {
      if (!GAME_ID_RE.test(key)) fail(404, 'not_found', 'There is no game with that id.');
      if (b.liked && !(await store.getGame(key))) fail(404, 'not_found', 'This game is not published.');
    }
    if (b.liked && !(await store.myLikes(uid)).includes(key) && await store.countMyLikes(uid) >= LIMITS.likesPerUser) fail(403, 'limit', 'You have liked the most games you can.');
    await store.setLike(uid, key, b.liked);
    const count = await store.likeCount(key);
    rooms.broadcast({ t: 'likes', key, count });
    return { liked: b.liked, count };
  }));

  // ---- reports ----
  r.post('/reports', write, limit('reports', byUser), route(async req => {
    const b = req.body; if (!isObj(b)) bad('bad_body', 'Send the report as a JSON object.');
    if (!REASONS.includes(b.reason)) bad('bad_reason', `reason must be one of ${REASONS.join(', ')}.`);
    const opt = (v, re, field) => (v === undefined || v === null || v === '' ? null : typeof v === 'string' && re.test(v) ? v : bad('bad_' + field, `${field} is not valid.`));
    const target = opt(b.target, /^[A-Za-z0-9_.:@+-]{1,64}$/, 'target');
    const game = opt(b.game, /^[A-Za-z0-9_.:-]{1,64}$/, 'game');
    const targetNick = b.targetNick === undefined || b.targetNick === null ? null : typeof b.targetNick === 'string' ? oneLine(b.targetNick).slice(0, 40) : bad('bad_targetNick', 'targetNick must be text.');
    const note = b.note === undefined || b.note === null ? '' : typeof b.note === 'string' && oneLine(b.note).length <= LIMITS.note ? oneLine(b.note) : bad('too_long', `note is longer than ${LIMITS.note} characters.`);
    if (b.recent !== undefined && b.recent !== null && (!Array.isArray(b.recent) || b.recent.length > 10 || b.recent.some(s => typeof s !== 'string'))) bad('bad_recent', 'recent must be a list of up to 10 messages.');
    const recent = (b.recent || []).slice(-5).map(s => oneLine(s).slice(0, 150));
    const kind = b.kind === undefined ? 'player' : typeof b.kind === 'string' && WORD_RE.test(b.kind) ? b.kind : bad('bad_kind', 'kind is not valid.');
    await store.addReport({ reporterId: req.user.id, kind, target, targetNick, game, reason: b.reason, note, recent, createdAt: Date.now() });
    return { ok: true };
  }));

  r.use((req, res, next) => next(new ApiError(404, 'not_found', `No route for ${req.method} ${req.baseUrl}${req.path}.`)));

  // Errors: always JSON.
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, next) => {
    if (err instanceof ApiError) return res.status(err.status).json(Object.assign({ code: err.code, message: err.message }, err.extra));
    if (err && err.type === 'entity.too.large') return res.status(413).json({ code: 'too_large', message: 'The request is larger than 1 MB.' });
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ code: 'bad_json', message: 'The request body is not valid JSON.' });
    if (err && err.status >= 400 && err.status < 500) return res.status(err.status).json({ code: 'bad_request', message: err.message || 'Bad request.' });
    console.error('PlayForge API error:', err);
    res.status(500).json({ code: 'server_error', message: 'Something went wrong on the server. Try again in a moment.' });
  });
  return r;
}

module.exports = { createRouter, LIMITS };
