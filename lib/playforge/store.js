// PlayForge storage. MongoDB through the app's mongoose connection when lib/store.js connected it,
// otherwise a JSON file at ${PF_DATA_DIR || '.data'}/playforge.json (loaded at start, written atomically a
// moment after each change). Both back ends implement the same async interface, so api.js and rooms.js
// never know which one is in use.
//
// Collections: pf_users {_id, name, nick, tokenHash, createdAt}, pf_skins {_id: userId, slots, active, updatedAt},
// pf_players {_id: userId, nick, skin, updatedAt}, pf_games {_id: gameId, creatorId, creatorName, title, desc, thumb,
// mode, modeOpts, env, killY, spawnYaw, spawn, parts, partsCount, createdAt, updatedAt}, pf_likes {userId, gameKey}
// (unique pair), pf_reports {reporterId, ..., createdAt}. Times are milliseconds since 1970.
const fs = require('fs');
const path = require('path');

const SUMMARY_FIELDS = ['_id', 'creatorId', 'creatorName', 'title', 'desc', 'thumb', 'mode', 'env', 'partsCount', 'createdAt', 'updatedAt'];
const REPORTS_KEPT = 5000; // JSON file only: the newest reports are kept

const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const byNewest = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

/* ---------- MongoDB ---------- */
function mongoBackend(mongoose) {
  const { Schema } = mongoose;
  const opts = (collection, extra) => Object.assign({ collection, versionKey: false, minimize: false }, extra);
  const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

  const User = model('PfUser', new Schema({
    _id: String, name: String, nick: { type: String, default: '' }, tokenHash: { type: String, required: true, unique: true }, createdAt: Number,
  }, opts('pf_users')));
  const Skins = model('PfSkins', new Schema({ _id: String, slots: [String], active: Number, updatedAt: Number }, opts('pf_skins')));
  const Player = model('PfPlayer', new Schema({ _id: String, nick: String, skin: String, updatedAt: Number }, opts('pf_players')));
  const Game = model('PfGame', new Schema({
    _id: String, creatorId: { type: String, index: true }, creatorName: String, title: String, desc: String, thumb: String,
    mode: String, modeOpts: Schema.Types.Mixed, env: Schema.Types.Mixed, killY: Number, spawnYaw: Number, spawn: Schema.Types.Mixed,
    parts: Schema.Types.Mixed, partsCount: Number, createdAt: { type: Number, index: true }, updatedAt: Number,
  }, opts('pf_games')));
  const likeSchema = new Schema({ userId: String, gameKey: { type: String, index: true }, createdAt: Number }, opts('pf_likes'));
  likeSchema.index({ userId: 1, gameKey: 1 }, { unique: true });
  const Like = model('PfLike', likeSchema);
  const Report = model('PfReport', new Schema({
    reporterId: String, kind: String, target: String, targetNick: String, game: String, reason: String, note: String,
    recent: [String], createdAt: Number,
  }, opts('pf_reports')));

  const summaryProjection = Object.fromEntries(SUMMARY_FIELDS.filter(k => k !== 'env' && k !== '_id').map(k => [k, 1]));
  summaryProjection['env.sky'] = 1;

  return {
    mode: 'mongo',
    async init() { await Promise.all([User.init(), Skins.init(), Player.init(), Game.init(), Like.init(), Report.init()]); },
    async isEmpty() { return (await User.estimatedDocumentCount()) === 0; },
    async importAll(d) {
      const ops = [];
      const users = Object.values(d.users || {}); if (users.length) ops.push(User.insertMany(users, { ordered: false }));
      const skins = Object.entries(d.skins || {}).map(([_id, v]) => Object.assign({ _id }, v)); if (skins.length) ops.push(Skins.insertMany(skins, { ordered: false }));
      const players = Object.entries(d.players || {}).map(([_id, v]) => Object.assign({ _id }, v)); if (players.length) ops.push(Player.insertMany(players, { ordered: false }));
      const games = Object.values(d.games || {}); if (games.length) ops.push(Game.insertMany(games, { ordered: false }));
      const likes = []; for (const [userId, keys] of Object.entries(d.likes || {})) for (const gameKey of keys) likes.push({ userId, gameKey, createdAt: Date.now() });
      if (likes.length) ops.push(Like.insertMany(likes, { ordered: false }));
      if (Array.isArray(d.reports) && d.reports.length) ops.push(Report.insertMany(d.reports, { ordered: false }));
      await Promise.allSettled(ops);
    },

    createUser: u => User.create(u).then(() => u),
    userByToken: tokenHash => User.findOne({ tokenHash }).lean(),
    getUser: id => User.findById(id).lean(),
    setUserNick: (id, nick) => User.updateOne({ _id: id }, { $set: { nick } }),

    getSkins: id => Skins.findById(id).lean(),
    putSkins: (id, s) => Skins.updateOne({ _id: id }, { $set: s }, { upsert: true }),
    getPlayer: id => Player.findById(id).lean(),
    putPlayer: (id, p) => Player.updateOne({ _id: id }, { $set: p }, { upsert: true }),

    async listGames() {
      const rows = await Game.find({}, summaryProjection).sort({ createdAt: -1 }).lean();
      return rows;
    },
    getGame: id => Game.findById(id).lean(),
    countGames: creatorId => Game.countDocuments({ creatorId }),
    saveGame: g => Game.replaceOne({ _id: g._id }, g, { upsert: true }),
    patchGame: (id, patch) => Game.updateOne({ _id: id }, { $set: patch }),
    deleteGame: id => Game.deleteOne({ _id: id }),
    async setCreatorName(creatorId, creatorName) {
      const r = await Game.updateMany({ creatorId, creatorName: { $ne: creatorName } }, { $set: { creatorName } });
      return r.modifiedCount || 0;
    },

    async likeCounts() {
      const rows = await Like.aggregate([{ $group: { _id: '$gameKey', n: { $sum: 1 } } }]);
      return Object.fromEntries(rows.map(r => [r._id, r.n]));
    },
    likeCount: gameKey => Like.countDocuments({ gameKey }),
    async myLikes(userId) { return (await Like.find({ userId }, { gameKey: 1 }).lean()).map(r => r.gameKey); },
    countMyLikes: userId => Like.countDocuments({ userId }),
    async setLike(userId, gameKey, liked) {
      if (!liked) { await Like.deleteOne({ userId, gameKey }); return; }
      try { await Like.updateOne({ userId, gameKey }, { $setOnInsert: { createdAt: Date.now() } }, { upsert: true }); }
      catch (e) { if (e && e.code !== 11000) throw e; } // two upserts at once: the like is there either way
    },

    addReport: r => Report.create(r).then(() => true),
    async flush() {},
  };
}

