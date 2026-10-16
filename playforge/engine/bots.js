import * as THREE from 'three';
import { Sfx, ctx2d, hashStr, newSkinCanvas, paintSkin, randomOutfit, rng } from './core.js';
import { createAvatar, makeSkinTexture } from './avatar.js';
import { Phys } from './physics.js';
import { World } from './world.js';
import { Fx } from './fx.js';
import { Game, callMode, hitCapsule } from './game.js';
import { STARTER_CANVASES } from './skins.js';

/* ---------- 12b. Bots: computer players and creatures ---------- */
// A bot has its own physics body and avatar. Modes steer it each frame (goTo, face, jump) and the
// runtime steps its physics with the player's. Flying bots ignore physics and glide (ghosts, creatures).
export class Bot {
  constructor(o) {
    this.id = 'b' + (++Bots.seq); this.name = o.name || 'Bot'; this.team = o.team || null; this.data = o.data || {};
    this.maxHp = this.hp = o.hp || 100; this.alive = true; this.speed = o.speed || 1; this.flying = !!o.flying;
    this.canvas = newSkinCanvas();
    if (o.skin instanceof HTMLCanvasElement) ctx2d(this.canvas).drawImage(o.skin, 0, 0);
    else if (Number.isInteger(o.skin) && STARTER_CANVASES[o.skin]) ctx2d(this.canvas).drawImage(STARTER_CANVASES[o.skin], 0, 0);
    else { const seed = hashStr(this.name + (o.seed || '')); paintSkin(this.canvas, o.outfit || randomOutfit(rng(seed)), seed); }
    this.tex = makeSkinTexture(this.canvas); this.avatar = createAvatar(this.tex, this.name);
    if (o.nametag === false) this.avatar.tag.visible = false;
    if (o.scale) this.avatar.root.scale.setScalar(o.scale);
    const p = Array.isArray(o.pos) ? new THREE.Vector3(o.pos[0], o.pos[1], o.pos[2]) : o.pos ? o.pos.clone() : World.spawn.clone();
    this.home = p.clone(); this.body = Phys.createBody(p); this.body.speedMul = this.speed;
    this.yaw = Number(o.yaw) || 0; this.lookYaw = null; this.move = { x: 0, y: 0, z: 0 }; this.jumpReq = false; this.stuck = 0; this.t = Math.random() * 10;
    this.avatar.root.position.copy(p);
    if (World.scene) World.scene.add(this.avatar.root);
  }
  get pos() { return this.body.pos; }
  // Walk toward (x, z); returns true when within stop distance. Flying bots also move toward y if given.
  goTo(x, z, stop = 1.2, y) {
    const b = this.body, dx = x - b.pos.x, dz = z - b.pos.z, dy = this.flying && Number.isFinite(y) ? y - b.pos.y : 0, d = Math.hypot(dx, dz, dy);
    if (d <= stop) { this.stop(); return true; }
    this.move.x = dx / d; this.move.z = dz / d; this.move.y = dy / d; return false;
  }
  stop() { this.move.x = this.move.y = this.move.z = 0; }
  face(x, z) { this.lookYaw = Math.atan2(x - this.body.pos.x, z - this.body.pos.z); }
  dist(p) { return Math.hypot(p.x - this.body.pos.x, p.z - this.body.pos.z); }
  jump() { this.jumpReq = true; }
  say(text) { this.avatar.say(String(text).slice(0, 80)); }
  respawn(p) {
    const at = p ? (Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : p.clone()) : this.home.clone();
    this.body = Phys.createBody(at); this.body.speedMul = this.speed; this.hp = this.maxHp; this.alive = true; this.stuck = 0;
    this.avatar.root.visible = true; this.avatar.root.position.copy(at);
  }
}
export const Bots = {
  list: [], seq: 0,
  add(o = {}) { const b = new Bot(o); this.list.push(b); return b; },
  remove(bot) {
    this.list = this.list.filter(b => b !== bot);
    if (World.scene) World.scene.remove(bot.avatar.root);
    bot.avatar.dispose(); bot.tex.dispose();
  },
  clear() { for (const b of [...this.list]) this.remove(b); },
  alive() { return this.list.filter(b => b.alive); },
  // Physics for every bot, once per fixed step.
  step(dt) {
    for (const bot of this.list) {
      if (!bot.alive) continue;
      const b = bot.body;
      if (bot.flying) {
        const sp = Phys.params.speed * bot.speed;
        b.vel.set(bot.move.x * sp, bot.move.y * sp, bot.move.z * sp); b.pos.addScaledVector(b.vel, dt); b.grounded = true;
        continue;
      }
      const want = Math.hypot(bot.move.x, bot.move.z) > 0.4, hs = Math.hypot(b.vel.x, b.vel.z);
      if (want && b.grounded && hs < 1.2) { bot.stuck += dt; if (bot.stuck > 0.3) { bot.jumpReq = true; bot.stuck = 0; } } else bot.stuck = 0;
      Phys.step(b, dt, bot.move.x, bot.move.z, bot.jumpReq, false); bot.jumpReq = false; b.events.length = 0;
      if (b.pos.y < (Number.isFinite(Game.def && Game.def.killY) ? Game.def.killY : -40)) this.down(bot, 'fall');
    }
  },
  animate(dt) {
    for (const bot of this.list) {
      if (!bot.alive) continue;
      const b = bot.body, hs = Math.hypot(b.vel.x, b.vel.z), av = bot.avatar;
      bot.t += dt;
      const want = bot.lookYaw !== null ? bot.lookYaw : hs > 0.6 ? Math.atan2(b.vel.x, b.vel.z) : bot.yaw;
      let d = want - bot.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); bot.yaw += d * (1 - Math.exp(-12 * dt));
      av.root.position.set(b.pos.x, b.pos.y, b.pos.z); av.root.rotation.y = bot.yaw;
      av.animate(dt, { speed: bot.flying ? 0 : hs / Phys.SPEED, grounded: bot.flying || b.grounded, t: bot.t });
    }
  },
  damage(bot, n, from) {
    if (!bot.alive || !(n > 0)) return;
    bot.hp = Math.max(0, bot.hp - n);
    callMode('onBotHit', bot, n, from, Game);
    if (bot.hp <= 0) this.down(bot, from || 'hit');
  },
  down(bot, why) {
    if (!bot.alive) return;
    bot.alive = false; bot.avatar.root.visible = false; bot.stop();
    const p = bot.body.pos; Fx.burst({ x: p.x, y: p.y + 1, z: p.z }, '#FFC53A', 16, 6); Sfx.play('pop');
    callMode('onBotDown', bot, why, Game);
  },
  // The living bot whose body contains point pt (within r), or null.
  hitTest(pt, r = 0, except) {
    for (const bot of this.list) if (bot.alive && bot !== except && hitCapsule(bot.body.pos, pt, r)) return bot;
    return null;
  },
  nearest(pos, filter) {
    let best = null, bd = Infinity;
    for (const bot of this.list) { if (!bot.alive || (filter && !filter(bot))) continue; const d = bot.dist(pos); if (d < bd) { bd = d; best = bot; } }
    return best;
  },
};
