/* ---------- 12. Game runtime: plays any game definition ---------- */
// A game definition (see GAMES) names a rule set in Modes. The runtime owns the world, the player, built-in
// part behaviors (kill, checkpoint, finish, coin, bounce, speed, vanish, fake, teleport, damage), the HUD and
// the camera; the mode adds the game's own rules through the hooks documented in Modes.free below.
const Modes = {};
const GAMES = [];
const GAME_ID_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;
function registerGames(list) {
  for (const d of list) {
    if (!d || !GAME_ID_RE.test(d.id) || GAMES.some(g => g.id === d.id)) { console.warn('PlayForge: skipped game', d && d.id); continue; }
    GAMES.push(Object.assign({ creator: 'PlayForge', builtin: true, cat: 'explore', env: { sky: 'day' }, mode: 'free', modeOpts: {} }, d));
  }
}
function gameById(id) { return GAMES.find(g => g.id === id) || null; }
function callMode(name, ...args) {
  const m = Game.mode; if (!m || typeof m[name] !== 'function') return undefined;
  try { return m[name](...args); } catch (e) { console.error('PlayForge: mode error in ' + name, e); return undefined; }
}
// Personal bests on this device. lower = true for times.
function saveBest(key, value, lower = true) {
  const all = LS.get('pf.v1.best', {}) || {}, old = all[key];
  const isNew = !Number.isFinite(old) || (lower ? value < old : value > old);
  if (isNew) { all[key] = value; LS.set('pf.v1.best', all); }
  return { best: isNew ? value : old, isNew, had: Number.isFinite(old) };
}
function getBest(key) { const v = (LS.get('pf.v1.best', {}) || {})[key]; return Number.isFinite(v) ? v : null; }
// Is a point within r of a player-sized capsule standing at feet?
function hitCapsule(feet, pt, r = 0) {
  const y = clamp(pt.y, feet.y + 0.35, feet.y + 1.7), dx = pt.x - feet.x, dy = pt.y - y, dz = pt.z - feet.z;
  return dx * dx + dy * dy + dz * dz < (0.45 + r) * (0.45 + r);
}