/* ---------- JSON file ---------- */
function fileBackend(file) {
  let d = { v: 1, users: {}, skins: {}, players: {}, games: {}, likes: {}, reports: [] };
  const tokens = new Map(); // tokenHash -> userId
  let timer = null, firstDirtyAt = 0, writing = null, dirty = false;

  function load() {
    let raw = null;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') console.warn(`> PlayForge: could not read ${file} (${e.message})`); }
    if (raw) {
      try {
        const j = JSON.parse(raw);
        for (const k of Object.keys(d)) if (j[k] !== undefined && typeof j[k] === typeof d[k]) d[k] = j[k];
        if (!Array.isArray(d.reports)) d.reports = [];
      } catch (e) {
        const bad = file + '.bad-' + Date.now();
        try { fs.renameSync(file, bad); } catch (e2) { /* leave it */ }
        console.warn(`> PlayForge: ${file} is not valid JSON; moved it to ${bad} and started empty.`);
      }
    }
    for (const u of Object.values(d.users)) if (u && u.tokenHash) tokens.set(u.tokenHash, u._id);
  }

  function writeNow() {
    clearTimeout(timer); timer = null;
    if (writing) { dirty = true; return writing; }
    dirty = false; firstDirtyAt = 0;
    const json = JSON.stringify(d), tmp = file + '.tmp-' + process.pid;
    writing = (async () => {
      try {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(tmp, json);
        await fs.promises.rename(tmp, file);
      } catch (e) { console.error(`> PlayForge: saving ${file} failed: ${e.message}`); dirty = true; }
    })().finally(() => { writing = null; if (dirty) schedule(); });
    return writing;
  }
  // Debounced: a burst of changes is written once, but never later than 2 s after the first one.
  function schedule() {
    const now = Date.now(); if (!firstDirtyAt) firstDirtyAt = now;
    clearTimeout(timer);
    timer = setTimeout(writeNow, now - firstDirtyAt > 2000 ? 0 : 300);
  }
  const copy = v => (v == null ? null : structuredClone(v));

  return {
    mode: 'file',
    file,
    async init() { load(); },
    async isEmpty() { return Object.keys(d.users).length === 0; },
    exportAll() { return d; },

    async createUser(u) { d.users[u._id] = Object.assign({}, u); tokens.set(u.tokenHash, u._id); schedule(); return u; },
    async userByToken(h) { const id = tokens.get(h); return id && d.users[id] ? copy(d.users[id]) : null; },
    async getUser(id) { return copy(d.users[id]); },
    async setUserNick(id, nick) { if (d.users[id]) { d.users[id].nick = nick; schedule(); } },

    async getSkins(id) { return d.skins[id] ? Object.assign({ _id: id }, copy(d.skins[id])) : null; },
    async putSkins(id, s) { d.skins[id] = Object.assign({}, d.skins[id], copy(s)); schedule(); },
    async getPlayer(id) { return d.players[id] ? Object.assign({ _id: id }, copy(d.players[id])) : null; },
    async putPlayer(id, p) { d.players[id] = Object.assign({}, d.players[id], copy(p)); schedule(); },

    async listGames() {
      return Object.values(d.games).map(g => Object.assign(pick(g, SUMMARY_FIELDS), { env: { sky: g.env && g.env.sky } })).sort(byNewest);
    },
    async getGame(id) { return Object.prototype.hasOwnProperty.call(d.games, id) ? copy(d.games[id]) : null; },
    async countGames(creatorId) { let n = 0; for (const g of Object.values(d.games)) if (g.creatorId === creatorId) n++; return n; },
    async saveGame(g) { d.games[g._id] = copy(g); schedule(); },
    async patchGame(id, patch) { if (d.games[id]) { Object.assign(d.games[id], copy(patch)); schedule(); } },
    async deleteGame(id) { if (d.games[id]) { delete d.games[id]; schedule(); } },
    async setCreatorName(creatorId, name) {
      let n = 0;
      for (const g of Object.values(d.games)) if (g.creatorId === creatorId && g.creatorName !== name) { g.creatorName = name; n++; }
      if (n) schedule();
      return n;
    },

    async likeCounts() {
      const c = {};
      for (const keys of Object.values(d.likes)) for (const k of keys) c[k] = (c[k] || 0) + 1;
      return c;
    },
    async likeCount(key) { let n = 0; for (const keys of Object.values(d.likes)) if (keys.includes(key)) n++; return n; },
    async myLikes(userId) { return (d.likes[userId] || []).slice(); },
    async countMyLikes(userId) { return (d.likes[userId] || []).length; },
    async setLike(userId, key, liked) {
      const keys = d.likes[userId] || [], has = keys.includes(key);
      if (liked === has) return;
      d.likes[userId] = liked ? keys.concat(key) : keys.filter(k => k !== key);
      if (!d.likes[userId].length) delete d.likes[userId];
      schedule();
    },

    async addReport(r) { d.reports.push(copy(r)); if (d.reports.length > REPORTS_KEPT) d.reports.splice(0, d.reports.length - REPORTS_KEPT); schedule(); return true; },
    async flush() { if (timer || dirty) await writeNow(); else if (writing) await writing; },
    // Synchronous last-chance write for process exit.
    flushSync() {
      if (!timer && !dirty) return;
      clearTimeout(timer); timer = null;
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, file); dirty = false; }
      catch (e) { console.error(`> PlayForge: saving ${file} failed: ${e.message}`); }
    },
  };
}

