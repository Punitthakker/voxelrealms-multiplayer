import * as THREE from 'three';
import { IS_TOUCH, Sfx, pick } from '../core.js';
import { Phys } from '../physics.js';
import { World, mkPart } from '../world.js';
import { fmtClock, fmtTime } from '../hud.js';
import { Modes, registerGames, saveBest } from '../game.js';

/* ---------- Games: party minigames and hangouts ---------- */
export const PartyKit = {
  // A collectible: coin disc, gem, star, shell, mushroom or crystal. Uses the built-in coin behavior.
  item(parts, kind, pos, x = {}) {
    const look = {
      coin: ['cylinder', [1.2, 1.2, 0.25], '#FFD24A', [90, 0, 0]], gem: ['block', [0.8, 0.8, 0.8], '#4CF0FF', [45, 0, 45]],
      star: ['block', [0.9, 0.9, 0.9], '#FFE07A', [0, 45, 45]], shell: ['sphere', [1, 0.55, 1], '#FFB3C7', [0, 0, 0]],
      mushroom: ['sphere', [1.2, 0.8, 1.2], '#E23E62', [0, 0, 0]], crystal: ['block', [0.6, 1.3, 0.6], '#C9A8FF', [0, 45, 0]],
    }[kind] || ['cylinder', [1.2, 1.2, 0.25], '#FFD24A', [90, 0, 0]];
    parts.push(mkPart(look[0], pos, look[1], x.color || look[2], 'neon', Object.assign({ name: kind[0].toUpperCase() + kind.slice(1), rot: look[3], canCollide: false, behavior: 'coin', bp: { respawn: x.respawn || 0 } }, x.extra || {})));
  },
  tree(P, R, x, z, kind = 'round', y = 0) {
    if (kind === 'palm') { for (let i = 0; i < 5; i++) P('cylinder', [x + i * 0.25, y + 0.8 + i * 1.5, z], [0.7, 1.6, 0.7], '#9C7A4E', 'wood', { name: 'Palm trunk' }); P('sphere', [x + 1.3, y + 8, z], [5, 1.4, 5], '#3FA34D', 'grass', { name: 'Palm leaves' }); return; }
    if (kind === 'pine') { P('cylinder', [x, y + 1.5, z], [0.8, 3, 0.8], '#6B4A2E', 'wood', { name: 'Trunk' }); P('cylinder', [x, y + 4.4, z], [3.6, 3.6, 3.6], '#2F7A55', 'grass', { name: 'Pine' }); P('cylinder', [x, y + 6.6, z], [2.2, 2, 2.2], '#2F7A55', 'grass', { name: 'Pine top' }); return; }
    P('cylinder', [x, y + 2, z], [0.9, 4, 0.9], '#8A5A35', 'wood', { name: 'Trunk' });
    P('sphere', [x, y + 5.2, z], [4.4, 4, 4.4], R() < 0.5 ? '#4DB06A' : '#3F9E57', 'grass', { name: 'Leaves' });
  },
  rock(P, R, x, z, s = 2, y = 0, color = '#8A939E') { P('sphere', [x, y + s * 0.3, z], [s * 1.4, s, s * 1.2], color, 'stone', { name: 'Rock', rot: [0, R() * 180, 0] }); },
  // Platform-only spawn pad on top of y.
  spawn(P, x, y, z) { P('spawn', [x, y + 0.2, z], [5, 0.4, 5], '#FF6A2B', 'plastic', { name: 'Spawn' }); return [x, y + 0.45, z]; },
  grid(cols, rows) { const out = []; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push([i, j]); return out; },
};

