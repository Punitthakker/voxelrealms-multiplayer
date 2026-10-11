// World persistence. Uses MongoDB when reachable (local mongod in dev, Atlas when hosted);
// falls back to in-memory storage so the game still runs without a database.
const mongoose = require('mongoose');

const World = mongoose.model('World', new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  epoch: { type: Number, required: true }, // ms timestamp the day/night clock counts from
}, { timestamps: true }));

// One document per edited cell; the seeded generator rebuilds everything else.
const Block = mongoose.model('Block', new mongoose.Schema({
  world: String, d: Number, x: Number, y: Number, z: Number, b: Number, s: Number,
}).index({ world: 1, d: 1, x: 1, y: 1, z: 1 }, { unique: true }));

const PlayerState = mongoose.model('PlayerState', new mongoose.Schema({
  world: String, name: String, p: [Number],
}).index({ world: 1, name: 1 }, { unique: true }));

let useDb = false;
const mem = { worlds: new Map(), blocks: new Map(), players: new Map() };

async function connect(uri) {
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    useDb = true;
    console.log('> MongoDB connected');
  } catch (e) {
    console.warn(`> MongoDB unavailable (${e.message}). Using in-memory storage; worlds reset on restart.`);
  }
}

async function createWorld(code) {
  const w = { code, epoch: Date.now() };
  if (useDb) await World.create(w);
  else mem.worlds.set(code, w);
  return w;
}

async function getWorld(code) {
  return useDb ? World.findOne({ code }).lean() : mem.worlds.get(code) || null;
}

async function loadEdits(code) {
  if (!useDb) return [...(mem.blocks.get(code)?.values() || [])];
  const rows = await Block.find({ world: code }, { _id: 0, d: 1, x: 1, y: 1, z: 1, b: 1, s: 1 }).lean();
  return rows.map(r => [r.d, r.x, r.y, r.z, r.b, r.s]);
}

async function saveEdits(code, edits) {
  if (!edits.length) return;
  if (!useDb) {
    let m = mem.blocks.get(code);
    if (!m) mem.blocks.set(code, m = new Map());
    for (const e of edits) m.set(e.slice(0, 4).join(), e);
    return;
  }
  await Block.bulkWrite(edits.map(([d, x, y, z, b, s]) => ({
    updateOne: { filter: { world: code, d, x, y, z }, update: { $set: { b, s } }, upsert: true },
  })), { ordered: false });
}

async function getPlayer(code, name) {
  if (!useDb) return mem.players.get(code + '\n' + name) || null;
  const r = await PlayerState.findOne({ world: code, name }).lean();
  return r ? r.p : null;
}

async function savePlayer(code, name, p) {
  if (!useDb) return void mem.players.set(code + '\n' + name, p);
  await PlayerState.updateOne({ world: code, name }, { $set: { p } }, { upsert: true });
}

module.exports = { connect, createWorld, getWorld, loadEdits, saveEdits, getPlayer, savePlayer };