/* ---------- Selection ---------- */
let impl = null;

// Picks MongoDB when the shared mongoose connection is open, otherwise the JSON file.
// When MongoDB is used for the first time (no PlayForge users yet) and a JSON file from local runs exists,
// its data is copied in once, so moving from the local file to a hosted database keeps games and players.
async function init({ mongoose, dataDir } = {}) {
  const file = path.join(dataDir || process.env.PF_DATA_DIR || '.data', 'playforge.json');
  if (mongoose && mongoose.connection && mongoose.connection.readyState === 1) {
    impl = mongoBackend(mongoose);
    await impl.init();
    if (fs.existsSync(file) && await impl.isEmpty()) {
      const f = fileBackend(file); await f.init();
      const data = f.exportAll();
      if (Object.keys(data.users).length) {
        await impl.importAll(data);
        console.log(`> PlayForge: copied ${Object.keys(data.users).length} players and ${Object.keys(data.games).length} games from ${file} into MongoDB`);
      }
    }
    console.log('> PlayForge storage: MongoDB');
  } else {
    impl = fileBackend(file);
    await impl.init();
    console.log(`> PlayForge storage: ${file}`);
  }
  return impl.mode;
}

const api = new Proxy({}, {
  get(_, k) {
    if (k === 'init') return init;
    if (k === 'mode') return impl ? impl.mode : null;
    if (!impl) throw new Error('PlayForge store used before init()');
    const v = impl[k];
    return typeof v === 'function' ? v.bind(impl) : v;
  },
});

module.exports = api;
