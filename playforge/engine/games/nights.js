import * as THREE from 'three';
import { DEG, LS, SK, Sfx, clamp, ctx2d, newSkinCanvas, pick, rng } from '../core.js';
import { ENV, World, mkPart } from '../world.js';
import { fmtClock, fmtTime } from '../hud.js';
import { Game, Modes, getBest, registerGames, saveBest } from '../game.js';
import { Net, Shared } from '../net.js';
import { PartyKit } from './party.js';

/* ---------- Games: campfire survival (99 Nights at Pinewood and friends), Shade Hunt, Lantern Trail ---------- */
// A darker night than the plain "night" sky, for survival games.
export const DEEP_NIGHT = { top: '#03050C', horizon: '#0A1022', bottom: '#04060C', sun: '#7F95D8', sunI: 0.1, hemiSky: '#2A3866', hemiGround: '#0A0C14', hemiI: 0.2, fog: 0.32, clouds: false, stars: 1, sunDir: [-0.3, 0.7, 0.4] };
export const NIGHT_THEMES = {
  forest: { day: 'forest', win: 'The forest is quiet at last', ground: '#3F6B3A', groundMat: 'grass', trunk: '#6B4A2E', crown: ['#2C5A3A', '#356B44', '#2F7A55'], kind: 'pine', bush: '#2F6B3A', berry: '#E23E62', rock: '#7D8794', clearing: '#8A6A45', tent: ['#FF6A2B', '#2D62F0', '#FFC53A', '#17A39C'] },
  snow: { day: 'snow', win: 'The storm is over and the island is calm', ground: '#EEF3F8', groundMat: 'sand', trunk: '#5A4030', crown: ['#2F5A48', '#3A6A55'], kind: 'pine', snowcap: true, bush: '#3A5A4A', berry: '#7A4FD0', rock: '#9AA8B8', clearing: '#C9D6E2', tent: ['#E23E62', '#2D62F0', '#FF6A2B', '#7A4FD0'] },
  desert: { day: 'desert', win: 'The dunes are quiet at last', logFuel: 8, ground: '#E2C48E', groundMat: 'sand', trunk: '#5E8F4A', kind: 'cactus', bush: '#7A8A4A', berry: '#FF5CA8', rock: '#B08A5E', clearing: '#C9A66E', tent: ['#FF6A2B', '#17A39C', '#E23E62', '#2D62F0'] },
};
// Fuel one log adds to the campfire (percent). A theme can change it (logFuel): cactus wood burns faster.
const LOG_FUEL = 10;
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
// A soft pool of lantern light on the ground that follows the player. The big lawn and forest-floor boxes have
// only corner vertices, so a PointLight barely shows on them; this unlit disc does.
export function lightPool(color = '#FFD9A0', radius = 5) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = ctx2d(c), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.55)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), mat);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1;
  return {
    mesh,
    add() { if (World.scene) World.scene.add(mesh); return this; },
    at(x, y, z, k = 1) { mesh.position.set(x, y, z); mesh.scale.setScalar(Math.max(0.01, k)); mesh.visible = k > 0.02; },
    dispose() { if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
// A pitch-dark skin for creatures; glowing eyes are added as separate meshes.
export function shadowSkin(base = '#0B0A12', fleck = '#16131F') {
  const c = newSkinCanvas(), g = ctx2d(c), R = rng(7);
  g.fillStyle = base; g.fillRect(0, 0, SK, SK); g.fillStyle = fleck;
  for (let i = 0; i < 260; i++) g.fillRect(Math.floor(R() * SK), Math.floor(R() * SK), 1, 1);
  return c;
}
export function addGlowEyes(bot, color = '#FFE07A') {
  const head = bot.avatar.base.find(m => m.userData.part === 'head'); if (!head) return;
  const geo = new THREE.BoxGeometry(0.11, 0.06, 0.02), mat = new THREE.MeshBasicMaterial({ color });
  for (const sx of [-0.11, 0.11]) { const e = new THREE.Mesh(geo, mat); e.position.set(head.position.x + sx, head.position.y + 0.02, head.position.z + 0.26); head.parent.add(e); }
}
export function nightsTree(P, R, T, x, z, k) {
  const h = 4 + R() * 2.2;
  if (T.kind === 'cactus') {
    P('cylinder', [x, h / 2, z], [1.1, h, 1.1], T.trunk, 'grass', { name: 'Cactus', tag: 'tree', bp: { k } });
    const s = R() < 0.5 ? 1 : -1;
    P('cylinder', [x + s * 1.15, h * 0.62, z], [0.7, 1.9, 0.7], T.trunk, 'grass', { name: 'Cactus arm', canCollide: false, bp: { tree: k } });
    P('block', [x + s * 0.75, h * 0.42, z], [0.9, 0.55, 0.55], T.trunk, 'grass', { name: 'Cactus arm', canCollide: false, bp: { tree: k } });
    return;
  }
  P('cylinder', [x, h / 2, z], [0.9, h, 0.9], T.trunk, 'wood', { name: 'Tree', tag: 'tree', bp: { k } });
  const c = pick(R, T.crown);
  P('cylinder', [x, h + 0.5, z], [4, 3.2, 4], c, 'grass', { name: 'Pine', canCollide: false, bp: { tree: k } });
  P('cylinder', [x, h + 2.6, z], [2.4, 2, 2.4], T.snowcap ? '#F4F8FC' : c, T.snowcap ? 'sand' : 'grass', { name: 'Pine top', canCollide: false, bp: { tree: k } });
}
// Forest clearing with a campfire, a cabin, trees to chop, berry bushes and four far-off tents.
export function nightsMap(key) {
  return R => {
    const T = NIGHT_THEMES[key], parts = [], P = (...a) => { const p = mkPart(...a); parts.push(p); return p; };
    P('block', [0, -1, 0], [420, 2, 420], T.ground, T.groundMat, { name: 'Ground' });
    P('cylinder', [0, 0.01, 0], [26, 0.02, 26], T.clearing, 'sand', { name: 'Clearing', canCollide: false });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; P('sphere', [Math.cos(a) * 1.75, 0.22, Math.sin(a) * 1.75], [0.9, 0.55, 0.8], '#8A939E', 'stone', { name: 'Fire stone', rot: [0, -a / DEG, 0] }); }
    P('cylinder', [0, 0.12, 0], [2.8, 0.24, 2.8], '#2A1E18', 'wood', { name: 'Campfire', tag: 'campfire' });
    for (let i = 0; i < 3; i++) P('block', [0, 0.38, 0], [2.4, 0.32, 0.32], '#6B4A2E', 'wood', { name: 'Fire log', rot: [0, i * 60, 0], canCollide: false });
    P('sphere', [0, 1.05, 0], [1.7, 2.1, 1.7], '#FF7A2B', 'neon', { name: 'Flame', canCollide: false, tag: 'flame' });
    P('sphere', [0, 1.3, 0], [1, 1.7, 1], '#FFD24A', 'neon', { name: 'Flame core', canCollide: false, tag: 'flame' });
    for (const a of [0.5, 2.3, 4.2]) P('block', [Math.cos(a) * 5, 0.35, Math.sin(a) * 5], [0.7, 0.7, 2.6], '#7A5235', 'wood', { name: 'Log seat', rot: [0, -a / DEG, 0] });
    // Cabin with a doorway facing the fire
    const cx = -10, cz = -9, W = (pos, size, name = 'Cabin wall') => P('block', pos, size, '#8A5A35', 'wood', { name });
    P('block', [cx, 0.15, cz], [7, 0.3, 6], '#6B4A2E', 'wood', { name: 'Cabin floor' });
    W([cx, 2, cz - 2.85], [7, 3.7, 0.3]); W([cx - 3.35, 2, cz], [0.3, 3.7, 6]); W([cx + 3.35, 2, cz], [0.3, 3.7, 6]);
    W([cx - 2.35, 2, cz + 2.85], [2.3, 3.7, 0.3]); W([cx + 2.35, 2, cz + 2.85], [2.3, 3.7, 0.3]); W([cx, 3.35, cz + 2.85], [2.4, 1, 0.3]);
    P('wedge', [cx, 4.75, cz - 1.6], [7.8, 1.8, 3.4], '#5A3A28', 'wood', { name: 'Roof', rot: [0, 180, 0] });
    P('wedge', [cx, 4.75, cz + 1.6], [7.8, 1.8, 3.4], '#5A3A28', 'wood', { name: 'Roof' });
    P('block', [cx + 1.8, 0.75, cz - 1.8], [1.6, 0.9, 1], '#C08A55', 'wood', { name: 'Cabin crate' });
    const taken = [[0, 0, 13], [cx, cz, 6]], free = (x, z, r) => taken.every(([ox, oz, or]) => Math.hypot(x - ox, z - oz) > or + r);
    // Tents for the lost campers, far out in four directions
    const tents = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.7 + (R() - 0.5) * 0.5, r = 62 + R() * 14, x = Math.cos(a) * r, z = Math.sin(a) * r, col = T.tent[i % T.tent.length], yaw = -a / DEG + 90;
      P('wedge', [x + Math.cos(a) * 0.9, 1, z + Math.sin(a) * 0.9], [3, 2, 1.8], col, 'plastic', { name: 'Tent', rot: [0, yaw, 0], tag: 'tent', bp: { i } });
      P('wedge', [x - Math.cos(a) * 0.9, 1, z - Math.sin(a) * 0.9], [3, 2, 1.8], col, 'plastic', { name: 'Tent', rot: [0, yaw + 180, 0] });
      P('cylinder', [x + Math.cos(a + 0.9) * 3, 1, z + Math.sin(a + 0.9) * 3], [0.15, 2, 0.15], '#4A3B30', 'wood', { name: 'Lantern pole' });
      P('block', [x + Math.cos(a + 0.9) * 3, 2.15, z + Math.sin(a + 0.9) * 3], [0.45, 0.5, 0.45], '#FFE07A', 'neon', { name: 'Tent lantern', canCollide: false });
      taken.push([x, z, 6]); tents.push([x, z]);
    }
    // Trees, bushes, rocks
    let k = 0;
    for (let i = 0; i < 500 && k < 70; i++) {
      const a = R() * Math.PI * 2, r = 15 + Math.pow(R(), 0.85) * 82, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!free(x, z, 2.4)) continue; taken.push([x, z, 1.4]); nightsTree(P, R, T, x, z, k++);
    }
    let b = 0;
    for (let i = 0; i < 300 && b < 12; i++) {
      const a = R() * Math.PI * 2, r = 16 + R() * 60, x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!free(x, z, 2.2)) continue; taken.push([x, z, 1.6]);
      P('sphere', [x, 0.7, z], [2.2, 1.5, 2.2], T.bush, 'grass', { name: 'Berry bush', tag: 'bush', bp: { k: b } });
      for (let j = 0; j < 3; j++) { const t = j / 3 * Math.PI * 2 + R(); P('sphere', [x + Math.cos(t) * 0.85, 0.9 + R() * 0.35, z + Math.sin(t) * 0.85], [0.42, 0.42, 0.42], T.berry, 'neon', { name: 'Berries', canCollide: false, bp: { bush: b } }); }
      b++;
    }
    for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, r = 18 + R() * 75, x = Math.cos(a) * r, z = Math.sin(a) * r; if (free(x, z, 2)) PartyKit.rock(P, R, x, z, 1.4 + R() * 1.6, 0, T.rock); }
    return { parts, spawn: [0, 0.3, 7], spawnYaw: Math.PI };
  };
}