// ---- Modes ----
// Collect N items before the clock runs out. modeOpts: {target, time, item, falling, fallEvery}
Modes.collect = {
  label: 'Collect', board: true, boardTitle: 'Collected',
  setup(G) {
    const o = G.modeOpts; this.target = o.target || G.coinsTotal; this.fallT = 1; this.falling = [];
    G.hud.objective(`Collect ${this.target} ${o.noun || 'coins'}${o.time ? ' before time runs out' : ''}`);
    G.hud.stat('got', `0 / ${this.target}`, { icon: o.icon || 'coin', label: 'Collected' });
    if (o.time) G.hud.stat('time', fmtClock(o.time), { icon: 'clock', label: 'Time left' });
  },
  got(G) {
    G.hud.stat('got', `${G.score} / ${this.target}`, { icon: G.modeOpts.icon || 'coin' });
    if (G.score >= this.target && !G.ended) G.end({ win: true, title: `All ${G.modeOpts.noun || 'coins'} collected!`, stats: [['Time', fmtTime(G.time)], ['Collected', G.score]] });
  },
  onCoin(p, G) { this.got(G); },
  onTouch(p, G) {
    if (p.tag !== 'falling') return;
    G.removePart(p.id); this.falling = this.falling.filter(f => f.id !== p.id);
    G.addScore(1); Sfx.play('coin'); G.fx.burst({ x: p.pos[0], y: p.pos[1], z: p.pos[2] }, '#FFE07A', 10, 4); this.got(G); return true;
  },
  update(dt, G) {
    const o = G.modeOpts;
    if (o.time) { const left = o.time - G.time; G.hud.stat('time', fmtClock(left), { icon: 'clock', warn: left < 10 }); if (left <= 0 && !G.ended) G.end({ win: false, title: "Time's up!", sub: `You collected ${G.score} of ${this.target}.`, stats: [['Collected', G.score]] }); }
    if (o.falling && !G.ended) {
      if ((this.fallT -= dt) <= 0 && this.falling.length < 14) {
        this.fallT = o.fallEvery || 1.4;
        const a = G.R() * Math.PI * 2, r = 4 + G.R() * (o.radius || 40), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const p = G.spawnPart({ shape: 'block', pos: [x, 40, z], size: [1, 1, 1], rot: [0, 45, 45], color: '#FFE07A', material: 'neon', canCollide: false, tag: 'falling', name: 'Falling star' });
        const gy = Phys.groundAt(x, z, 39, 80); this.falling.push({ id: p.id, x, z, y: 40, floor: (gy === null ? 0 : gy) + 0.8, life: 12 });
      }
      for (const f of [...this.falling]) {
        f.y = Math.max(f.floor, f.y - dt * 7); f.life -= dt;
        if (f.life <= 0) { G.removePart(f.id); this.falling = this.falling.filter(q => q !== f); continue; }
        G.movePart(f.id, [f.x, f.y, f.z], [0, G.time * 120 % 360, 45]);
      }
    }
  },
};
// Free-roam hangouts with things to find. modeOpts: {noun, icon}
Modes.hangout = {
  label: 'Hangout', board: true, boardTitle: 'Found',
  setup(G) {
    this.done = false; const n = G.coinsTotal, o = G.modeOpts;
    G.hud.objective(o.objective || `Explore and find all ${n} ${o.noun || 'hidden things'}`);
    if (n) G.hud.stat('found', `0 / ${n}`, { icon: o.icon || 'star', label: 'Found' });
  },
  onCoin(p, G) {
    G.hud.stat('found', `${G.score} / ${G.coinsTotal}`, { icon: G.modeOpts.icon || 'star' });
    if (G.score >= G.coinsTotal && !this.done) { this.done = true; G.hud.flash(`You found every ${G.modeOpts.single || 'one'}!`, 'good', 2600); Sfx.play('win'); }
  },
};
// Climb before the lava (or water) catches you. modeOpts: {fluid: 'lava'|'water', speed, accel, start}
Modes.rise = {
  label: 'Rise', hp: false,
  setup(G) {
    const o = G.modeOpts, lava = o.fluid !== 'water';
    this.level = o.start || -3; this.speed = o.speed || 0.35;
    this.fluid = G.spawnPart({ shape: 'block', pos: [0, this.level - 30, 0], size: [400, 60, 400], color: lava ? '#FF5A1F' : '#2E86D8', material: lava ? 'neon' : 'ice', canCollide: false, transparency: lava ? 0 : 0.35, name: lava ? 'Lava' : 'Flood water' });
    this.top = World.parts.filter(p => p.behavior === 'finish').reduce((m, p) => Math.max(m, p.pos[1]), 0);
    G.hud.objective(lava ? 'Climb! The lava is rising' : 'Climb! The water is rising');
    G.hud.stat('height', '0 m', { icon: 'star', label: 'Height' });
    G.hud.stat('time', fmtTime(0), { icon: 'clock', label: 'Time' });
    if (!lava) G.usesHp = true, G.hud.hp(G.hp, G.maxHp);
    this.best = 0;
  },
  update(dt, G) {
    if (G.ended) return;
    const o = G.modeOpts, lava = o.fluid !== 'water';
    if (G.time > (o.delay || 4)) { this.speed += (o.accel || 0.006) * dt; this.level = Math.min(this.top - 1.5, this.level + this.speed * dt); }
    G.movePart(this.fluid.id, [0, this.level - 30, 0]);
    const y = G.body.pos.y; this.best = Math.max(this.best, y);
    G.hud.stat('height', Math.max(0, Math.round(y)) + ' m', { icon: 'star' }); G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
    if (!G.dead) {
      if (lava && y < this.level - 0.2) G.kill('hazard');
      else if (!lava && y + 1.2 < this.level) G.damage(22 * dt, 'hazard', true);
    }
  },
  onDeath(G) {
    G.end({ win: false, title: G.modeOpts.fluid === 'water' ? 'Swept away!' : 'Caught by the lava!', stats: [['Highest', Math.round(this.best) + ' m'], ['Time', fmtTime(G.time)]] });
    return true;
  },
  onFinish(p, G) { G.end({ win: true, title: 'You reached the top!', stats: [['Time', fmtTime(G.time)]] }); saveBest(G.def.id, G.time); return true; },
};
// Dodge meteors for the whole round. modeOpts: {time, every}
Modes.meteors = {
  label: 'Meteors', hp: true,
  setup(G) {
    this.m = []; this.t = 2; this.hits = 0;
    G.hud.objective(`Survive ${G.modeOpts.time || 90} seconds of meteors`);
    G.hud.stat('time', fmtClock(G.modeOpts.time || 90), { icon: 'clock', label: 'Time left' });
  },
  update(dt, G) {
    if (G.ended) return;
    const total = G.modeOpts.time || 90, left = total - G.time;
    G.hud.stat('time', fmtClock(left), { icon: 'clock', warn: left < 10 });
    if (left <= 0) { G.end({ win: true, title: 'You survived the storm!', stats: [['Time', fmtClock(total)], ['Hits taken', this.hits]] }); return; }
    const every = Math.max(0.35, (G.modeOpts.every || 1.2) - G.time * 0.008);
    if ((this.t -= dt) <= 0) {
      this.t = every;
      const near = G.R() < 0.55, b = G.body.pos, x = near ? b.x + (G.R() - 0.5) * 10 : (G.R() - 0.5) * 50, z = near ? b.z + (G.R() - 0.5) * 10 : (G.R() - 0.5) * 50;
      const gy = Phys.groundAt(x, z, 60, 100); if (gy !== null) {
        const mark = G.spawnPart({ shape: 'cylinder', pos: [x, gy + 0.05, z], size: [5, 0.06, 5], color: '#FF3B1F', material: 'neon', canCollide: false, transparency: 0.45, name: 'Impact marker' });
        const rock = G.spawnPart({ shape: 'sphere', pos: [x, 55, z], size: [2.4, 2.4, 2.4], color: '#5A3420', material: 'stone', canCollide: false, name: 'Meteor' });
        this.m.push({ mark: mark.id, rock: rock.id, x, z, gy, y: 55, delay: 1.1 });
      }
    }
    for (const m of [...this.m]) {
      if (m.delay > 0) { m.delay -= dt; continue; }
      m.y -= dt * 60; G.movePart(m.rock, [m.x, Math.max(m.gy + 1, m.y), m.z]);
      if (m.y <= m.gy + 1) {
        G.fx.burst({ x: m.x, y: m.gy + 1, z: m.z }, '#FF6A2B', 18, 9); G.fx.ring({ x: m.x, y: m.gy, z: m.z }, '#FFC53A', 3); Sfx.play('break');
        if (!G.dead && Math.hypot(G.body.pos.x - m.x, G.body.pos.z - m.z) < 2.8 && Math.abs(G.body.pos.y - m.gy) < 3) { G.damage(45, 'meteor'); this.hits++; G.body.vel.y = 12; G.body.grounded = false; }
        G.removePart(m.rock); G.removePart(m.mark); this.m = this.m.filter(q => q !== m);
      }
    }
  },
  onDeath(G) { G.end({ win: false, title: 'Flattened by a meteor!', stats: [['Survived', fmtClock(G.time)], ['Hits taken', this.hits]] }); return true; },
};
// Shared helpers for last-one-standing floor games with bots.
export const FloorBots = {
  add(G, n, R) {
    const names = ['Bolt', 'Mabel', 'Ziggy', 'Nova'], spots = G.partsByTag('tile').filter(p => p.pos[1] > (this.topY(G) - 0.5));
    return names.slice(0, n).map((nm, i) => { const t = spots[Math.floor(R() * spots.length)]; const b = G.bots.add({ name: nm, pos: [t.pos[0], t.pos[1] + 1, t.pos[2]], speed: 0.8 + R() * 0.15, seed: nm }); b.data = { wander: 0 }; return b; });
  },
  topY(G) { return G.partsByTag('tile').reduce((m, p) => Math.max(m, p.pos[1]), -Infinity); },
};
// Tiles vanish shortly after anyone steps on them. Last one on the board wins.
Modes.blockdrop = {
  label: 'Block Drop',
  setup(G) {
    this.drop = new Map(); this.out = 0; this.place = 0;
    this.bots = FloorBots.add(G, 3, G.R);
    G.hud.objective('Keep moving: tiles fall after you step on them. Be the last one up!');
    G.hud.stat('left', '4 players', { icon: 'users', label: 'Players left' });
    this.grace = 3; G.hud.flash('Ready…', 'info', 1500);
  },
  mark(id, G) { if (this.grace <= 0 && !this.drop.has(id)) this.drop.set(id, 0.55); },
  onTouch(p, G) { if (p.tag === 'tile') { this.mark(p.id, G); return true; } },
  update(dt, G) {
    if (G.ended) return;
    if (this.grace > 0 && (this.grace -= dt) <= 0) G.hud.flash('Go!', 'good', 800);
    for (const b of this.bots) {
      if (!b.alive) continue;
      const g = b.body.groundC; if (g && g.part.tag === 'tile') this.mark(g.part.id, G);
      if ((b.data.wander -= dt) <= 0) {
        b.data.wander = 0.6 + G.R() * 0.8;
        const live = G.partsByTag('tile').filter(t => Math.abs(t.pos[1] - (b.pos.y - 0.25)) < 1.5 && !this.drop.has(t.id) && Phys.collider(t.id) && Phys.collider(t.id).enabled);
        const t = live.length ? pick(G.R, live.filter(q => Math.hypot(q.pos[0] - b.pos.x, q.pos[2] - b.pos.z) < 9).concat(live).slice(0, 12)) : null;
        if (t) b.data.target = t; else b.data.target = null;
      }
      if (b.data.target) b.goTo(b.data.target.pos[0], b.data.target.pos[2], 0.3); else b.stop();
    }
    for (const [id, t] of [...this.drop]) {
      const nt = t - dt; const m = G.mesh(id);
      if (m) m.visible = nt > 0 ? Math.floor(nt * 16) % 2 === 0 : false;
      if (nt <= 0) { G.setPartSolid(id, false); this.drop.set(id, Infinity); } else if (t !== Infinity) this.drop.set(id, nt);
    }
    const alive = this.bots.filter(b => b.alive).length + (G.dead ? 0 : 1);
    G.hud.stat('left', alive + (alive === 1 ? ' player' : ' players'), { icon: 'users' });
    if (!G.dead && this.bots.every(b => !b.alive)) G.end({ win: true, title: 'Last one standing!', stats: [['Time', fmtTime(G.time)]] });
  },
  onBotDown(bot, why, G) { Sfx.play('pop'); G.hud.flash(bot.name + ' fell!', 'info', 900); },
  onDeath(G) {
    const left = this.bots.filter(b => b.alive).length;
    G.end({ win: false, title: 'You fell!', sub: left ? `You finished ${['1st', '2nd', '3rd', '4th'][left] || ''}.` : '', stats: [['Time', fmtTime(G.time)]] }); return true;
  },
};
// A color is called; every other tile drops away for a moment. Rounds speed up.
Modes.colorblock = {
  label: 'Color Block',
  COLORS: [['Red', '#FF3B3B'], ['Orange', '#FF9A2B'], ['Yellow', '#FFE02B'], ['Green', '#3FD07A'], ['Blue', '#2D9CF0'], ['Purple', '#9A5BFF']],
  setup(G) {
    this.round = 0; this.phase = 'paint'; this.t = 3; this.bots = FloorBots.add(G, 3, G.R);
    this.tiles = G.partsByTag('tile'); this.paint(G);
    G.hud.objective('Stand on the called color before the floor drops');
    G.hud.stat('round', 'Round 1', { icon: 'flag', label: 'Round' });
  },
  paint(G) { for (const t of this.tiles) { const c = pick(G.R, this.COLORS); t.data = c; G.setPartColor(t.id, c[1]); G.setPartVisible(t.id, true); G.setPartSolid(t.id, true); } },
  update(dt, G) {
    if (G.ended) return;
    this.t -= dt;
    if (this.phase === 'paint' && this.t <= 0) {
      this.round++; this.call = pick(G.R, this.COLORS); this.phase = 'call'; this.t = Math.max(1.4, 4.2 - this.round * 0.25);
      G.hud.stat('round', 'Round ' + this.round, { icon: 'flag' }); G.hud.flash(this.call[0] + '!', 'info', 1300); G.hud.prompt('Get to ' + this.call[0].toLowerCase()); Sfx.play('alarm');
      for (const b of this.bots) {
        if (!b.alive) continue; let best = null, bd = 1e9;
        for (const t of this.tiles) if (t.data === this.call) { const d = Math.hypot(t.pos[0] - b.pos.x, t.pos[2] - b.pos.z) + G.R() * 3; if (d < bd) { bd = d; best = t; } }
        b.data.target = G.R() < 0.88 + this.round * 0 ? best : pick(G.R, this.tiles);
      }
    } else if (this.phase === 'call' && this.t <= 0) {
      this.phase = 'drop'; this.t = 2.4; G.hud.prompt(null); Sfx.play('break');
      for (const t of this.tiles) if (t.data !== this.call) { G.setPartVisible(t.id, false); G.setPartSolid(t.id, false); }
    } else if (this.phase === 'drop' && this.t <= 0) {
      this.phase = 'paint'; this.t = 1.6; this.paint(G);
      if (this.round >= (G.modeOpts.rounds || 15) && !G.dead) G.end({ win: true, title: 'You survived every round!', stats: [['Rounds', this.round]] });
    }
    for (const b of this.bots) { if (!b.alive) continue; if (b.data.target) b.goTo(b.data.target.pos[0], b.data.target.pos[2], 0.4); else b.stop(); }
    if (!G.dead && this.round > 0 && this.bots.every(b => !b.alive)) G.end({ win: true, title: 'Last one standing!', stats: [['Rounds', this.round]] });
  },
  onDeath(G) { G.end({ win: false, title: 'You fell!', stats: [['Rounds survived', Math.max(0, this.round - 1)]] }); return true; },
};
// Paired glass panels: one of each pair breaks. Remember which.
Modes.glassbridge = {
  label: 'Glass Steps',
  setup(G) {
    const rows = {}; for (const p of G.partsByTag('glass')) (rows[p.bp.row] = rows[p.bp.row] || []).push(p);
    this.rows = Object.keys(rows).length;
    for (const k of Object.keys(rows)) { const pair = rows[k], fake = pair[G.R() < 0.5 ? 0 : 1]; fake.behavior = 'fake'; fake.bp = Object.assign({}, fake.bp, { back: 2 }); }
    this.best = 0;
    G.hud.objective('Cross the bridge. One panel in each pair breaks!');
    G.hud.stat('row', `0 / ${this.rows}`, { icon: 'flag', label: 'Row' }); G.hud.stat('falls', '0', { icon: 'skull', label: 'Falls' });
  },
  onTouch(p, G) {
    if (p.tag !== 'glass') return;
    if (p.behavior === 'fake') { const pair = G.partsByTag('glass').find(q => q.bp.row === p.bp.row && q !== p); if (pair) G.setPartColor(pair.id, '#9BF2C4'); }
    else { this.best = Math.max(this.best, p.bp.row + 1); G.hud.stat('row', `${this.best} / ${this.rows}`, { icon: 'flag' }); }
  },
  update(dt, G) { G.hud.stat('falls', String(G.deaths), { icon: 'skull' }); },
};
// Find the keys, then the exit. modeOpts: {keys}
Modes.maze = {
  label: 'Maze', hint: 'WASD to move · Space to jump · H shows the way for a few seconds',
  setup(G) {
    this.need = G.partsByTag('key').length; this.got = 0; this.hintT = 0; this.cool = 0;
    G.hud.objective(this.need ? `Find ${this.need} keys, then the exit` : 'Find the exit');
    if (this.need) G.hud.stat('keys', `0 / ${this.need}`, { icon: 'key', label: 'Keys' });
    G.hud.stat('time', fmtTime(0), { icon: 'clock', label: 'Time' });
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12), new THREE.MeshBasicMaterial({ color: '#FFE07A', transparent: true, opacity: 0.9, depthTest: false }));
    this.arrow.rotation.order = 'YXZ'; this.arrow.renderOrder = 15; this.arrow.visible = false; World.scene.add(this.arrow);
    G.addAction({ id: 'hint', label: 'Hint', icon: 'star', key: 'KeyH', keyLabel: 'H', onDown: () => this.showHint(G) });
  },
  showHint(G) {
    if (this.cool > 0) { G.hud.flash(`Hint ready in ${Math.ceil(this.cool)}s`, 'info', 900); return; }
    this.hintT = 6; this.cool = 20; Sfx.play('pick');
  },
  target(G) {
    const left = G.partsByTag('key').filter(p => { const m = G.mesh(p.id); return m && m.visible; });
    const pool = left.length ? left : World.parts.filter(p => p.behavior === 'finish');
    let best = null, bd = 1e9; for (const p of pool) { const d = Math.hypot(p.pos[0] - G.body.pos.x, p.pos[2] - G.body.pos.z); if (d < bd) { bd = d; best = p; } }
    return best;
  },
  onTouch(p, G) {
    if (p.tag === 'key') {
      const m = G.mesh(p.id); if (!m || !m.visible) return true;
      G.setPartVisible(p.id, false); G.setPartSolid(p.id, false); this.got++; Sfx.play('checkpoint'); G.fx.burst(m.position, '#FFE07A', 12, 5);
      G.hud.stat('keys', `${this.got} / ${this.need}`, { icon: 'key' });
      if (this.got >= this.need) { for (const d of G.partsByTag('door')) { G.setPartVisible(d.id, false); G.setPartSolid(d.id, false); } G.hud.flash('The exit is open!', 'good', 1800); }
      else G.hud.flash('Key found!', 'good', 900);
      return true;
    }
  },
  onFinish(p, G) {
    if (this.got < this.need) { G.finished = false; G.hud.flash('You still need keys', 'bad', 1200); return true; }
    const best = saveBest(G.def.id, G.time);
    G.end({ win: true, title: 'You escaped the maze!', sub: best.isNew ? 'New personal best!' : `Your best: ${fmtTime(best.best)}`, stats: [['Time', fmtTime(G.time)]] }); return true;
  },
  update(dt, G) {
    G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
    this.cool = Math.max(0, this.cool - dt);
    if (this.hintT > 0) {
      this.hintT -= dt; const t = this.target(G), b = G.body.pos;
      if (t) { this.arrow.visible = true; this.arrow.position.set(b.x, G.visY + 3.3, b.z); this.arrow.rotation.set(-Math.PI / 2, Math.atan2(t.pos[0] - b.x, t.pos[2] - b.z) + Math.PI, 0); }
    } else this.arrow.visible = false;
  },
  teardown() { if (this.arrow) { this.arrow.geometry.dispose(); this.arrow.material.dispose(); this.arrow = null; } },
};
// Find hidden chests with a warmer/colder hint. modeOpts: {time}
Modes.treasure = {
  label: 'Treasure', board: true, boardTitle: 'Chests',
  setup(G) {
    this.total = G.partsByTag('chest').length; this.opened = new Set();
    G.hud.objective(`Find all ${this.total} treasure chests`);
    G.hud.stat('chests', `0 / ${this.total}`, { icon: 'gem', label: 'Chests' });
    G.hud.stat('hint', 'Cold', { icon: 'target', label: 'Hint' });
    if (G.modeOpts.time) G.hud.stat('time', fmtClock(G.modeOpts.time), { icon: 'clock', label: 'Time left' });
    G.addAction({ id: 'open', label: 'Open', icon: 'hand', key: 'KeyE', keyLabel: 'E', primary: true, onDown: () => this.open(G) });
  },
  near(G) { return G.near('chest', 2.2).find(n => !this.opened.has(n.part.id)); },
  open(G) {
    const n = this.near(G); if (!n) { G.hud.flash('No chest here', 'info', 700); return; }
    this.opened.add(n.part.id); G.setPartColor(n.part.id, '#FFE07A'); G.addScore(1); Sfx.play('win');
    const m = G.mesh(n.part.id); G.fx.burst(m.position, '#FFE07A', 20, 6); G.fx.text({ x: m.position.x, y: m.position.y + 1.5, z: m.position.z }, 'Treasure!', '#FFE07A');
    G.hud.stat('chests', `${this.opened.size} / ${this.total}`, { icon: 'gem' });
    if (this.opened.size >= this.total) G.end({ win: true, title: 'You found every chest!', stats: [['Time', fmtTime(G.time)]] });
  },
  update(dt, G) {
    if (G.ended) return;
    if (G.modeOpts.time) { const left = G.modeOpts.time - G.time; G.hud.stat('time', fmtClock(left), { icon: 'clock', warn: left < 15 }); if (left <= 0) G.end({ win: false, title: "Time's up!", stats: [['Chests', `${this.opened.size} / ${this.total}`]] }); }
    let d = 1e9; for (const p of G.partsByTag('chest')) if (!this.opened.has(p.id)) d = Math.min(d, Math.hypot(p.pos[0] - G.body.pos.x, p.pos[2] - G.body.pos.z));
    const word = d < 6 ? 'Burning hot' : d < 14 ? 'Hot' : d < 26 ? 'Warm' : d < 45 ? 'Cool' : 'Cold';
    G.hud.stat('hint', word, { icon: 'target', warn: d < 6 });
    G.hud.prompt(this.near(G) ? (IS_TOUCH ? 'Tap Open' : 'Press E to open') : null);
  },
};