const Game = {
  cam: null, avatar: null, body: null, def: null, mode: null, modeOpts: {}, opts: {}, token: 0, active: false,
  yaw: 0, pitch: 0.36, dist: 13, curDist: 13, facing: Math.PI, visY: 0, acc: 0, t: 0, time: 0, kinT: null,
  target: null, dir: null, ray: null, menuOpen: false, hintTimer: 0, boardT: 0,
  hp: 100, maxHp: 100, usesHp: false, dead: false, deadT: 0, shield: 0, score: 0, deaths: 0, ended: false, finished: false, frozen: false, noJump: false,
  checkpoint: null, cpYaw: Math.PI, cpId: null, loose: [], touchSet: new Set(), timers: new Map(), collected: new Set(), coinsTotal: 0, camMode: 'follow', R: Math.random,
  get hud() { return Hud; }, get bots() { return Bots; }, get fx() { return Fx; }, get shared() { return Shared; },
  init() {
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.target = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.checkpoint = new THREE.Vector3();
    this.avatar = createAvatar(Skins.wornTex, Profile.displayName());
    Engine.views.game = this;
    $('#hud-menu').addEventListener('click', () => this.openMenu());
    $('#gm-resume').addEventListener('click', () => Modals.close($('#game-menu')));
    $('#gm-reset').addEventListener('click', () => { Modals.close($('#game-menu')); this.kill('reset'); });
    $('#gm-settings').addEventListener('click', () => openSettings());
    $('#gm-leave').addEventListener('click', () => this.leave());
    $('#hud-stop').addEventListener('click', () => this.leave());
    $('#game').addEventListener('dblclick', e => e.preventDefault());
  },
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); },

  // ---- lifecycle ----
  // opts: {test: true, onExit()} when Studio play-tests a game (no room, Stop returns to Studio).
  enter(def, opts = {}) {
    if (!def) return;
    this.def = def; this.opts = opts; this.active = true; this.mode = null; this.body = null;
    const ld = $('#loading'); $('#loading-title').textContent = 'Loading ' + def.title; ld.hidden = false; ld.style.opacity = '1';
    $('#hud-title').textContent = def.title; $('#gm-title').textContent = def.title;
    $('#game').classList.toggle('testing', !!opts.test); $('#hud-stop').hidden = !opts.test;
    $('#gm-leave').lastChild.textContent = opts.test ? 'Stop test' : 'Leave game';
    showScreen('game'); Engine.setMode('game'); Engine.attach($('#game-host'));
    Input.release(); Input.enabled = false; $('#hud-chat').hidden = true;
    const token = ++this.token;
    setTimeout(() => { // let the loading card paint before the level is built
      if (token !== this.token) return;
      try { this.startRound(); }
      catch (e) { console.error(e); toast("This game couldn't load. Try another one.", true); this.leave(); return; }
      Input.enabled = true;
      if (!opts.test) Net.enterGame(def.id);
      $('#hud-fps').hidden = !Settings.showFps;
      const hint = $('#hud-hint'); hint.textContent = this.hintText(); hint.style.opacity = '1'; this.hintTimer = 7;
      ld.style.opacity = '0'; setTimeout(() => { if (token === this.token) ld.hidden = true; }, 360); Sfx.play('spawn');
    }, 60);
  },
  // Builds a fresh world and starts the rules from the beginning.
  startRound() {
    callMode('teardown', this);
    Hud.reset(); Bots.clear(); this.clearActions(); Fx.clear(); Shared.resetLocal();
    World.load(this.def); Fx.attach(World.scene); World.scene.add(this.avatar.root); Net.reattach();
    this.mode = Modes[this.def.mode] || Modes.free;
    this.modeOpts = Object.assign({}, this.mode.defaults || {}, this.def.modeOpts || {});
    this.R = rng((hashStr(this.def.id) ^ Date.now()) >>> 0);
    this.maxHp = this.modeOpts.maxHp || 100; this.usesHp = !!(this.mode.hp || this.modeOpts.hp);
    this.score = 0; this.deaths = 0; this.time = 0; this.ended = false; this.finished = false; this.frozen = false; this.noJump = false;
    this.touchSet.clear(); this.timers.clear(); this.collected.clear(); this.cpId = null; this.kinT = null;
    this.checkpoint.copy(World.spawn); this.cpYaw = World.spawnYaw;
    this.avatar.setName(Profile.displayName());
    this.setCamera(this.mode.camera || 'follow');
    this.spawnPlayer(false);
    Net.setScore(0); Net.setPublic(null);
    this.coinsTotal = World.parts.filter(p => p.behavior === 'coin').length;
    this.loose = World.parts.filter(p => p.anchored === false && !p.behavior && p.shape !== 'spawn').map(p => { World.mesh(p.id).matrixAutoUpdate = true; return { p, vy: 0 }; });
    if (this.usesHp) Hud.hp(this.hp, this.maxHp);
    callMode('setup', this);
  },
  restart() { Hud.hideEnd(); this.startRound(); Input.release(); Input.enabled = true; },
  leave() {
    this.token++; this.active = false;
    Modals.close($('#game-menu')); Hud.hideEnd(); Input.enabled = false; Input.release(); Input.unlock();
    callMode('teardown', this); this.mode = null; this.body = null;
    Bots.clear(); this.clearActions(); Fx.clear(); Hud.reset(); Shared.resetLocal();
    if (!this.opts.test) Net.leave();
    this.avatar.bubble.userData.hide(); if (World.scene) World.scene.remove(this.avatar.root);
    World.unload();
    $('#game').classList.remove('testing'); $('#hud-stop').hidden = true; $('#loading').hidden = true;
    const after = this.opts.onExit; this.opts = {};
    Sfx.play('click');
    if (after) after();
    else { Engine.setMode('home'); showScreen('home'); if (Home.onReturn) Home.onReturn(); }
  },
  hintText() {
    if (this.mode && typeof this.mode.hint === 'string') return this.mode.hint;
    return this.camMode === 'shoulder' ? 'WASD to move · Click to aim and shoot · Space to jump · Esc frees the mouse' : 'WASD to move · Space to jump · Drag to look · Scroll to zoom';
  },
  openMenu() {
    if (Engine.mode !== 'game') return;
    const m = $('#game-menu'); if (!m.hidden) return;
    this.menuOpen = true; Input.release(); Input.unlock(); Net.renderPlayers(); Modals.open(m);
    m.onClose = () => { this.menuOpen = false; };
  },

  // ---- player ----
  spawnPlayer(sound) {
    this.body = Phys.createBody(this.checkpoint); this.body.pos.y += 0.05;
    this.facing = this.cpYaw; this.yaw = this.cpYaw + Math.PI; this.pitch = this.camMode === 'shoulder' ? 0.1 : 0.36;
    this.visY = this.body.pos.y; this.acc = 0; this.dead = false; this.hp = this.maxHp; this.shield = 1.5;
    if (Engine.h > Engine.w * 1.2) this.dist = Math.min(this.dist, 10.5);
    this.target.set(this.body.pos.x, this.body.pos.y + 1.65, this.body.pos.z); this.curDist = this.camMode === 'shoulder' ? 4.2 : this.dist;
    this.avatar.root.visible = true;
    if (sound) Sfx.play('respawn');
  },
  respawn(sound = true) {
    if (this.ended) return;
    this.spawnPlayer(sound); this.touchSet.clear();
    if (this.usesHp) Hud.hp(this.hp, this.maxHp);
    callMode('onRespawn', this);
  },
  setCheckpoint(pos, yaw, id) {
    if (Array.isArray(pos)) this.checkpoint.set(pos[0], pos[1], pos[2]); else this.checkpoint.set(pos.x, pos.y, pos.z);
    if (Number.isFinite(yaw)) this.cpYaw = yaw; if (id) this.cpId = id;
  },
  kill(why = 'hazard') {
    if (this.dead || this.ended || !this.body) return;
    this.dead = true; this.deaths++; this.hp = 0;
    const p = this.body.pos; Fx.burst({ x: p.x, y: p.y + 1, z: p.z }, '#FF6A2B', 18, 7); Sfx.play('die'); Hud.hurt();
    if (this.usesHp) Hud.hp(0, this.maxHp);
    this.avatar.root.visible = false; this.deadT = 1.3;
    if (callMode('onDeath', this, why) === true) this.deadT = Infinity; // the mode will call respawn()
  },
  // from: who caused it ('hazard', a bot, or a remote player's key). quiet skips the red flash (damage over time).
  damage(n, from, quiet) {
    if (this.dead || this.ended || this.shield > 0 || !(n > 0)) return;
    this.usesHp = true; this.hp = Math.max(0, this.hp - n); Hud.hp(this.hp, this.maxHp);
    if (!quiet) { Hud.hurt(); Sfx.play('hurt'); }
    this.lastHitBy = from || null;
    if (this.hp <= 0) this.kill(from && from !== 'hazard' ? 'hit' : 'damage');
  },
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); if (this.usesHp) Hud.hp(this.hp, this.maxHp); },
  addScore(n) { this.score += n; Net.setScore(this.score); return this.score; },
  setScore(n) { this.score = n; Net.setScore(n); },
  // End the round with a result card. o: {win, title, sub, stats: [[label, value]], again}
  end(o = {}) {
    if (this.ended) return;
    this.ended = true; Input.release(); Input.unlock();
    Sfx.play(o.win === false ? 'lose' : 'win');
    callMode('onEnd', this, o);
    Hud.showEnd({
      title: o.title || (o.win === false ? 'Game over' : 'You win!'), sub: o.sub, stats: o.stats || [], win: o.win !== false,
      againLabel: o.againLabel || 'Play again', leaveLabel: this.opts.test ? 'Stop test' : 'Leave game',
      onAgain: o.again === false ? null : () => this.restart(), onLeave: () => this.leave(),
    });
  },
  finishRun() {
    const t = this.time, best = saveBest(this.def.id, t);
    const stats = [['Time', fmtTime(t)], ['Falls', this.deaths]];
    if (this.coinsTotal) stats.push(['Coins', `${this.score} / ${this.coinsTotal}`]);
    this.end({ win: true, title: 'You made it!', sub: best.isNew ? (best.had ? 'New personal best!' : 'First clear!') : `Your best: ${fmtTime(best.best)}`, stats });
  },

  // ---- camera, aiming, actions ----
  setCamera(m) {
    this.camMode = m === 'shoulder' ? 'shoulder' : 'follow';
    Input.aim = this.camMode === 'shoulder' && !IS_TOUCH;
    Hud.crosshair(this.camMode === 'shoulder');
    if (this.camMode !== 'shoulder') Input.unlock();
  },
  aimRay() { const d = new THREE.Vector3(); this.cam.getWorldDirection(d); return { origin: this.cam.position.clone(), dir: d }; },
  aimPoint(max = 160) { const r = this.aimRay(), h = Phys.raycast(r.origin, r.dir, max); return h ? h.point : r.origin.addScaledVector(r.dir, max); },
  handPos() {
    const b = this.body, f = this.facing, c = Math.cos(f), s = Math.sin(f);
    return new THREE.Vector3(b.pos.x - 0.375 * c + 0.3 * s, this.visY + 1.25, b.pos.z + 0.375 * s + 0.3 * c);
  },
  // Buttons on screen plus a key: {id, label, icon, key: 'KeyE' | 'Mouse0', key2, keyLabel, primary, onDown, onUp}
  addAction(o) {
    this.removeAction(o.id);
    const a = { id: o.id, key: o.key || null, key2: o.key2 || null, held: false, disabled: false, onDown: o.onDown, onUp: o.onUp };
    const b = document.createElement('button'); b.className = 'hud-act' + (o.primary ? ' primary' : ''); b.setAttribute('aria-label', o.label || o.id);
    b.innerHTML = iconSvg(o.icon || 'hand') + '<span class="lbl"></span>' + (o.keyLabel ? '<span class="key"></span>' : '');
    b.querySelector('.lbl').textContent = o.label || ''; if (o.keyLabel) b.querySelector('.key').textContent = o.keyLabel;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } Input.down(a); });
    const up = () => Input.up(a);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    $('#hud-actions').appendChild(b); a.btn = b; Input.actions.set(a.id, a);
    return a;
  },
  removeAction(id) { const a = Input.actions.get(id); if (!a) return; Input.up(a); if (a.btn) a.btn.remove(); Input.actions.delete(id); },
  clearActions() { for (const id of [...Input.actions.keys()]) this.removeAction(id); },
  actionHeld(id) { const a = Input.actions.get(id); return !!(a && a.held); },
  setActionEnabled(id, on) { const a = Input.actions.get(id); if (!a) return; a.disabled = !on; a.btn.disabled = !on; if (!on) Input.up(a); },
  setActionLabel(id, label) { const a = Input.actions.get(id); if (a) a.btn.querySelector('.lbl').textContent = label; },

  // ---- parts ----
  part(id) { return World.part(id); },
  mesh(id) { return World.mesh(id); },
  collider(id) { return Phys.collider(id); },
  partsByTag(tag) { return World.parts.filter(p => p.tag === tag); },
  spawnPart(raw) { return World.addPart(raw).userData.part; },
  removePart(id) { World.removePart(id); this.timers.delete(id); },
  setPartVisible(id, v) { const m = World.mesh(id); if (m) m.visible = !!v; },
  setPartSolid(id, on) { Phys.setEnabled(id, on); },
  // Move a part (and its collider) to a new center; rot is optional Euler degrees [x, y, z].
  movePart(id, pos, rot) {
    const m = World.mesh(id), p = World.part(id); if (!m || !p) return;
    const v = Array.isArray(pos) ? this._mv.set(pos[0], pos[1], pos[2]) : this._mv.copy(pos);
    m.matrixAutoUpdate = true; m.position.copy(v); p.pos = [v.x, v.y, v.z];
    if (rot) { m.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, 'YXZ'); p.rot = rot.slice(0, 3); }
    const c = Phys.collider(id); if (c) Phys.moveCollider(c, m.position, m.quaternion);
  },
  _mv: new THREE.Vector3(),
  // Unanchored parts fall straight down and settle on whatever is below them.
  runLoose(dt) {
    for (const L of this.loose) {
      const p = L.p, c = Phys.collider(p.id), m = World.mesh(p.id); if (!c || !m || !c.enabled) continue;
      const bottom = c.min.y; c.enabled = false; const floor = Phys.groundAt(c.center.x, c.center.z, bottom + 0.02, 300); c.enabled = true;
      const target = floor === null ? -200 : floor;
      if (bottom > target + 0.005) {
        L.vy = Math.max(L.vy - Phys.params.gravity * dt, -60);
        const dy = Math.max(L.vy * dt, target - bottom);
        m.position.y += dy; p.pos[1] = m.position.y; Phys.moveCollider(c, m.position, m.quaternion);
      } else L.vy = 0;
    }
  },
  setPartColor(id, hex) {
    const m = World.mesh(id), p = World.part(id); if (!m || !p) return;
    p.color = hex; if (!Array.isArray(m.material)) m.material = partMaterial(p.material, hex, p.transparency || 0);
  },
  // Parts with a tag within r of the player, nearest first: [{part, d}]
  near(tag, r) {
    const b = this.body; if (!b) return [];
    const out = [];
    for (const p of World.parts) {
      if (p.tag !== tag) continue;
      const m = World.mesh(p.id); if (m && !m.visible) continue;
      const pos = m ? m.position : { x: p.pos[0], z: p.pos[2] };
      const d = Math.hypot(pos.x - b.pos.x, pos.z - b.pos.z) - Math.max(p.size[0], p.size[2]) / 2;
      if (d <= r) out.push({ part: p, d });
    }
    return out.sort((a, b2) => a.d - b2.d);
  },
  collect(p) {
    if (this.collected.has(p.id)) return;
    this.collected.add(p.id); this.setPartVisible(p.id, false); Phys.setEnabled(p.id, false);
    const v = Number(p.bp && p.bp.value) || 1; this.addScore(v);
    const m = World.mesh(p.id);
    if (m) { Fx.burst(m.position, p.color, 10, 4); Fx.text({ x: m.position.x, y: m.position.y + 0.9, z: m.position.z }, '+' + v, '#FFE07A'); }
    Sfx.play('coin');
    const back = Number(p.bp && p.bp.respawn); if (back > 0) this.timers.set(p.id, { kind: 'coin', t: back, p });
    callMode('onCoin', p, this);
  },
  breakPart(p, back) {
    this.setPartVisible(p.id, false); Phys.setEnabled(p.id, false);
    const m = World.mesh(p.id); if (m) Fx.burst(m.position, p.color, 16, 5);
    Sfx.play('break');
    if (back > 0) this.timers.set(p.id, { kind: 'restore', t: back, p });
  },
  // ---- multiplayer helpers ----
  others() {
    return [...Net.remotes.values()].map(r => ({ key: r.key, peer: r.peer, name: r.displayName, pos: r.avatar.root.position, yaw: r.avatar.root.rotation.y, sc: r.sc || 0, x: r.x || null, avatar: r.avatar, visible: r.avatar.root.visible }));
  },
  myPeer() { return Net.myPeer || 'me'; },
  setPublic(obj) { Net.setPublic(obj); },

  // ---- per-frame ----
  touchBegin(p, c) {
    if (callMode('onTouch', p, this, c) === true) return;
    if (p.tag === 'hazard') { this.kill('hazard'); return; } // any part (spinning, moving...) can be deadly
    const bp = p.bp || {};
    switch (p.behavior) {
      case 'kill': this.kill('hazard'); break;
      case 'checkpoint':
        if (this.cpId !== p.id) {
          const top = c ? c.max.y : p.pos[1] + p.size[1] / 2;
          this.setCheckpoint({ x: p.pos[0], y: top + 0.05, z: p.pos[2] }, this.facing, p.id);
          this.setPartColor(p.id, '#3FD07A'); Fx.ring({ x: p.pos[0], y: top, z: p.pos[2] }, '#3FD07A', 3);
          Hud.flash('Checkpoint!', 'good', 1100); Sfx.play('checkpoint'); callMode('onCheckpoint', p, this);
        }
        break;
      case 'finish': if (!this.finished) { this.finished = true; if (callMode('onFinish', p, this) !== true) this.finishRun(); } break;
      case 'coin': this.collect(p); break;
      case 'bounce': { const b = this.body; b.vel.y = Number(bp.power) || 26; b.grounded = false; b.noSnap = 0.2; b.coyote = 0; Sfx.play('bounce'); break; }
      case 'speed': this.body.speedMul = Number(bp.mult) || 1.8; this.body.speedT = Number(bp.time) || 3; Sfx.play('boost'); break;
      case 'vanish': if (!this.timers.has(p.id)) this.timers.set(p.id, { kind: 'vanish', t: Number.isFinite(bp.delay) ? bp.delay : 0.5, p }); break;
      case 'fake': this.breakPart(p, Number.isFinite(bp.back) ? bp.back : 4); break;
      case 'teleport': if (Array.isArray(bp.to)) { this.body.pos.set(...finite3(bp.to, [0, 3, 0])); this.body.vel.set(0, 0, 0); Sfx.play('boost'); } break;
    }
  },
  runTouches(dt) {
    const now = this._now || (this._now = new Set()); now.clear();
    for (const c of Phys.touching(this.body, this._tl || (this._tl = []))) {
      const p = c.part; if (!p.behavior && !p.tag) continue;
      now.add(p.id);
      if (!this.touchSet.has(p.id)) this.touchBegin(p, c);
      if (this.dead || this.ended) break;
      if (p.behavior === 'damage') this.damage((Number(p.bp && p.bp.dps) || 25) * dt, 'hazard', true);
    }
    const old = this.touchSet; this.touchSet = now; this._now = old;
  },
  runTimers(dt) {
    for (const [id, tm] of [...this.timers]) {
      tm.t -= dt;
      if (tm.kind === 'vanish') {
        const m = World.mesh(id); if (m && tm.t > 0) m.visible = Math.floor(tm.t * 14) % 2 === 0;
        if (tm.t <= 0) { this.timers.delete(id); const bp = tm.p.bp || {}; this.breakPart(tm.p, Number.isFinite(bp.back) ? bp.back : 3); }
      } else if (tm.t <= 0) {
        this.timers.delete(id); this.setPartVisible(id, true); Phys.setEnabled(id, true);
        if (tm.kind === 'coin') this.collected.delete(id);
      }
    }
  },
  frame(dt) {
    if (!this.mode || !this.body || !World.scene) return; // still loading
    this.t += dt;
    if (!this.ended && !this.frozen) this.time += dt;
    const shoulder = this.camMode === 'shoulder', sens = 0.0055 * Settings.sensitivity;
    this.yaw -= Input.lookDX * sens;
    this.pitch = clamp(this.pitch + Input.lookDY * sens * (Settings.invertY ? -1 : 1), shoulder ? -0.9 : -0.3, shoulder ? 1.1 : 1.35);
    Input.lookDX = Input.lookDY = 0;
    if (Input.zoom) { if (!shoulder) this.dist = clamp(this.dist * Math.pow(1.0012, Input.zoom), 3.5, 30); Input.zoom = 0; }
    const live = Input.enabled && !this.menuOpen && !this.dead && !this.ended && !this.frozen;
    const [mx, mz] = live ? Input.move(this.yaw) : [0, 0];
    let jq = live && !this.noJump && Input.jumpQueued; Input.jumpQueued = false;
    const held = live && !this.noJump && Input.jumpHeld, b = this.body, STEP = 1 / 120;
    // Fixed physics steps; moving parts follow the shared clock, spread evenly across the steps.
    const clock = World.time();
    if (this.kinT === null || Math.abs(clock - this.kinT) > 1) this.kinT = clock - this.acc;
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= STEP) {
      this.kinT += STEP; Phys.beginStep(); World.updateKinematics(this.kinT);
      if (!this.dead) Phys.step(b, STEP, mx, mz, jq, held);
      Bots.step(STEP);
      jq = false; this.acc -= STEP;
    }
    if (Math.abs(this.kinT - clock) > 0.25) this.kinT = clock;
    for (const ev of b.events) Sfx.play(ev); b.events.length = 0;
    if (b.yawDelta) { this.facing += b.yawDelta; if (!shoulder) this.yaw += b.yawDelta; b.yawDelta = 0; }
    // Rules
    if (!this.dead && !this.ended) {
      this.shield = Math.max(0, this.shield - dt);
      this.runTouches(dt);
      if (!this.dead && b.pos.y < (Number.isFinite(this.def.killY) ? this.def.killY : -40)) this.kill('fall');
    } else if (this.dead && !this.ended) { this.deadT -= dt; if (this.deadT <= 0) this.respawn(true); }
    this.runTimers(dt);
    if (this.loose.length) this.runLoose(dt);
    callMode('update', dt, this);
    Bots.animate(dt);
    Shared.tick(dt);
    if (this.mode && this.mode.board && (this.boardT -= dt) <= 0) {
      this.boardT = 0.5;
      const rows = [{ name: Profile.displayName(), value: this.score, me: true }, ...this.others().map(o => ({ name: o.name, value: o.sc }))];
      rows.sort((a, c) => (this.mode.boardAsc ? a.value - c.value : c.value - a.value));
      Hud.board(rows.length > 1 || this.mode.boardAlways ? rows : null, this.mode.boardTitle || 'Scores');
    }
    // Avatar
    const hs = Math.hypot(b.vel.x, b.vel.z), av = this.avatar;
    if (shoulder) { let d = this.yaw + Math.PI - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += d * (1 - Math.exp(-22 * dt)); }
    else if (hs > 0.6) { let d = Math.atan2(b.vel.x, b.vel.z) - this.facing; d = Math.atan2(Math.sin(d), Math.cos(d)); this.facing += d * (1 - Math.exp(-14 * dt)); }
    this.visY = b.grounded && b.pos.y > this.visY && b.pos.y - this.visY < 0.7 ? damp(this.visY, b.pos.y, 24, dt) : b.pos.y;
    av.root.position.set(b.pos.x, this.visY, b.pos.z); av.root.rotation.y = this.facing;
    if (!this.dead && av.animate(dt, { speed: hs / Phys.SPEED, grounded: b.grounded, t: this.t })) Sfx.play('step');
    // Camera: orbit (or over the shoulder) with collision
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    let want = this.dist;
    if (shoulder) {
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      this.target.set(b.pos.x + rx * 0.85, damp(this.target.y, this.visY + 1.75, 20, dt), b.pos.z + rz * 0.85); want = 4.2;
    } else { this.target.x = b.pos.x; this.target.z = b.pos.z; this.target.y = damp(this.target.y, this.visY + 1.65, 16, dt); }
    this.ray.set(this.target, this.dir); this.ray.far = want;
    const hits = this.ray.intersectObjects(World.solid, false);
    const allowed = hits.length ? Math.max(0.6, hits[0].distance - 0.35) : want;
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 5, dt);
    this.cam.position.copy(this.target).addScaledVector(this.dir, this.curDist);
    this.cam.lookAt(this.target);
    av.root.visible = !this.dead && this.curDist > 1.1; av.tag.visible = this.curDist > 6;
    Net.tick(dt);
    Fx.update(dt);
    World.update(dt, b.pos, this.cam);
    Engine.renderer.render(World.scene, this.cam);
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) $('#hud-hint').style.opacity = '0'; }
  },
};