Modes.nights = {
  label: 'Survival', hp: true,
  hint: 'WASD to move · E to chop trees, feed the fire and eat berries · Stay in the firelight at night',
  defaults: { nights: 99, theme: 'forest', day: 45, night: 55, creature: 'the Gloom', campers: 4 },
  setup(G) {
    const o = G.modeOpts, T = NIGHT_THEMES[o.theme] || NIGHT_THEMES.forest;
    this.theme = T; this.logFuel = T.logFuel || LOG_FUEL; this.dayEnv = ENV[T.day] || ENV.day; this.saveKey = 'pf.v1.nights.' + G.def.id; this.cycle = o.day + o.night;
    this.c = 3; this.survived = 0; this.fuel = 70; this.logs = 0; this.cap = 6; this.food = 100; this.useCool = 0; this.skyKey = ''; this.near = false; this.edgeT = -9;
    this.chops = new Map(); this.down = new Map(); this.eaten = new Map(); this.rescued = new Set(); this.choosing = false; this.ask = null; this.respawnT = 0; this.warned = false;
    this.hudT = 0; this.ctxT = 0; this.lastCtx = null;
    // Multiplayer bookkeeping. synced: we have mirrored a host's camp. hostedRoom: other players were in our camp
    // while we hosted it (so a later sync is still our own run). joinedRun: the camp we mirror is someone else's
    // run, so it is never saved over our own saved run. mine: things we changed a moment ago that the host's
    // state may not show yet (key -> game time until which we trust our own value).
    this.synced = false; this.hostedRoom = false; this.joinedRun = false; this.mine = new Map();
    // Index trees and bushes by number so a whole tree (trunk and crown) can vanish and grow back.
    this.trees = new Map(); this.bushes = new Map();
    for (const p of World.parts) {
      const bp = p.bp || {};
      if (p.tag === 'tree') this.groupOf(this.trees, bp.k).trunk = p;
      if (Number.isInteger(bp.tree)) this.groupOf(this.trees, bp.tree).ids.push(p.id);
      if (p.tag === 'bush') this.groupOf(this.bushes, bp.k).trunk = p;
      if (Number.isInteger(bp.bush)) this.groupOf(this.bushes, bp.bush).ids.push(p.id);
    }
    this.flames = G.partsByTag('flame').map(p => { const m = G.mesh(p.id); m.matrixAutoUpdate = true; return { m, s: m.scale.clone(), y: m.position.y }; });
    this.light = new THREE.PointLight('#FF9A4A', 2, 30, 1.6); this.light.position.set(0, 2.4, 0); World.scene.add(this.light);
    // The creature: hides by day, hunts by night, and will not enter the firelight.
    this.gloom = G.bots.add({ name: o.creature, pos: [0, -60, 0], flying: true, scale: 1.6, nametag: false, skin: shadowSkin(), speed: 0.45 });
    addGlowEyes(this.gloom); this.gloom.avatar.root.visible = false; this.gloom.data = { state: 'away', t: 0 };
    // Lost campers wait by their tents.
    const names = ['Pip', 'Juniper', 'Bo', 'Wren'].slice(0, o.campers);
    this.campers = G.partsByTag('tent').slice(0, names.length).map((t, i) => {
      const a = Math.atan2(t.pos[2], t.pos[0]), at = [t.pos[0] - Math.cos(a) * 3, 0.3, t.pos[2] - Math.sin(a) * 3];
      const b = G.bots.add({ name: names[i], pos: at, scale: 0.78, speed: 1.08, seed: 'camper' + names[i] });
      b.data = { state: 'lost', seat: i / 4 * Math.PI * 2 + 0.9, home: at }; return b;
    });
    G.addAction({ id: 'use', label: 'Use', icon: 'hand', key: 'KeyE', keyLabel: 'E', primary: true, onDown: () => this.use(G) });
    G.hud.objective(`Survive ${o.nights} nights. Keep the fire burning`);
    this.hud(G);
    const sv = this.readSave();
    this.ownSave = sv;
    if (sv && sv.s < o.nights) this.askContinue(G, sv);
  },
  groupOf(map, k) { let g = map.get(k); if (!g) { g = { trunk: null, ids: [] }; map.set(k, g); } return g; },
  teardown(G) { this.hidePanel(G); this.choosing = false; this.ask = null; if (this.light && this.light.parent) this.light.parent.remove(this.light); this.light = null; },
  readSave() { const sv = LS.get(this.saveKey, null); return sv && typeof sv === 'object' && (sv.s | 0) > 0 ? sv : null; },
  // Remember that we changed something just now, so the host's slightly older state doesn't undo it.
  mark(key, sec = 2.5) { this.mine.set(key, Game.t + sec); },
  fresh(key) { const t = this.mine.get(key); return t !== undefined && t > Game.t; },
  // "Continue your saved run?" The options appear once we know whether we are joining someone else's camp:
  // a guest follows the host's camp, so their own save is neither loaded into it nor overwritten.
  askContinue(G, sv) {
    this.choosing = true; G.frozen = true; this.ask = { sv, t: 0, ready: false };
    G.hud.panel({ title: 'Welcome back to camp', text: 'Looking for other campers…', options: [], onPick: id => this.pick(id, G) });
  },
  waitChoice(dt, G) {
    const a = this.ask; if (!a || a.ready) return;
    a.t += dt;
    const ph = Net.phase, known = (ph === 'solo' && a.t > 0.2) || (ph === 'off' && a.t > 0.8) || (ph === 'live' && Shared.isHost() && a.t > 0.3) || a.t > 4;
    if (!known) return;
    a.ready = true;
    G.hud.updatePanel({
      text: `Your saved run reached dawn after night ${a.sv.s}.`,
      options: [{ id: 'continue', key: '1', title: `Continue at night ${a.sv.s + 1}`, blurb: 'Pick up where you left off', on: true }, { id: 'new', key: '2', title: 'New run', blurb: 'Start again from night 1', on: false }],
    });
  },
  pick(id, G) {
    const a = this.ask; if (!this.choosing || !a || !a.ready) return;
    if (id === 'continue') this.load(a.sv, G);
    else if (id === 'new') { LS.set(this.saveKey, null); this.ownSave = null; }
    else return;
    this.closePanel(G);
  },
  hidePanel(G) { if (G) G.hud.closePanel(); },
  closePanel(G) { this.hidePanel(G); this.choosing = false; this.ask = null; G.frozen = false; Sfx.play('click'); this.hud(G); },
  load(sv, G) {
    this.survived = clamp(sv.s | 0, 0, G.modeOpts.nights - 1); this.fuel = clamp(+sv.f || 60, 20, 100); this.food = clamp(+sv.fo || 80, 30, 100);
    for (const name of Array.isArray(sv.r) ? sv.r : []) { const b = this.campers.find(c => c.name === name); if (b) this.rescue(b, G, 'quiet'); }
    this.logs = clamp(sv.l | 0, 0, this.cap);
    G.hud.flash(`Night ${this.survived + 1}`, 'info', 1500);
  },
  // Saves the camp at dawn and on rescues. Only the host saves, a camp you joined never replaces your own saved
  // run, and nothing is saved while the "continue your run?" choice is still open.
  save() {
    if (!Shared.isHost() || this.choosing || this.joinedRun) return;
    this.ownSave = { s: this.survived, f: Math.round(this.fuel), l: this.logs, fo: Math.round(this.food), r: [...this.rescued], at: Date.now() };
    LS.set(this.saveKey, this.ownSave);
  },
  safeR() { return this.fuel > 0 ? 5 + 13 * (this.fuel / 100) : 0; },
  isNight() { const o = Game.modeOpts; return this.c >= o.day - 3 && this.c < this.cycle - 2; },
  // What ended the player's life, in words.
  cause(G) {
    const w = G.lastHitBy;
    if (w === 'hazard') return 'The campfire burned you';
    if (w === 'hunger') return 'You ran out of food';
    return `${cap1(G.modeOpts.creature)} got you`;
  },
  // The chips keep one order: night, time until night or dawn, fire, logs, food, campers.
  hud(G) {
    const o = G.modeOpts, D = o.day, day = this.c < D;
    G.hud.stat('night', `Night ${Math.min(o.nights, this.survived + 1)} / ${o.nights}`, { icon: 'moon', label: 'Night' });
    const left = day ? D - this.c : this.cycle - this.c;
    G.hud.stat('cycle', (day ? 'Night in ' : 'Dawn in ') + fmtClock(left), { icon: day ? 'sun' : 'moon', label: 'Time', warn: day && left < 10 });
    G.hud.stat('fire', this.fuel > 0 ? Math.ceil(this.fuel) + '%' : 'Out!', { icon: 'fire', label: 'Fire', warn: this.fuel < 20 });
    G.hud.stat('logs', `${this.logs} / ${this.cap}`, { icon: 'log', label: 'Logs' });
    G.hud.stat('food', String(Math.ceil(this.food)), { icon: 'berry', label: 'Food', warn: this.food < 20 });
    if (this.campers.length) G.hud.stat('campers', `${this.rescued.size} / ${this.campers.length}`, { icon: 'users', label: 'Campers rescued' });
  },
  // ---- actions ----
  fireFull() { return this.fuel > 100 - this.logFuel / 2; },
  // Logs that fit in the fire right now (never more than you carry).
  feedCount() { return Math.min(this.logs, Math.max(1, Math.ceil((100 - this.fuel) / this.logFuel))); },
  context(G) {
    const b = G.body.pos;
    if (Math.hypot(b.x, b.z) < 4.3 && this.logs > 0) {
      if (this.fireFull()) return { kind: 'feed', full: true, label: 'Feed fire', icon: 'fire', prompt: 'The fire is full' };
      const n = this.feedCount(); return { kind: 'feed', label: 'Feed fire', icon: 'fire', prompt: `Feed ${n} log${n > 1 ? 's' : ''} to the fire` };
    }
    const bush = G.near('bush', 1.5)[0];
    if (bush && !this.eaten.has(bush.part.bp.k)) return { kind: 'eat', k: bush.part.bp.k, label: 'Eat', icon: 'berry', prompt: this.food > 95 ? "You're full" : 'Eat the berries' };
    const tree = G.near('tree', 1.4)[0];
    if (tree) { const n = this.chops.get(tree.part.bp.k) || 0; return { kind: 'chop', k: tree.part.bp.k, label: 'Chop', icon: 'axe', prompt: this.logs >= this.cap ? 'Your arms are full. Feed the fire' : `Chop the tree (${3 - n} more)` }; }
    return null;
  },
  use(G) {
    if (G.dead || G.ended || this.choosing || this.useCool > 0) return;
    const ctx = this.context(G); if (!ctx) { G.hud.flash('Walk up to a tree, a bush or the fire', 'info', 1200); return; }
    this.useCool = 0.32;
    if (ctx.kind === 'feed') {
      if (ctx.full) { G.hud.flash('The fire is full', 'info', 1100); return; }
      const n = this.feedCount(); this.logs -= n; Shared.act('feed', { n });
    } else if (ctx.kind === 'eat') {
      if (this.food > 95) return;
      this.food = Math.min(100, this.food + 35); G.heal(8); Sfx.play('pop'); Shared.act('eat', { k: ctx.k });
      G.fx.text({ x: G.body.pos.x, y: G.body.pos.y + 2.4, z: G.body.pos.z }, '+35 food', '#FF9AB8');
    } else if (ctx.kind === 'chop') {
      if (this.logs >= this.cap) { G.hud.flash('Your arms are full', 'bad', 1100); Sfx.play('error'); return; }
      const tr = this.trees.get(ctx.k), m = tr && G.mesh(tr.trunk.id); Sfx.play('chop');
      if (m) G.fx.burst({ x: m.position.x, y: G.body.pos.y + 1.2, z: m.position.z }, '#C08A55', 8, 3);
      const n = (this.chops.get(ctx.k) || 0) + 1;
      if (n >= 3) {
        this.chops.delete(ctx.k); const got = Math.min(2, this.cap - this.logs); this.logs += got;
        G.fx.text({ x: G.body.pos.x, y: G.body.pos.y + 2.4, z: G.body.pos.z }, `+${got} log${got > 1 ? 's' : ''}`, '#FFE07A');
        Shared.act('fell', { k: ctx.k });
      } else this.chops.set(ctx.k, n);
    }
    this.ctxT = 0; this.hud(G);
  },
  setTree(k, on) {
    const t = this.trees.get(k); if (!t || !t.trunk) return;
    for (const id of [t.trunk.id, ...t.ids]) { Game.setPartVisible(id, on); Game.setPartSolid(id, on); }
  },
  setBush(k, full) { const b = this.bushes.get(k); if (b) for (const id of b.ids) Game.setPartVisible(id, full); },
  onAct(from, kind, d, G) {
    if (!d || typeof d !== 'object') return;
    if (kind === 'fell') {
      const k = d.k | 0; if (from.isMe) this.mark('t' + k);
      if (this.trees.has(k) && !this.down.has(k)) { this.down.set(k, 150); this.setTree(k, false); if (!from.isMe) Sfx.play('chop'); }
    } else if (kind === 'eat') {
      const k = d.k | 0; if (from.isMe) this.mark('b' + k);
      if (this.bushes.has(k)) { this.eaten.set(k, 90); this.setBush(k, false); }
    } else if (kind === 'feed') {
      const n = clamp(d.n | 0, 0, 20); if (!n) return;
      const host = Shared.isHost();
      // The host owns the fire. Our own feed shows at once; the host's next state includes it.
      if (host || from.isMe) {
        const was = this.fuel; this.fuel = Math.min(100, this.fuel + n * this.logFuel);
        if (!host) this.mark('f');
        if (was <= 0 && this.fuel > 0) G.hud.flash('The fire is back!', 'good', 1300);
      }
      G.fx.burst({ x: 0, y: 1.6, z: 0 }, '#FFC53A', 10 + n * 3, 5); Sfx.play('crackle');
      if (!from.isMe) G.hud.flash(`${from.name} fed the fire`, 'info', 900);
      this.hud(G);
    } else if (kind === 'rescue') {
      const b = this.campers.find(c => c.name === d.name);
      if (b) this.rescue(b, G, from.isMe ? '' : 'remote');
    }
  },
  hostState() {
    return { c: Math.round(this.c * 10) / 10, s: this.survived, f: Math.round(this.fuel * 10) / 10, tr: [...this.down.keys()], bu: [...this.eaten.keys()], r: [...this.rescued] };
  },
  // A guest mirrors the host's camp: clock, nights, fire, felled trees, eaten bushes and rescued campers.
  onShared(st, G) {
    if (!st || typeof st !== 'object') return;
    const first = !this.synced; this.synced = true;
    if (first && this.ownSave && !this.hostedRoom) this.joinedRun = true;
    if (this.choosing) { this.hidePanel(G); this.choosing = false; this.ask = null; G.frozen = false; G.hud.flash('You joined the camp', 'good', 1400); }
    const c = +st.c; if (Number.isFinite(c) && Math.abs(this.c - c) > 0.6) this.c = clamp(c, 0, this.cycle);
    const was = this.fuel; let f = clamp(+st.f || 0, 0, 100);
    if (this.fresh('f')) f = Math.max(f, this.fuel);
    this.fuel = f;
    if (!first && was > 0 && f <= 0) { G.hud.flash('The fire went out!', 'bad', 2000); Sfx.play('alarm'); }
    else if (!first && was <= 0 && f > 0) G.hud.flash('The fire is back!', 'good', 1300);
    // Nights: adopt the host's count. Only a night lived through here (one more than before) counts as a dawn.
    const s = clamp(st.s | 0, 0, G.modeOpts.nights);
    if (s !== this.survived) { const lived = !first && s === this.survived + 1; this.survived = s; if (lived) { this.dawn(G, false); if (G.ended) return; } }
    const r = new Set(Array.isArray(st.r) ? st.r : []);
    for (const b of this.campers) {
      const safe = b.data.state === 'safe';
      if (r.has(b.name) && !safe) this.rescue(b, G, first ? 'quiet' : 'remote');
      else if (first && safe && !r.has(b.name)) this.unrescue(b, G);
    }
    const tr = new Set(st.tr || []), bu = new Set(st.bu || []);
    for (const k of this.trees.keys()) {
      const isDown = tr.has(k); if (isDown === this.down.has(k) || (!isDown && this.fresh('t' + k))) continue;
      if (isDown) this.down.set(k, 150); else this.down.delete(k); this.setTree(k, !isDown);
    }
    for (const k of this.bushes.keys()) {
      const empty = bu.has(k); if (empty === this.eaten.has(k) || (!empty && this.fresh('b' + k))) continue;
      if (empty) this.eaten.set(k, 90); else this.eaten.delete(k); this.setBush(k, !empty);
    }
    this.hud(G);
  },
  // A night survived.
  dawn(G, host) {
    const o = G.modeOpts;
    G.hud.flash(`Night ${this.survived} survived!`, 'good', 2000); Sfx.play('checkpoint');
    saveBest(G.def.id, this.survived, false);
    if (this.survived >= o.nights) {
      if (!this.joinedRun) { LS.set(this.saveKey, null); this.ownSave = null; }
      G.end({ win: true, title: `You survived ${o.nights} nights!`, sub: this.theme.win, stats: [['Nights', this.survived], ['Campers rescued', `${this.rescued.size} / ${this.campers.length}`]] });
      return;
    }
    if (host) this.save();
  },
  // how: '' when we brought them in, 'remote' when another player did, 'quiet' when loading or syncing.
  rescue(b, G, how = '') {
    if (b.data.state === 'safe') return;
    b.data.state = 'safe'; this.rescued.add(b.name); this.cap += 2;
    const s = b.data.seat; b.body.pos.set(Math.cos(s) * 4, 0.3, Math.sin(s) * 4); b.body.vel.set(0, 0, 0);
    if (how !== 'quiet') {
      G.hud.flash(`${b.name} is safe!`, 'good', 1600); Sfx.play(how ? 'checkpoint' : 'win');
      if (!how) b.say('Thank you! I will keep the fire going');
      G.fx.ring({ x: b.pos.x, y: 0.3, z: b.pos.z }, '#3FD07A', 3); this.save();
    }
    this.hud(G);
  },
  // Back to their tent (a guest's local rescue that the host's camp doesn't have).
  unrescue(b, G) {
    if (b.data.state !== 'safe') return;
    this.rescued.delete(b.name); this.cap = Math.max(6, this.cap - 2); this.logs = Math.min(this.logs, this.cap);
    b.data.state = 'lost'; b.respawn(b.data.home); this.hud(G);
  },
  onTouch(p, G) {
    if (p.tag !== 'flame') return;
    if (this.fuel <= 0) return true; // a dead fire doesn't burn
    const b = G.body, l = Math.hypot(b.pos.x, b.pos.z) || 1; G.damage(10, 'hazard'); b.vel.x += (b.pos.x / l || 0) * 10; b.vel.z += (b.pos.z / l || 1) * 10; b.vel.y = 6; b.grounded = false; b.noSnap = 0.2;
    return true;
  },
  onDeath(G, why) {
    if (why === 'reset') return; // Reset character: the runtime puts you back at camp and the run goes on
    const msg = this.cause(G);
    if (Net.remotes.size) { this.respawnT = 6; G.hud.flash(`${msg}. Back to camp soon`, 'bad', 2200); return true; }
    const sv = this.readSave(), best = getBest(G.def.id);
    G.end({ win: false, title: msg, sub: `You survived ${this.survived} night${this.survived === 1 ? '' : 's'}`, stats: [['Nights survived', this.survived], ['Best', best === null ? this.survived : Math.max(best, this.survived)], ['Campers rescued', `${this.rescued.size} / ${this.campers.length}`]], againLabel: sv ? `Try again from night ${sv.s + 1}` : 'Try again' });
    return true;
  },
  onRespawn(G) { this.food = Math.max(this.food, 40); this.ctxT = 0; },
  // ---- per frame ----
  update(dt, G) {
    if (G.ended) return;
    const o = G.modeOpts, host = Shared.isHost(), crowd = Net.remotes.size > 0;
    if (host && crowd && Net.room) this.hostedRoom = true;
    this.useCool -= dt;
    this.sky(o);
    this.fireLook(dt);
    if (this.choosing) {
      this.waitChoice(dt, G);
      // Alone, the whole camp waits for the choice. With others here, the host's camp keeps running for them and
      // only the host's own player waits.
      if (!(host && crowd)) return;
      const a = this.ask;
      if (a && a.ready && !a.crowd) { a.crowd = true; G.hud.updatePanel({ text: `Your saved run reached dawn after night ${a.sv.s}. The camp keeps going for the others while you choose.` }); }
    }
    // Clock, fire and regrowth: the host runs them; everyone else follows the host's state.
    this.c += dt;
    if (this.c >= this.cycle) { this.c -= this.cycle; if (host) { this.survived++; this.dawn(G, true); if (G.ended) return; } }
    if (host) {
      const night = this.isNight(), burn = (night ? 1.05 : 0.42) * (1 + Math.min(this.survived, 99) * 0.01), help = this.rescued.size * 0.12;
      const was = this.fuel; this.fuel = clamp(this.fuel - burn * dt + (this.fuel > 0 ? help * dt : 0), 0, 100);
      if (was > 0 && this.fuel <= 0) { G.hud.flash('The fire went out!', 'bad', 2000); Sfx.play('alarm'); }
      for (const [k, t] of this.down) if (t - dt <= 0) { this.down.delete(k); this.setTree(k, true); } else this.down.set(k, t - dt);
      for (const [k, t] of this.eaten) if (t - dt <= 0) { this.eaten.delete(k); this.setBush(k, true); } else this.eaten.set(k, t - dt);
    }
    if ((this.hudT -= dt) <= 0) { this.hudT = 0.25; this.hud(G); }
    if (this.choosing) return;
    if (!this.warned && this.c > o.day - 12 && this.c < o.day) { this.warned = true; G.hud.flash('Night is coming. Get back to the fire', 'info', 2200); }
    if (this.c < o.day - 12) this.warned = false;
    // You
    const me = G.body.pos, r = Math.hypot(me.x, me.z);
    if (r > 104) { me.x *= 104 / r; me.z *= 104 / r; if (G.t - this.edgeT > 3) { this.edgeT = G.t; G.hud.flash('The woods are too thick that way', 'info', 1200); } }
    if (!G.dead) {
      this.food = Math.max(0, this.food - dt * 0.5);
      if (this.food <= 0) G.damage(2 * dt, 'hunger', true);
      if (r < this.safeR() && G.hp < G.maxHp) G.heal(3 * dt);
    }
    if (this.respawnT > 0 && (this.respawnT -= dt) <= 0) { G.setCheckpoint([0, 0.3, 7], Math.PI); G.respawn(true); }
    // What the action button does here. Checked ten times a second, written only when it changes.
    if ((this.ctxT -= dt) <= 0) {
      this.ctxT = 0.1;
      const ctx = !G.dead && this.context(G), key = ctx ? ctx.kind + '|' + ctx.prompt : '';
      if (key !== this.lastCtx) {
        this.lastCtx = key;
        G.setActionLabel('use', ctx ? ctx.label : 'Use'); G.setActionIcon('use', ctx ? ctx.icon : 'hand'); G.hud.prompt(ctx ? ctx.prompt : null);
      }
    }
    for (const b of this.campers) this.camper(b, dt, G);
    this.creature(dt, G);
  },
  sky(o) {
    const D = o.day, N = o.night, c = this.c, day = this.dayEnv;
    let a = day, b = day, t = 0, key = 'd';
    if (c >= D - 10 && c < D - 4) { a = day; b = ENV.sunset; t = (c - (D - 10)) / 6; key = 's'; }
    else if (c >= D - 4 && c < D + 2) { a = ENV.sunset; b = DEEP_NIGHT; t = (c - (D - 4)) / 6; key = 'n'; }
    else if (c >= D + 2 && c < D + N - 6) { a = b = DEEP_NIGHT; key = 'N'; }
    else if (c >= D + N - 6) { a = DEEP_NIGHT; b = day; t = (c - (D + N - 6)) / 6; key = 'm'; }
    const q = key + Math.round(clamp(t, 0, 1) * 30);
    if (q !== this.skyKey) { this.skyKey = q; World.setEnvBlend(a, b, Math.round(clamp(t, 0, 1) * 30) / 30); }
  },
  fireLook(dt) {
    const f = this.fuel / 100, on = this.fuel > 0, fl = 0.9 + Math.sin(Game.t * 13) * 0.05 + Math.sin(Game.t * 23.7) * 0.04;
    for (const F of this.flames) { F.m.visible = on; const k = (0.35 + 0.75 * f) * fl; F.m.scale.set(F.s.x * k, F.s.y * k * (1 + Math.sin(Game.t * 9) * 0.06), F.s.z * k); F.m.position.y = F.y * (0.5 + 0.5 * k); }
    if (this.light) { this.light.intensity = on ? (this.isNight() ? 1.3 + 1.7 * f : 0.5) * fl : 0; this.light.distance = 10 + 30 * f; }
  },
  camper(b, dt, G) {
    const d = b.data, me = G.body.pos;
    if (d.state === 'lost') {
      b.stop();
      if (!G.dead && b.dist(me) < 3.4) { d.state = 'follow'; b.say('You found me! Take me to the fire'); Sfx.play('pick'); G.hud.flash(`${b.name} is following you`, 'good', 1500); }
    } else if (d.state === 'follow') {
      if (G.dead) { d.state = 'lost'; b.respawn(d.home); return; }
      if (b.dist(me) > 16) { const a = G.facing + Math.PI; b.respawn([me.x + Math.sin(a) * 2, me.y + 0.5, me.z + Math.cos(a) * 2]); }
      b.goTo(me.x, me.z, 2.2);
      // Everyone in the room seats them at the fire (onAct runs right away for us).
      if (Math.hypot(b.pos.x, b.pos.z) < 8.5) Shared.act('rescue', { name: b.name });
    } else {
      const s = d.seat; if (b.goTo(Math.cos(s) * 4, Math.sin(s) * 4, 0.5)) b.face(0, 0);
    }
  },
  creature(dt, G) {
    const g = this.gloom, d = g.data, me = G.body.pos, o = G.modeOpts;
    if (!this.isNight()) {
      if (d.state !== 'away') { d.state = 'away'; G.fx.burst({ x: g.pos.x, y: g.pos.y + 1.5, z: g.pos.z }, '#2A2440', 20, 4); g.avatar.root.visible = false; g.body.pos.set(0, -60, 0); }
      g.stop(); return;
    }
    if (d.state === 'away') {
      const a = G.R() * Math.PI * 2; g.body.pos.set(me.x + Math.cos(a) * 34, 0.6, me.z + Math.sin(a) * 34); g.avatar.root.visible = true; d.state = 'hunt';
      G.hud.flash(`${cap1(o.creature)} is out there`, 'bad', 1800); Sfx.play('whoosh');
    }
    const safe = this.safeR(), pr = Math.hypot(me.x, me.z), gd = Math.hypot(g.pos.x - me.x, g.pos.z - me.z);
    g.speed = (0.4 + Math.min(0.45, this.survived * 0.005)) * (this.fuel <= 0 ? 1.45 : 1);
    if (d.state === 'retreat') {
      d.t -= dt; const ax = g.pos.x - me.x, az = g.pos.z - me.z, l = Math.hypot(ax, az) || 1; g.move.x = ax / l; g.move.z = az / l; g.move.y = 0;
      if (d.t <= 0) d.state = 'hunt';
    } else if (!G.dead && pr > safe + 0.5) {
      g.goTo(me.x, me.z, 0.1, me.y + 0.4); g.face(me.x, me.z);
      // Never inside the firelight: it only strikes a player standing out in the dark.
      if (gd < 1.5 && pr > safe && Math.abs(g.pos.y - me.y) < 2.2) {
        G.damage(Math.round(24 + this.survived * 0.25), 'gloom');
        const l = gd || 1; G.body.vel.x += (me.x - g.pos.x) / l * 12; G.body.vel.z += (me.z - g.pos.z) / l * 12; G.body.vel.y = 7; G.body.grounded = false; G.body.noSnap = 0.2;
        d.state = 'retreat'; d.t = 2.5;
      }
    } else {
      const a = Math.atan2(g.pos.z, g.pos.x) + dt * 0.3, R = safe + 6; g.goTo(Math.cos(a) * R, Math.sin(a) * R, 0.3, 0.6); g.face(me.x, me.z);
    }
    // The firelight pushes it back.
    const gr = Math.hypot(g.pos.x, g.pos.z);
    if (this.fuel > 0 && gr < safe + 1) { const k = (safe + 1) / (gr || 1); g.body.pos.x *= k; g.body.pos.z *= k; }
    g.body.pos.y = Math.max(0.3, g.body.pos.y);
    if (!this.near && gd < 12 && pr > safe) { this.near = true; Sfx.play('alarm'); } else if (gd > 18) this.near = false;
  },
};