// ---- Levels ----
export function partyCollectLevel(style) {
  return R => {
    const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit, S = style;
    P('block', [0, -1, 0], [130, 2, 130], S.ground, S.groundMat, { name: 'Ground' });
    const spawn = K.spawn(P, 0, 0, 0);
    for (let i = 0; i < S.hills; i++) { const x = (R() - 0.5) * 100, z = (R() - 0.5) * 100; if (Math.hypot(x, z) < 12) continue; const h = 2 + R() * 6, w = 8 + R() * 10, d = w * (0.6 + R() * 0.6); P('block', [x, h / 2, z], [w, h, d], pick(R, S.blocks), S.blockMat, { name: 'Hill' }); P('wedge', [x, h / 2, z + d / 2 + 4 - 0.05], [4, h, 8], pick(R, S.blocks), S.blockMat, { name: 'Ramp' }); K.item(parts, S.item, [x, h + 1.2, z]); }
    for (let i = 0; i < S.trees; i++) { const x = (R() - 0.5) * 115, z = (R() - 0.5) * 115; if (Math.hypot(x, z) < 10) continue; K.tree(P, R, x, z, S.tree); }
    for (let i = 0; i < S.items; i++) { const a = R() * Math.PI * 2, r = 6 + R() * 55; K.item(parts, S.item, [Math.cos(a) * r, 1.2, Math.sin(a) * r]); }
    if (S.extra) S.extra(P, R, parts);
    return { parts, spawn, spawnYaw: Math.PI };
  };
}
export function partyCavernLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -1, 0], [90, 2, 90], '#4A4F58', 'stone', { name: 'Cave floor' });
  P('block', [0, 17, 0], [90, 2, 90], '#2E3238', 'stone', { name: 'Cave ceiling' });
  for (const [x, z, w, d] of [[0, 45, 92, 2], [0, -45, 92, 2], [45, 0, 2, 92], [-45, 0, 2, 92]]) P('block', [x, 8, z], [w, 18, d], '#3A3F47', 'stone', { name: 'Cave wall' });
  const spawn = K.spawn(P, 0, 0, 0);
  for (let i = 0; i < 16; i++) { const x = (R() - 0.5) * 76, z = (R() - 0.5) * 76; if (Math.hypot(x, z) < 8) continue; const h = 3 + R() * 9, w = 4 + R() * 6; P('block', [x, h / 2, z], [w, h, w], '#5A606A', 'stone', { name: 'Ledge' }); P('wedge', [x, h / 2, z + w / 2 + 3 - 0.05], [3, h, 6], '#5A606A', 'stone', { name: 'Ramp' }); K.item(parts, 'gem', [x, h + 1, z], { color: pick(R, ['#4CF0FF', '#FF5CA8', '#7CFF6B', '#C9A8FF']) }); }
  for (let i = 0; i < 22; i++) { const x = (R() - 0.5) * 84, z = (R() - 0.5) * 84; P('cylinder', [x, 14.5, z], [0.8 + R(), 3 + R() * 3, 0.8 + R()], '#2E3238', 'stone', { name: 'Stalactite', canCollide: false }); }
  for (let i = 0; i < 14; i++) { const x = (R() - 0.5) * 80, z = (R() - 0.5) * 80; P('block', [x, 0.8, z], [0.7, 1.6 + R(), 0.7], pick(R, ['#4CF0FF', '#C9A8FF', '#7CFF6B']), 'neon', { name: 'Glow crystal', rot: [R() * 30, R() * 90, R() * 30] }); }
  for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, r = 8 + R() * 30; K.item(parts, 'gem', [Math.cos(a) * r, 1.2, Math.sin(a) * r]); }
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyTreasureLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -3, 0], [300, 2, 300], '#2A86C8', 'ice', { name: 'Sea', canCollide: false, transparency: 0.15 });
  P('cylinder', [0, -1, 0], [130, 2.2, 110], '#E6D3A3', 'sand', { name: 'Island' });
  P('cylinder', [10, 1, -8], [60, 2, 48], '#7FBF6A', 'grass', { name: 'Meadow' });
  P('cylinder', [-18, 4, 14], [26, 6, 22], '#7FBF6A', 'grass', { name: 'Hill' });
  P('wedge', [-18, 4, 29.5], [6, 6, 10], '#7FBF6A', 'grass', { name: 'Hill ramp' });
  const spawn = K.spawn(P, 30, 0, 30);
  for (let i = 0; i < 22; i++) { const a = R() * Math.PI * 2, r = 40 + R() * 16; K.tree(P, R, Math.cos(a) * r, Math.sin(a) * r * 0.8, 'palm'); }
  for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, r = R() * 50; K.rock(P, R, Math.cos(a) * r, Math.sin(a) * r * 0.8, 1.5 + R() * 3); }
  for (let i = 0; i < 16; i++) { const x = (R() - 0.5) * 70, z = (R() - 0.5) * 60; P('sphere', [x, 2.6, z], [3.4, 2.6, 3.4], '#3F9E57', 'grass', { name: 'Bush', canCollide: false }); }
  P('block', [50, -0.2, -30], [4, 0.6, 26], '#8A5A35', 'wood', { name: 'Pier' });
  P('block', [-30, 1.5, -25], [8, 5, 8], '#8A939E', 'stone', { name: 'Old hut' });
  const spots = [[-18, 7.3, 14], [12, 2.3, -14], [-30, 4.3, -25], [48, 0.4, -40], [-40, 0.3, 22], [26, 2.3, 4]];
  spots.forEach(([x, y, z], i) => { P('block', [x, y - 0.3, z], [1.6, 1.1, 1.1], '#8A5A35', 'wood', { name: 'Chest ' + (i + 1), tag: 'chest' }); });
  return { parts, spawn, spawnYaw: Math.PI * 1.25 };
}
export function partyRiseLevel(style) {
  return R => {
    const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit, S = style;
    P('block', [0, -1, 0], [80, 2, 80], S.ground, S.groundMat, { name: 'Ground' });
    const spawn = K.spawn(P, 0, 0, 14);
    P('cylinder', [0, S.top / 2, 0], [8, S.top, 8], S.pillar, 'stone', { name: 'Center pillar' });
    let y = 1.2, a = 0;
    for (let i = 0; y < S.top; i++) {
      a += 0.42 + R() * 0.13; y += 0.8 + R() * 0.4; const r = 9 + R() * 1.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const k = R(); const col = pick(R, S.blocks);
      if (k < 0.12) P('block', [x, y - 0.3, z], [3, 0.6, 3], '#FFC53A', 'plastic', { name: 'Moving step', behavior: 'move', bp: { offset: [Math.cos(a) * 3, 0, Math.sin(a) * 3], period: 3, phase: R() } });
      else P('block', [x, y - 0.3, z], [3.4, 0.6, 3.4], col, S.mat, { name: 'Step', rot: [0, -a * 57.3, 0] });
      if (i % 9 === 8) K.item(parts, 'star', [x, y + 1, z]);
    }
    P('cylinder', [0, S.top + 0.5, 0], [10, 1, 10], '#FFFFFF', 'plastic', { name: 'Summit', behavior: 'finish' });
    for (let i = 0; i < 10; i++) { const x = (R() - 0.5) * 70, z = (R() - 0.5) * 70; if (Math.hypot(x, z) < 16) continue; const h = 2 + R() * 10; P('block', [x, h / 2, z], [4, h, 4], pick(R, S.blocks), S.mat, { name: 'Tower' }); }
    return { parts, spawn, spawnYaw: Math.PI };
  };
}
export function partyArenaLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('cylinder', [0, -1, 0], [70, 2, 70], '#B98F5A', 'sand', { name: 'Plateau' });
  P('block', [0, -12, 0], [300, 2, 300], '#5A3420', 'stone', { name: 'Canyon floor' });
  const spawn = K.spawn(P, 0, 0, 0);
  for (let i = 0; i < 14; i++) { const a = R() * Math.PI * 2, r = 8 + R() * 22; K.rock(P, R, Math.cos(a) * r, Math.sin(a) * r, 2 + R() * 2.5, 0, '#9C6B45'); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P('block', [Math.cos(a) * 36, 4, Math.sin(a) * 36], [5, 10 + R() * 8, 5], '#8A5A35', 'stone', { name: 'Mesa' }); }
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyTileLevel(layers, n, size, style) {
  return R => {
    const parts = [], P = (...a) => parts.push(mkPart(...a)), S = style;
    const half = (n * size) / 2;
    layers.forEach((y, li) => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P('block', [-half + size * (i + 0.5), y, -half + size * (j + 0.5)], [size - 0.06, 0.6, size - 0.06], S.tiles[(i + j + li) % S.tiles.length], 'plastic', { name: 'Tile', tag: 'tile' });
    });
    P('block', [0, Math.min(...layers) - 14, 0], [200, 2, 200], S.under, S.underMat || 'neon', { name: S.underName || 'Void', behavior: 'kill' });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P('cylinder', [Math.cos(a) * (half + 10), layers[0] - 6, Math.sin(a) * (half + 10)], [3, 30, 3], S.post, 'metal', { name: 'Post' }); P('sphere', [Math.cos(a) * (half + 10), layers[0] + 9.5, Math.sin(a) * (half + 10)], [3, 3, 3], S.light, 'neon', { name: 'Lamp', canCollide: false }); }
    return { parts, spawn: [0, layers[0] + 0.35, 0], spawnYaw: Math.PI };
  };
}
export function partyGlassLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), rows = 16, y = 12;
  P('block', [0, y - 0.5, 6], [12, 1, 10], '#9AA5B1', 'metal', { name: 'Start' });
  P('spawn', [0, y + 0.2, 8], [4, 0.4, 4], '#FF6A2B', 'plastic', { name: 'Spawn' });
  let z = 0;
  for (let r = 0; r < rows; r++) {
    z -= 2.2 + (r ? 1.4 : 0);
    if (r === 8) { P('block', [0, y - 0.5, z - 1], [10, 1, 5], '#2D62F0', 'plastic', { name: 'Halfway', behavior: 'checkpoint' }); z -= 4.5; }
    for (const sx of [-1.9, 1.9]) P('block', [sx, y - 0.15, z], [2.6, 0.3, 2.6], '#CFEFFF', 'ice', { name: 'Glass panel', transparency: 0.3, tag: 'glass', bp: { row: r } });
    P('block', [0, y - 0.15, z], [0.4, 0.3, 2.4], '#4E5B74', 'metal', { name: 'Rail', canCollide: false });
  }
  P('block', [0, y - 0.5, z - 6], [12, 1, 8], '#FFFFFF', 'plastic', { name: 'Finish', behavior: 'finish' });
  for (const sx of [-6.5, 6.5]) P('block', [sx, y - 1, (z - 10) / 2], [0.6, 0.6, Math.abs(z) + 22], '#4E5B74', 'metal', { name: 'Side beam', canCollide: false });
  P('block', [0, -4, z / 2], [140, 2, 140], '#1B2338', 'plastic', { name: 'Pit floor', behavior: 'kill' });
  return { parts, spawn: [0, y + 0.45, 8], spawnYaw: Math.PI };
}
export function partyMazeLevel(style) {
  return R => {
    const parts = [], P = (...a) => parts.push(mkPart(...a)), S = style, N = 11, C = 6.5;
    const walls = []; for (let i = 0; i < N; i++) { walls.push([]); for (let j = 0; j < N; j++) walls[i].push({ e: true, s: true, seen: false }); }
    const stack = [[0, 0]]; walls[0][0].seen = true;
    while (stack.length) {
      const [i, j] = stack[stack.length - 1], nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [i + a, j + b]).filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !walls[a][b].seen);
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = nb[Math.floor(R() * nb.length)];
      if (a > i) walls[i][j].e = false; else if (a < i) walls[a][b].e = false; else if (b > j) walls[i][j].s = false; else walls[a][b].s = false;
      walls[a][b].seen = true; stack.push([a, b]);
    }
    const half = (N * C) / 2, X = i => -half + C * (i + 0.5), H = S.h;
    P('block', [0, -1, 0], [N * C + 30, 2, N * C + 30], S.ground, S.groundMat, { name: 'Ground' });
    P('block', [0, H / 2, -half], [N * C + 0.8, H, 0.8], S.wall, S.wallMat, { name: 'Outer wall', transparency: S.t || 0 });
    P('block', [-half, H / 2, 0], [0.8, H, N * C + 0.8], S.wall, S.wallMat, { name: 'Outer wall', transparency: S.t || 0 });
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const w = walls[i][j];
      if (w.e && !(i === N - 1 && j === N - 1)) P('block', [X(i) + C / 2, H / 2, X(j)], [0.8, H, C + 0.8], S.wall, S.wallMat, { name: 'Wall', transparency: S.t || 0 });
      if (w.s) P('block', [X(i), H / 2, X(j) + C / 2], [C + 0.8, H, 0.8], S.wall, S.wallMat, { name: 'Wall', transparency: S.t || 0 });
    }
    // Exit through the east wall of the last cell, behind a door
    const ex = X(N - 1) + C / 2 + 4, ez = X(N - 1);
    P('block', [X(N - 1) + C / 2, H / 2, ez], [0.8, H, C - 0.2], '#FFC53A', 'neon', { name: 'Exit door', tag: 'door', transparency: 0.25 });
    P('block', [ex, 0.15, ez], [6, 0.3, 6], '#FFFFFF', 'plastic', { name: 'Exit', behavior: 'finish' });
    const cells = PartyKit.grid(N, N).filter(([i, j]) => i + j > 4 && !(i === N - 1 && j === N - 1));
    for (let k = 0; k < 3; k++) { const [i, j] = cells.splice(Math.floor(R() * cells.length), 1)[0]; P('block', [X(i), 1.3, X(j)], [0.5, 1.2, 0.25], '#FFE07A', 'neon', { name: 'Key', tag: 'key', canCollide: false, rot: [0, 45, 0] }); }
    if (S.lights) for (let k = 0; k < 20; k++) { const [i, j] = pick(R, PartyKit.grid(N, N)); P('cylinder', [X(i) + 2, 0.4, X(j) + 2], [0.5, 0.8, 0.5], S.lights, 'neon', { name: 'Glow', canCollide: false }); }
    P('spawn', [X(0), 0.2, X(0)], [3.5, 0.4, 3.5], '#FF6A2B', 'plastic', { name: 'Spawn' });
    return { parts, spawn: [X(0), 0.45, X(0)], spawnYaw: 0 };
  };
}
export function partyTrampolineLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -1, 0], [100, 2, 100], '#6CC38A', 'grass', { name: 'Ground' });
  const spawn = K.spawn(P, 0, 0, 30);
  const cols = ['#FF6A2B', '#2D62F0', '#FFC53A', '#E23E62', '#7A4FD0', '#17A39C'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const x = -25 + i * 10, z = -25 + j * 10; P('cylinder', [x, 0.3, z], [5, 0.6, 5], cols[(i + j) % 6], 'plastic', { name: 'Trampoline', behavior: 'bounce', bp: { power: 22 + ((i * 7 + j * 3) % 4) * 4 } }); P('cylinder', [x, 0.62, z], [4.2, 0.06, 4.2], '#1B2338', 'plastic', { name: 'Mat', canCollide: false }); }
  for (let i = 0; i < 12; i++) { const x = (R() - 0.5) * 56, z = (R() - 0.5) * 56, y = 6 + R() * 10; P('block', [x, y, z], [4, 0.6, 4], pick(R, cols), 'plastic', { name: 'Sky platform' }); K.item(parts, 'star', [x, y + 1.4, z]); }
  for (let i = 0; i < 14; i++) { const x = (R() - 0.5) * 60, z = (R() - 0.5) * 60; K.item(parts, 'star', [x, 4 + R() * 9, z]); }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.tree(P, R, Math.cos(a) * 44, Math.sin(a) * 44); }
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyBeachLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -2.2, 0], [300, 2, 300], '#2E9BD8', 'ice', { name: 'Ocean', canCollide: false, transparency: 0.3 });
  P('block', [0, -5, 0], [300, 2, 300], '#D9C08A', 'sand', { name: 'Seabed' });
  P('block', [0, -1, 40], [160, 2, 90], '#F2DFAE', 'sand', { name: 'Beach' });
  P('wedge', [0, -1.2, -15], [160, 1.6, 20], '#F2DFAE', 'sand', { name: 'Shore', rot: [0, 180, 0] });
  const spawn = K.spawn(P, 0, 0, 60);
  P('block', [30, 0.2, -30], [4, 0.4, 50], '#A06B42', 'wood', { name: 'Pier' });
  for (let k = 0; k < 6; k++) P('cylinder', [32, -1.5, -10 - k * 8], [0.5, 4, 0.5], '#6B4A2E', 'wood', { name: 'Post' });
  P('block', [30, 1.6, -54], [8, 3, 6], '#FF6A2B', 'wood', { name: 'Snack shack' });
  const um = ['#FF6A2B', '#2D62F0', '#FFC53A', '#E23E62', '#17A39C'];
  for (let i = 0; i < 10; i++) { const x = -60 + i * 12 + R() * 4, z = 30 + R() * 30; P('cylinder', [x, 1.5, z], [0.25, 3, 0.25], '#EDEFF2', 'metal', { name: 'Umbrella pole' }); P('cylinder', [x, 3.1, z], [4.5, 0.35, 4.5], um[i % 5], 'plastic', { name: 'Umbrella' }); P('block', [x + 1.5, 0.05, z + 1.5], [1.8, 0.1, 3.4], um[(i + 2) % 5], 'plastic', { name: 'Towel', canCollide: false }); }
  for (let i = 0; i < 14; i++) K.tree(P, R, -70 + i * 11, 78 + R() * 6, 'palm');
  for (let i = 0; i < 6; i++) P('sphere', [-40 + i * 16, 0.6, 15 + R() * 10], [2, 1.6, 2], '#C9875A', 'sand', { name: 'Sandcastle' });
  P('block', [22, 0.6, -50], [6, 0.6, 6], '#FFFFFF', 'plastic', { name: 'Raft' });
  for (let i = 0; i < 12; i++) K.item(parts, 'shell', [(R() - 0.5) * 140, 0.5, 5 + R() * 70]);
  K.item(parts, 'shell', [30, 0.9, -50]); K.item(parts, 'shell', [22, 1.6, -50]);
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyMoonLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -1, 0], [200, 2, 200], '#B5BAC4', 'sand', { name: 'Moon dust' });
  const spawn = K.spawn(P, 0, 0, 10);
  for (let i = 0; i < 12; i++) { const x = (R() - 0.5) * 160, z = (R() - 0.5) * 160; if (Math.hypot(x, z) < 20) continue; const r = 6 + R() * 10; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; P('block', [x + Math.cos(a) * r, 0.5, z + Math.sin(a) * r], [r * 0.7, 1 + R(), 2], '#9EA4AE', 'stone', { name: 'Crater rim', rot: [0, -a * 57.3 + 90, 0] }); } P('cylinder', [x, -0.9, z], [r * 1.6, 0.3, r * 1.6], '#8C929C', 'sand', { name: 'Crater floor', canCollide: false }); K.item(parts, 'crystal', [x, 1, z]); }
  for (const [x, z, s] of [[-20, -18, 14], [8, -30, 10], [26, -12, 12]]) { P('sphere', [x, 0, z], [s, s, s], '#EDEFF2', 'metal', { name: 'Dome', transparency: 0.15 }); P('cylinder', [x, s / 2 + 0.5, z], [1.4, 1, 1.4], '#4CF0FF', 'neon', { name: 'Dome light', canCollide: false }); }
  P('block', [-4, 1, -14], [26, 0.6, 3], '#9AA5B1', 'metal', { name: 'Walkway' });
  P('cylinder', [40, 8, 30], [1, 16, 1], '#9AA5B1', 'metal', { name: 'Antenna' }); P('sphere', [40, 16.5, 30], [4, 1.2, 4], '#EDEFF2', 'metal', { name: 'Dish' });
  P('block', [15, 1, 20], [4, 1.4, 6], '#FFC53A', 'metal', { name: 'Rover' }); for (const [dx, dz] of [[-2.2, -2], [2.2, -2], [-2.2, 2], [2.2, 2]]) P('cylinder', [15 + dx, 0.6, 20 + dz], [1.2, 0.5, 1.2], '#3A3F4A', 'metal', { name: 'Wheel', rot: [0, 0, 90] });
  for (let i = 0; i < 8; i++) { const x = (R() - 0.5) * 120, z = (R() - 0.5) * 120, h = 6 + R() * 12; P('block', [x, h / 2, z], [5, h, 5], '#A3A9B3', 'stone', { name: 'Rock spire' }); K.item(parts, 'crystal', [x, h + 1.2, z]); }
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyVolcanoLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit;
  P('block', [0, -3, 0], [300, 2, 300], '#2A86C8', 'ice', { name: 'Sea', canCollide: false, transparency: 0.15 });
  P('cylinder', [0, -1, 0], [150, 2.2, 150], '#6CC38A', 'grass', { name: 'Island' });
  const RAD = [30, 24, 18, 13, 9];
  RAD.forEach((r, i) => P('cylinder', [0, i * 4 + 2, 0], [r * 2, 4, r * 2], i < 2 ? '#7A6A58' : '#5E4E40', 'stone', { name: 'Volcano' }));
  const y = 20;
  P('cylinder', [0, y - 0.15, 0], [10, 0.4, 10], '#FF5A1F', 'neon', { name: 'Lava lake', behavior: 'kill' });
  for (let i = -1; i < 4; i++) { // ramps from each tier (or the ground) up to the next one
    const a = (i + 1) * 1.3 + 0.4, rTop = RAD[i + 1], cr = rTop + 2.5 - 0.5, base = (i + 1) * 4;
    P('wedge', [Math.cos(a) * cr, base + 2, Math.sin(a) * cr], [4, 4, 5], '#9C8A70', 'stone', { name: 'Path', rot: [0, 90 - a * 57.3, 0] });
    if (i >= 0) PartyKit.item(parts, 'gem', [Math.cos(a + 0.6) * (RAD[i] - 2), base + 1.2, Math.sin(a + 0.6) * (RAD[i] - 2)], { color: '#FF5CA8' });
  }
  P('block', [7.2, y + 0.15, 0], [2.6, 0.3, 2.6], '#8A5A35', 'wood', { name: 'Lookout' });
  const spawn = K.spawn(P, 0, 0, 55);
  for (let i = 0; i < 24; i++) { const a = R() * Math.PI * 2, r = 40 + R() * 30; K.tree(P, R, Math.cos(a) * r, Math.sin(a) * r, R() < 0.5 ? 'palm' : 'round'); }
  for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2, r = 35 + R() * 25; K.item(parts, 'gem', [Math.cos(a) * r, 1.2, Math.sin(a) * r]); }
  K.item(parts, 'gem', [7.2, y + 1.5, 0], { color: '#FFE07A' });
  return { parts, spawn, spawnYaw: Math.PI };
}
export function partyPlazaLevel(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), K = PartyKit, cols = ['#FF6A2B', '#2D62F0', '#FFC53A', '#E23E62', '#7A4FD0', '#17A39C', '#3FA34D'];
  P('block', [0, -1, 0], [140, 2, 140], '#C9CFD8', 'stone', { name: 'Plaza' });
  const spawn = K.spawn(P, 0, 0, 40);
  P('cylinder', [0, 0.6, 0], [14, 1.2, 14], '#9AA5B1', 'stone', { name: 'Fountain' }); P('cylinder', [0, 1.25, 0], [12, 0.2, 12], '#4CF0FF', 'neon', { name: 'Fountain water', canCollide: false }); P('cylinder', [0, 3, 0], [1.4, 4, 1.4], '#EDEFF2', 'stone', { name: 'Fountain spout' });
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2, x = Math.cos(a) * 28, z = Math.sin(a) * 28; let y = 0; for (let s = 0; s < 4; s++) { const sh = pick(R, ['block', 'sphere', 'cylinder']), sz = 4 - s * 0.7; P(sh, [x, y + sz / 2, z], [sz, sz, sz], pick(R, cols), 'plastic', { name: 'Sculpture', rot: [0, R() * 90, 0] }); y += sz; } K.item(parts, 'star', [x, y + 1, z]); }
  // Giant slide: stairs up, a platform, then a long wedge back down
  for (let s = 0; s < 7; s++) P('block', [-45, 0.5 + s * 0.5, 12 - s * 1.2], [4, 1 + s, 1.2], '#FFC53A', 'plastic', { name: 'Slide stairs' });
  P('block', [-45, 6.5, 3], [5, 1, 4], '#FF6A2B', 'plastic', { name: 'Slide top' });
  P('wedge', [-45, 3.5, -10], [4, 7, 22], '#2D62F0', 'plastic', { name: 'Slide', rot: [0, 180, 0] });
  for (const sx of [-2.2, 2.2]) P('block', [-45 + sx, 4.4, -10], [0.4, 1.4, 22], '#2D62F0', 'plastic', { name: 'Slide rail', canCollide: false });
  K.item(parts, 'star', [-45, 8, 3]);
  // Climbing tower
  for (let s = 0; s < 14; s++) { const a = s * 0.9; P('block', [45 + Math.cos(a) * 4, 1 + s * 1.2, -20 + Math.sin(a) * 4], [3, 0.5, 3], cols[s % 7], 'plastic', { name: 'Climb step' }); }
  P('cylinder', [45, 9, -20], [3, 18, 3], '#4E5B74', 'metal', { name: 'Tower' }); K.item(parts, 'star', [45, 19.5, -20]);
  for (let i = 0; i < 10; i++) { const x = (R() - 0.5) * 120, z = (R() - 0.5) * 120; if (Math.hypot(x, z) < 20) continue; P('block', [x, 0.5, z], [4, 0.5, 1.2], '#8A5A35', 'wood', { name: 'Bench' }); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.tree(P, R, Math.cos(a) * 62, Math.sin(a) * 62); }
  for (let i = 0; i < 6; i++) K.item(parts, 'star', [(R() - 0.5) * 110, 1.3, (R() - 0.5) * 110]);
  return { parts, spawn, spawnYaw: Math.PI };
}