// ---- Shade Hunt: catch the shades hiding in a night garden with your lantern ----
export function shadeGardenMap(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), half = 40;
  P('block', [0, -1, 0], [200, 2, 200], '#1E2A22', 'grass', { name: 'Lawn' });
  for (const [x, z, w, d] of [[0, half, 2 * half + 1, 1], [0, -half, 2 * half + 1, 1], [half, 0, 1, 2 * half], [-half, 0, 1, 2 * half]]) P('block', [x, 1.6, z], [w, 3.2, d], '#2A2A34', 'metal', { name: 'Iron fence' });
  // Manor front at the north edge
  P('block', [0, 5, -half + 4], [26, 10, 6], '#3A3248', 'brick', { name: 'Manor' });
  P('wedge', [0, 11.5, -half + 4], [27, 3, 6], '#241E30', 'stone', { name: 'Manor roof', rot: [0, 180, 0] });
  for (const x of [-9, -3, 3, 9]) P('block', [x, 6, -half + 6.95], [2, 2.6, 0.1], '#FFC86A', 'neon', { name: 'Window' });
  // Hedges, graves and dead trees
  const spots = [];
  for (let i = 0; i < 26; i++) {
    const x = (R() - 0.5) * (2 * half - 10), z = (R() - 0.5) * (2 * half - 22) + 5; if (Math.hypot(x, z - 30) < 6 || Math.hypot(x, z) < 5) continue;
    const k = R();
    if (k < 0.5) P('block', [x, 1.2, z], [R() < 0.5 ? 8 : 2, 2.4, R() < 0.5 ? 2 : 8], '#24402C', 'grass', { name: 'Hedge' });
    else if (k < 0.8) P('block', [x, 0.7, z], [1.4, 1.4, 0.4], '#6A6E78', 'stone', { name: 'Gravestone', rot: [0, (R() - 0.5) * 20, (R() - 0.5) * 8] });
    else { P('cylinder', [x, 2.5, z], [0.7, 5, 0.7], '#2E2620', 'wood', { name: 'Dead tree' }); P('block', [x + 0.9, 4, z], [2, 0.3, 0.3], '#2E2620', 'wood', { name: 'Branch', rot: [0, R() * 180, 30] }); }
    spots.push([x, z]);
  }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P('cylinder', [Math.cos(a) * 20, 1.4, Math.sin(a) * 20], [0.2, 2.8, 0.2], '#22222A', 'metal', { name: 'Lamp post' }); P('sphere', [Math.cos(a) * 20, 3, Math.sin(a) * 20], [0.6, 0.6, 0.6], '#9A7BFF', 'neon', { name: 'Ghost lamp', canCollide: false }); }
  P('cylinder', [0, 0.4, 0], [6, 0.8, 6], '#5A5866', 'stone', { name: 'Fountain' }); P('cylinder', [0, 0.82, 0], [5, 0.05, 5], '#4CF0FF', 'neon', { name: 'Fountain water', canCollide: false, transparency: 0.3 });
  return { parts, spawn: [0, 0.3, 30], spawnYaw: Math.PI };
}
Modes.shadehunt = {
  label: 'Shade Hunt', board: false,
  hint: 'WASD to move · Space to jump · Run into a shade to catch it with your lantern',
  defaults: { shades: 8, time: 150 },
  setup(G) {
    const o = G.modeOpts; this.left = o.time; this.caught = 0;
    World.setEnv(Object.assign({}, ENV.haunted, { hemiI: 0.28, sunI: 0.12, fog: 0.4 }));
    this.lamp = new THREE.PointLight('#FFD9A0', 1.8, 16, 1.4); World.scene.add(this.lamp);
    this.pool = lightPool('#FFD9A0', 5.5).add(); this.poolY = G.body.pos.y;
    this.shades = [];
    for (let i = 0; i < o.shades; i++) {
      const a = i / o.shades * Math.PI * 2 + G.R(), r = 12 + G.R() * 22;
      const b = G.bots.add({ name: 'Shade', pos: [Math.cos(a) * r, 0.6, Math.sin(a) * r - 4], flying: true, nametag: false, skin: shadowSkin('#1A1630', '#2A2448'), speed: 0.7, scale: 0.9 });
      addGlowEyes(b, '#9AF7FF'); b.data = { wander: 0, tx: 0, tz: 0, blink: 0 }; this.shades.push(b);
    }
    G.hud.objective(`Catch all ${o.shades} shades before the clock strikes`);
    G.hud.stat('shades', `0 / ${o.shades}`, { icon: 'eye', label: 'Shades caught' }); G.hud.stat('time', fmtClock(this.left), { icon: 'clock', label: 'Time' });
  },
  teardown() {
    if (this.lamp && this.lamp.parent) this.lamp.parent.remove(this.lamp); this.lamp = null;
    if (this.pool) this.pool.dispose(); this.pool = null;
  },
  update(dt, G) {
    if (G.ended) return;
    const o = G.modeOpts, me = G.body.pos;
    this.lamp.position.set(me.x, me.y + 2.2, me.z); this.lamp.intensity = 1.6 + Math.sin(G.t * 8) * 0.08;
    if (G.body.grounded) this.poolY = me.y;
    this.pool.at(me.x, this.poolY + 0.06, me.z, G.dead ? 0 : 1 + Math.sin(G.t * 8) * 0.03);
    this.left -= dt; G.hud.stat('time', fmtClock(this.left), { icon: 'clock', warn: this.left < 20 });
    for (const b of this.shades) {
      if (!b.alive) continue;
      const d = b.data, dist = b.dist(me);
      if (dist < 1.7 && Math.abs(b.pos.y - me.y) < 2.5 && !G.dead) {
        G.bots.down(b, 'me'); this.caught++; G.addScore(1); G.fx.ring({ x: b.pos.x, y: me.y + 0.5, z: b.pos.z }, '#9AF7FF', 3); G.fx.text({ x: b.pos.x, y: me.y + 2.6, z: b.pos.z }, 'Caught!', '#9AF7FF');
        G.hud.stat('shades', `${this.caught} / ${o.shades}`, { icon: 'eye' }); Sfx.play('coin');
        if (this.caught >= o.shades) { const best = saveBest(G.def.id, G.time); G.end({ win: true, title: 'Every shade caught!', sub: best.isNew ? 'New best time!' : `Best: ${fmtTime(best.best)}`, stats: [['Time', fmtTime(G.time)]] }); return; }
        continue;
      }
      if (dist < 9) {
        // flee, and blink away when cornered
        const ax = b.pos.x - me.x, az = b.pos.z - me.z, l = Math.hypot(ax, az) || 1;
        b.goTo(b.pos.x + ax / l * 6 + Math.sin(G.t * 3 + b.id.length) * 2, b.pos.z + az / l * 6, 0.1, 0.8);
        if (Math.abs(b.pos.x) > 36 || Math.abs(b.pos.z) > 36) { b.move.x = -b.pos.x * 0.03; b.move.z = -b.pos.z * 0.03; }
        if (dist < 3 && (d.blink -= dt) <= 0 && G.R() < dt * 0.9) { d.blink = 6; G.fx.burst({ x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z }, '#2A2448', 12, 3); b.body.pos.set((G.R() - 0.5) * 60, 0.8, (G.R() - 0.5) * 50); Sfx.play('whoosh'); }
      } else {
        if ((d.wander -= dt) <= 0) { d.wander = 2 + G.R() * 3; d.tx = (G.R() - 0.5) * 66; d.tz = (G.R() - 0.5) * 56; }
        b.goTo(d.tx, d.tz, 1, 0.6 + Math.sin(G.t + b.id.length) * 0.4);
      }
      b.pos.x = clamp(b.pos.x, -38, 38); b.pos.z = clamp(b.pos.z, -34, 38);
    }
    if (this.left <= 0) G.end({ win: false, title: 'The shades got away', stats: [['Caught', `${this.caught} / ${o.shades}`]] });
  },
};

// ---- Lantern Trail: follow a dark forest path to the beacon before your lantern oil runs out ----
export function lanternTrailMap(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), STREAM = 13;
  P('block', [0, -1, 0], [400, 2, 400], '#1E3324', 'grass', { name: 'Forest floor' });
  let x = 0, z = 0, a = 0; const pts = [[0, 0, 0]];
  for (let i = 0; i < 26; i++) { a += (R() - 0.5) * 0.9; x += Math.sin(a) * 9; z -= Math.cos(a) * 9; pts.push([x, z, a]); }
  pts.forEach(([px, pz, pa], i) => {
    P('cylinder', [px, 0.02, pz], [5.5, 0.04, 5.5], '#6A5235', 'sand', { name: 'Path', canCollide: false });
    if (i > 0 && i < pts.length - 1) {
      const [qx, qz] = pts[i - 1]; P('cylinder', [(px + qx) / 2, 0.02, (pz + qz) / 2], [5, 0.04, 5], '#6A5235', 'sand', { name: 'Path', canCollide: false });
      if (i % 2 === 0) PartyKit.item(parts, 'gem', [px + (R() - 0.5) * 2, 1, pz + (R() - 0.5) * 2], { color: '#FFC53A', extra: { name: 'Lantern oil', bp: { value: 1 } } });
      if (i % 5 === 3 && i !== STREAM) P('cylinder', [px, 0.45, pz], [0.9, 5, 0.9], '#5A4030', 'wood', { name: 'Fallen log', rot: [90, -Math.atan2(pz - qz, px - qx) / DEG, 0] });
      if (i === STREAM) {
        // A cold stream across the trail with stepping stones. The trail can bend here, so the stream and the
        // stones line up halfway between the way in and the way out, and the stones reach both banks.
        const sa = (pa + pts[i + 1][2]) / 2;
        P('block', [px, 0.05, pz], [40, 0.1, 5], '#2E86D8', 'ice', { name: 'Cold stream', behavior: 'kill', rot: [0, -sa / DEG, 0] });
        for (const s of [-1.8, 0, 1.8]) P('cylinder', [px + Math.sin(sa) * s, 0.15, pz - Math.cos(sa) * s], [1.9, 0.5, 1.9], '#8A939E', 'stone', { name: 'Stepping stone' });
      }
      // Trail markers save your place; the ones by the stream sit on dry ground, one on each bank.
      if ((i % 3 === 1 && i !== STREAM) || i === STREAM - 1 || i === STREAM + 1) P('cylinder', [px, 0.1, pz], [3, 0.2, 3], '#8A939E', 'stone', { name: 'Trail marker', behavior: 'checkpoint' });
    }
  });
  const [ex, ez] = pts[pts.length - 1];
  P('cylinder', [ex, 3, ez], [3, 6, 3], '#E9E4D8', 'brick', { name: 'Beacon tower' });
  P('sphere', [ex, 6.8, ez], [2.4, 2.4, 2.4], '#FFE07A', 'neon', { name: 'Beacon', canCollide: false });
  P('block', [ex, 0.3, ez + 3], [4, 0.6, 2], '#FFC53A', 'neon', { name: 'Finish', behavior: 'finish' });
  for (let i = 0; i < 95; i++) {
    const tx = (R() - 0.5) * 120 + ex / 2, tz = (R() - 0.5) * 100 + ez / 2;
    if (pts.some(([px, pz]) => Math.hypot(tx - px, tz - pz) < 5.5)) continue;
    PartyKit.tree(P, R, tx, tz, 'pine');
  }
  return { parts, spawn: [0, 0.3, 0], spawnYaw: Math.PI };
}
Modes.lantern = {
  label: 'Lantern Trail',
  hint: 'WASD to move · Space to jump · Grab oil jars to keep your lantern lit',
  setup(G) {
    this.oil = 100; this.dark = false; this.poolY = G.body.pos.y;
    World.setEnv(Object.assign({}, DEEP_NIGHT, { fog: 0.26, hemiI: 0.16 }));
    this.lamp = new THREE.PointLight('#FFD9A0', 2, 18, 1.4); World.scene.add(this.lamp);
    this.pool = lightPool('#FFD9A0', 5).add();
    G.hud.objective('Follow the trail to the beacon');
    G.hud.stat('oil', '100%', { icon: 'fire', label: 'Lantern oil' }); G.hud.stat('time', fmtTime(0), { icon: 'clock', label: 'Time' });
  },
  teardown() {
    if (this.lamp && this.lamp.parent) this.lamp.parent.remove(this.lamp); this.lamp = null;
    if (this.pool) this.pool.dispose(); this.pool = null;
  },
  onCoin(p, G) { this.oil = Math.min(100, this.oil + 30); G.fx.text({ x: G.body.pos.x, y: G.body.pos.y + 2.4, z: G.body.pos.z }, '+30 oil', '#FFE07A'); },
  onRespawn() { this.oil = Math.max(this.oil, 50); },
  onFinish(p, G) {
    const best = saveBest(G.def.id, G.time);
    G.end({
      win: true, title: 'You reached the beacon!', sub: best.isNew ? (best.had ? 'New personal best!' : 'First clear!') : `Your best: ${fmtTime(best.best)}`,
      stats: [['Time', fmtTime(G.time)], ['Oil jars', `${G.score} / ${G.coinsTotal}`], ['Restarts', G.deaths]],
    });
    return true;
  },
  update(dt, G) {
    if (G.ended) return;
    const me = G.body.pos, f = this.oil / 100, lit = this.oil > 0;
    if (!G.dead && !G.frozen) this.oil = Math.max(0, this.oil - dt * 2.2);
    this.lamp.position.set(me.x, me.y + 2.2, me.z); this.lamp.intensity = lit ? (0.8 + 1.6 * f) * (0.95 + Math.sin(G.t * 11) * 0.05) : 0; this.lamp.distance = 6 + 16 * f;
    if (G.body.grounded) this.poolY = me.y;
    this.pool.at(me.x, this.poolY + 0.06, me.z, lit && !G.dead ? 0.45 + 0.75 * f : 0);
    const dark = !lit && !G.dead;
    if (dark) G.damage(8 * dt, 'dark', true);
    if (dark !== this.dark) { this.dark = dark; G.hud.prompt(dark ? 'Your lantern is out! Find oil' : null); }
    G.hud.stat('oil', Math.ceil(this.oil) + '%', { icon: 'fire', warn: this.oil < 25 });
    G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
  },
};