registerGames([
  { id: 'coin-craze', title: 'Coin Craze', cat: 'party', mode: 'collect', modeOpts: { target: 30, time: 120, noun: 'coins', icon: 'coin' }, env: { sky: 'day' }, accent: '#FFD24A', icon: 'coin',
    desc: 'Grab 30 gold coins across hills and fields before the two-minute clock runs out.',
    build: partyCollectLevel({ ground: '#6CC38A', groundMat: 'grass', blocks: ['#C08A55', '#9AA5B1', '#B07A50'], blockMat: 'stone', hills: 10, trees: 22, items: 32, item: 'coin', tree: 'round' }) },
  { id: 'gem-caverns', title: 'Gem Caverns', cat: 'party', mode: 'collect', modeOpts: { target: 20, time: 150, noun: 'gems', icon: 'gem' }, env: { sky: 'cave' }, accent: '#4CF0FF', icon: 'gem',
    desc: 'Explore a glowing cave and climb its ledges to find 20 gems before your time is up.', build: partyCavernLevel, thumb: { pos: [30, 12, 30], look: [0, 3, 0] } },
  { id: 'starfall-fields', title: 'Starfall Fields', cat: 'party', mode: 'collect', modeOpts: { target: 25, time: 120, noun: 'stars', icon: 'star', falling: true, fallEvery: 1.1, radius: 36 }, env: { sky: 'sunset' }, accent: '#FFE07A', icon: 'star',
    desc: 'Stars tumble out of the evening sky. Catch 25 before they fade.',
    build: partyCollectLevel({ ground: '#7FBF6A', groundMat: 'grass', blocks: ['#C9B37A'], blockMat: 'grass', hills: 4, trees: 16, items: 0, item: 'star', tree: 'round' }) },
  { id: 'mushroom-meadow', title: 'Mushroom Meadow', cat: 'party', mode: 'collect', modeOpts: { target: 25, time: 120, noun: 'mushrooms', icon: 'star' }, env: { sky: 'forest' }, accent: '#E23E62', icon: 'star',
    desc: 'Pick 25 red mushrooms in a forest of giant toadstools you can climb.',
    build: partyCollectLevel({ ground: '#5FA05A', groundMat: 'grass', blocks: ['#EDEFF2'], blockMat: 'plastic', hills: 0, trees: 26, items: 30, item: 'mushroom', tree: 'pine',
      extra(P, R) { for (let i = 0; i < 9; i++) { const x = (R() - 0.5) * 90, z = (R() - 0.5) * 90; if (Math.hypot(x, z) < 12) continue; const h = 3 + R() * 5; P('cylinder', [x, h / 2, z], [1.6, h, 1.6], '#F4EBD8', 'plastic', { name: 'Toadstool stem' }); P('cylinder', [x, h + 0.5, z], [7, 1, 7], pick(R, ['#E23E62', '#FF6A2B', '#7A4FD0']), 'plastic', { name: 'Toadstool cap' }); P('wedge', [x, h / 2, z + 0.8 + 3 - 0.05], [2.5, h, 6], '#C08A55', 'wood', { name: 'Ramp' }); } } }) },
  { id: 'treasure-isle', title: 'Treasure Isle', cat: 'party', mode: 'treasure', modeOpts: { time: 240 }, env: { sky: 'day' }, accent: '#8A5A35', icon: 'gem',
    desc: 'Six chests are hidden on a tropical island. Follow the hot and cold hints to find them all.', build: partyTreasureLevel, killY: -3 },
  { id: 'rising-lava', title: 'Rising Lava', cat: 'party', mode: 'rise', modeOpts: { fluid: 'lava', speed: 0.32, accel: 0.006, start: -3 }, env: { sky: 'sunset' }, accent: '#FF5A1F', icon: 'fire',
    desc: 'The floor is lava, and it keeps rising. Climb the spiral to the summit before it catches you.',
    build: partyRiseLevel({ ground: '#3E3A44', groundMat: 'stone', blocks: ['#55505C', '#6B6470', '#8A939E'], mat: 'stone', pillar: '#4A4450', top: 52 }), thumb: { pos: [34, 30, 34], look: [0, 22, 0] } },
  { id: 'flood-escape', title: 'Flood Escape', cat: 'party', mode: 'rise', modeOpts: { fluid: 'water', speed: 0.3, accel: 0.005, start: -2 }, env: { sky: 'day' }, accent: '#2E86D8', icon: 'drop',
    desc: 'The water is coming up fast. Stay above it and reach the dry summit. Staying under hurts.',
    build: partyRiseLevel({ ground: '#C9B37A', groundMat: 'sand', blocks: ['#FFC53A', '#FF6A2B', '#2D62F0', '#3FA34D'], mat: 'plastic', pillar: '#9AA5B1', top: 44 }), thumb: { pos: [34, 26, 34], look: [0, 18, 0] } },
  { id: 'meteor-shower', title: 'Meteor Shower', cat: 'party', mode: 'meteors', modeOpts: { time: 90, every: 1.1 }, env: { sky: 'sunset' }, accent: '#FF6A2B', icon: 'fire',
    desc: 'Watch the glowing circles and dodge falling meteors on a desert plateau for 90 seconds.', build: partyArenaLevel, killY: -10 },
  { id: 'block-drop', title: 'Block Drop', cat: 'party', mode: 'blockdrop', env: { sky: 'day' }, accent: '#2D62F0', icon: 'users', killY: -6,
    desc: 'Every tile you touch falls away. Outlast three bots across three layers of floor.',
    build: partyTileLevel([16, 9, 2], 10, 3, { tiles: ['#2D62F0', '#4B7BFF', '#FFFFFF'], under: '#1B2338', underName: 'Pit', post: '#9AA5B1', light: '#FFE07A' }) },
  { id: 'color-block-party', title: 'Color Block Party', cat: 'party', mode: 'colorblock', modeOpts: { rounds: 15 }, env: { sky: 'neon' }, accent: '#9A5BFF', icon: 'users', killY: -2,
    desc: 'A color is called. Stand on it before every other tile drops. Rounds get faster.',
    build: partyTileLevel([8], 12, 3, { tiles: ['#FFFFFF'], under: '#14082E', underName: 'Void', underMat: 'plastic', post: '#4E5B74', light: '#FF5CA8' }) },
  { id: 'glass-steps', title: 'Glass Steps', cat: 'party', mode: 'glassbridge', env: { sky: 'sunset' }, accent: '#CFEFFF', icon: 'flag', killY: -2,
    desc: 'Sixteen rows of glass, two panels each. One panel in every row breaks. Remember the safe ones.', build: partyGlassLevel, thumb: { pos: [18, 20, 8], look: [0, 12, -25] } },
  { id: 'hedge-maze', title: 'Hedge Maze', cat: 'party', mode: 'maze', env: { sky: 'day' }, accent: '#3F9E57', icon: 'key',
    desc: 'Find three golden keys in a hedge maze to open the exit. Use a hint when you are lost.',
    build: partyMazeLevel({ ground: '#B9A57A', groundMat: 'sand', wall: '#3F8F4A', wallMat: 'grass', h: 4 }), thumb: { pos: [30, 40, 30], look: [0, 0, 0] } },
  { id: 'crystal-maze', title: 'Crystal Maze', cat: 'party', mode: 'maze', env: { sky: 'neon' }, accent: '#C9A8FF', icon: 'key',
    desc: 'A maze of glowing glass walls at night. Grab the keys and find the exit.',
    build: partyMazeLevel({ ground: '#1A1030', groundMat: 'metal', wall: '#9A7BFF', wallMat: 'ice', h: 3.6, t: 0.35, lights: '#4CF0FF' }), thumb: { pos: [30, 40, 30], look: [0, 0, 0] } },
  { id: 'trampoline-park', title: 'Trampoline Park', cat: 'party', mode: 'collect', modeOpts: { target: 20, time: 150, noun: 'stars', icon: 'star' }, env: { sky: 'day' }, accent: '#7CFF6B', icon: 'jump',
    desc: 'Bounce from trampoline to trampoline to reach 20 stars floating high above the park.', build: partyTrampolineLevel },
  { id: 'sunny-beach', title: 'Sunny Beach', cat: 'explore', mode: 'hangout', modeOpts: { noun: 'seashells', single: 'shell', icon: 'star' }, env: { sky: 'day' }, accent: '#F2DFAE', icon: 'sun',
    desc: 'Hang out on a sunny beach with a pier, umbrellas and palm trees. Find all the seashells.', build: partyBeachLevel },
  { id: 'moon-base', title: 'Moon Base', cat: 'explore', mode: 'hangout', modeOpts: { noun: 'moon crystals', single: 'crystal', icon: 'gem' }, env: { sky: 'space', gravity: 0.35 }, accent: '#B5BAC4', icon: 'moon',
    desc: 'Bounce around a moon base in low gravity. Explore craters and domes and collect the crystals.', build: partyMoonLevel },
  { id: 'volcano-island', title: 'Volcano Island', cat: 'explore', mode: 'hangout', modeOpts: { noun: 'fire gems', single: 'gem', icon: 'gem' }, env: { sky: 'sunset' }, accent: '#FF5A1F', icon: 'fire', killY: -3,
    desc: 'Climb a volcano to the lookout above its lava lake and search the island for gems.', build: partyVolcanoLevel, thumb: { pos: [70, 40, 70], look: [0, 10, 0] } },
  { id: 'builders-plaza', title: "Builder's Plaza", cat: 'explore', mode: 'hangout', modeOpts: { noun: 'stars', single: 'star', icon: 'star' }, env: { sky: 'day' }, accent: '#FFC53A', icon: 'star',
    desc: 'A colorful plaza with sculptures, a giant slide and a climbing tower. Find the hidden stars.', build: partyPlazaLevel },
]);