registerGames([
  { id: 'nights-pinewood', title: '99 Nights at Pinewood', cat: 'featured', featured: true, mode: 'nights', modeOpts: { nights: 99, theme: 'forest', creature: 'the Gloom' }, env: { sky: 'sunset' }, accent: '#FF7A2B', icon: 'fire', tags: ['survival'],
    desc: 'Keep the campfire burning in Pinewood Forest. Chop trees by day, rescue four lost campers, and stay in the light when the Gloom comes out at night. Your run saves at every dawn.',
    build: nightsMap('forest'), thumb: { pos: [16, 9, 20], look: [0, 1.5, 0] } },
  { id: 'nights-frost', title: 'Frost Island Nights', cat: 'survival', mode: 'nights', modeOpts: { nights: 10, theme: 'snow', creature: 'the Frostbite', day: 40, night: 50 }, env: { sky: 'snow' }, accent: '#CFEFFF', icon: 'moon', tags: ['survival'],
    desc: 'Ten freezing nights on a snowy island. Feed the fire, eat winter berries and keep away from the Frostbite.',
    build: nightsMap('snow'), thumb: { pos: [16, 9, 20], look: [0, 1.5, 0] } },
  { id: 'nights-desert', title: 'Desert Camp Nights', cat: 'survival', mode: 'nights', modeOpts: { nights: 15, theme: 'desert', creature: 'the Dune Wraith', day: 50, night: 50 }, env: { sky: 'desert' }, accent: '#FFC53A', icon: 'sun', tags: ['survival'],
    desc: 'Fifteen nights in the dunes. Cactus wood burns fast, so keep chopping. The Dune Wraith hates the light.',
    build: nightsMap('desert'), thumb: { pos: [16, 9, 20], look: [0, 1.5, 0] } },
  { id: 'shade-hunt', title: 'Shade Hunt', cat: 'survival', mode: 'shadehunt', env: { sky: 'haunted' }, accent: '#9AF7FF', icon: 'eye', tags: ['bots'],
    desc: 'Eight shades hide in a moonlit manor garden. Chase them down with your lantern before the clock strikes.',
    build: shadeGardenMap, thumb: { pos: [24, 14, 34], look: [0, 1, 0] } },
  { id: 'lantern-trail', title: 'Lantern Trail', cat: 'survival', mode: 'lantern', env: { sky: 'night' }, accent: '#FFE07A', icon: 'fire', killY: -10, tags: ['solo'],
    desc: 'Walk a dark forest trail to the beacon. Your lantern burns down, so grab oil jars on the way. Watch out for the cold stream.',
    build: lanternTrailMap, thumb: { pos: [10, 8, 12], look: [0, 1, -10] } },
]);
