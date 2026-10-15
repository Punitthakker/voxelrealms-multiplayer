/* ---------- Games: arena (foam blasters, hill, push, paint) ---------- */
const BLASTERS = {
  splatter: { name: 'Splatter', blurb: 'Fast and steady', rate: 0.11, dmg: 9, speed: 70, spread: 0.035, pellets: 1, grav: 6, size: 0.14, mag: 30, reload: 1.4, auto: true, range: [9, 16] },
  popper: { name: 'Popper', blurb: 'Big burst up close', rate: 0.75, dmg: 12, speed: 55, spread: 0.11, pellets: 6, grav: 8, size: 0.13, mag: 5, reload: 1.8, auto: false, range: [4, 8] },
  longshot: { name: 'Long Shot', blurb: 'One heavy hit, far away', rate: 0.95, dmg: 55, speed: 150, spread: 0.002, pellets: 1, grav: 2, size: 0.18, mag: 4, reload: 2, auto: false, range: [18, 32] },
  snow: { name: 'Snowball', blurb: 'Lob it in an arc', rate: 0.45, dmg: 34, speed: 34, spread: 0.012, pellets: 1, grav: 22, size: 0.3, mag: 6, reload: 1.6, auto: false, range: [9, 18] },
  laser: { name: 'Light Bolt', blurb: 'Rapid beams of light', rate: 0.16, dmg: 12, speed: 120, spread: 0.01, pellets: 1, grav: 0, size: 0.12, mag: 24, reload: 1.2, auto: true, range: [10, 20] },
};
// Pooled foam darts / snowballs / bolts with swept collision.
const ArenaShots = {
  list: [], geo: null, mats: new Map(), tmp: null, dir: null, pt: null,
  init() {
    if (!this.geo) { this.geo = new THREE.SphereGeometry(1, 8, 6); this.tmp = new THREE.Vector3(); this.dir = new THREE.Vector3(); this.pt = new THREE.Vector3(); }
    this.clear();
  },
  mat(color) { let m = this.mats.get(color); if (!m) { m = new THREE.MeshBasicMaterial({ color }); this.mats.set(color, m); } return m; },
  clear() { for (const s of this.list) if (World.scene) World.scene.remove(s.mesh); this.list = []; },
  fire(o) {
    if (this.list.length > 80) { const old = this.list.shift(); if (World.scene) World.scene.remove(old.mesh); }
    const mesh = new THREE.Mesh(this.geo, this.mat(o.color)); mesh.scale.setScalar(o.size); mesh.position.copy(o.from);
    World.scene.add(mesh);
    this.list.push({ mesh, pos: o.from.clone(), vel: o.dir.clone().multiplyScalar(o.speed), grav: o.grav, size: o.size, dmg: o.dmg, owner: o.owner, team: o.team, color: o.color, life: 2.4, onHit: o.onHit });
  },
  // Move every shot; test the swept segment against the world, the player, bots and other players.
  update(dt, G, M) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]; s.life -= dt;
      s.vel.y -= s.grav * dt;
      const step = s.vel.length() * dt; this.dir.copy(s.vel).normalize();
      let hitT = step, worldHit = null;
      const h = Phys.raycast(s.pos, this.dir, step + s.size); if (h && h.t <= step + s.size) { hitT = Math.max(0, h.t - s.size * 0.5); worldHit = h; }
      // creatures along the segment
      let target = null;
      for (let t = 0; t <= hitT && !target; t += 0.35) {
        this.pt.copy(s.pos).addScaledVector(this.dir, Math.min(t, hitT));
        target = M.shotTarget(s, this.pt, G);
        if (target) hitT = Math.min(t, hitT);
      }
      s.pos.addScaledVector(this.dir, hitT); s.mesh.position.copy(s.pos);
      if (target) { M.shotHit(s, target, G); this.kill(i); continue; }
      if (worldHit) { G.fx.splat(worldHit.point, worldHit.normal, s.color, 0.6 + s.size * 3); if (M.shotWorld) M.shotWorld(s, worldHit, G); this.kill(i); continue; }
      if (s.life <= 0 || s.pos.y < -30) this.kill(i);
    }
  },
  kill(i) { const s = this.list[i]; if (World.scene) World.scene.remove(s.mesh); this.list.splice(i, 1); },
};
// Knock someone back: who = 'me' or a bot; dir from the shover.
function arenaShove(G, fromPos, who, power = 15) {
  const body = who === 'me' ? G.body : who.body; if (!body) return;
  const dx = body.pos.x - fromPos.x, dz = body.pos.z - fromPos.z, d = Math.hypot(dx, dz) || 1;
  body.vel.x += (dx / d) * power; body.vel.z += (dz / d) * power; body.vel.y = Math.max(body.vel.y, 8); body.grounded = false; body.noSnap = 0.25;
  G.fx.ring({ x: body.pos.x, y: body.pos.y + 0.2, z: body.pos.z }, '#FFFFFF', 2); Sfx.play('whoosh');
}

// ---- Arena maps ----
function arenaMap(style) {
  return R => {
    const parts = [], P = (...a) => parts.push(mkPart(...a)), S = style, W = S.size || 64, half = W / 2;
    P('block', [0, -1, 0], [W, 2, W], S.floor, S.floorMat, { name: 'Arena floor' });
    if (S.ground) P('block', [0, -1.05, 0], [W + 200, 2, W + 200], S.ground, S.groundMat || 'grass', { name: 'Ground' });
    for (const [x, z, w, d] of [[0, half, W + 2, 2], [0, -half, W + 2, 2], [half, 0, 2, W + 2], [-half, 0, 2, W + 2]]) P('block', [x, 2, z], [w, 4, d], S.wall, S.wallMat || 'plastic', { name: 'Arena wall' });
    if (S.trim) for (const [x, z, w, d] of [[0, half - 1.05, W, 0.12], [0, -half + 1.05, W, 0.12], [half - 1.05, 0, 0.12, W], [-half + 1.05, 0, 0.12, W]]) P('block', [x, 3.8, z], [w, 0.3, d], S.trim, 'neon', { name: 'Trim', canCollide: false });
    // Raised center with two ramps
    P('block', [0, 1.25, 0], [9, 2.5, 9], S.center, S.centerMat || 'plastic', { name: 'Center deck' });
    P('wedge', [0, 1.25, 8.5], [5, 2.5, 8], S.center, S.centerMat || 'plastic', { name: 'Ramp' });
    P('wedge', [0, 1.25, -8.5], [5, 2.5, 8], S.center, S.centerMat || 'plastic', { name: 'Ramp', rot: [0, 180, 0] });
    // Mirrored cover
    const kinds = S.cover || ['crate', 'wall', 'pillar'];
    for (let i = 0; i < (S.coverCount || 9); i++) {
      const x = (R() - 0.5) * (W - 14), z = 6 + R() * (half - 12), k = pick(R, kinds), col = pick(R, S.colors), rot = [0, pick(R, [0, 90, 30, 60]), 0];
      for (const sz of [1, -1]) {
        const pos = [sz * x, 0, sz * z];
        if (Math.abs(pos[0]) < 6 && Math.abs(pos[2]) < 13) continue;
        if (k === 'crate') P('block', [pos[0], 1.1, pos[2]], [2.2, 2.2, 2.2], col, S.crateMat || 'wood', { name: 'Crate', rot });
        else if (k === 'wall') P('block', [pos[0], 1.4, pos[2]], [6, 2.8, 1], col, S.wallMat || 'plastic', { name: 'Cover wall', rot });
        else if (k === 'pillar') P('cylinder', [pos[0], 2, pos[2]], [2, 4, 2], col, S.wallMat || 'plastic', { name: 'Pillar' });
        else if (k === 'snow') P('sphere', [pos[0], 0.9, pos[2]], [4, 2.4, 3], '#F4F8FC', 'sand', { name: 'Snow mound', rot });
        else if (k === 'tree') { P('cylinder', [pos[0], 1.5, pos[2]], [0.8, 3, 0.8], '#6B4A2E', 'wood', { name: 'Trunk' }); P('cylinder', [pos[0], 4.2, pos[2]], [3.4, 3.6, 3.4], '#2F7A55', 'grass', { name: 'Pine' }); }
      }
    }
    // Spawn points: two teams at the ends, four corners for free-for-all
    const sp = [[0, -half + 5, 0, 0], [0, half - 5, 1, Math.PI], [-half + 6, -half + 6, 0, -Math.PI * 0.75], [half - 6, half - 6, 1, Math.PI * 0.25], [half - 6, -half + 6, 0, Math.PI * 0.75], [-half + 6, half - 6, 1, -Math.PI * 0.25]];
    sp.forEach(([x, z, team, yaw], i) => P('cylinder', [x, 0.03, z], [3, 0.06, 3], team ? '#2D9CF0' : '#FF6A2B', 'neon', { name: 'Spawn point', canCollide: false, tag: 'spawnpoint', bp: { team, yaw, i } }));
    if (S.splats) for (let i = 0; i < 30; i++) P('cylinder', [(R() - 0.5) * (W - 4), 0.01, (R() - 0.5) * (W - 4)], [1 + R() * 2.5, 0.02, 1 + R() * 2.5], pick(R, S.colors), 'neon', { name: 'Paint', canCollide: false });
    return { parts, spawn: [0, 0.3, -half + 5], spawnYaw: Math.PI + Math.PI };
  };
}
function arenaHillMap(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a));
  P('cylinder', [0, -1, 0], [70, 2, 70], '#6CC38A', 'grass', { name: 'Island' });
  P('block', [0, -12, 0], [300, 2, 300], '#2E86D8', 'ice', { name: 'Water', canCollide: false });
  const spots = [[0, 0], [16, -12], [-16, 12], [-14, -16], [15, 15]];
  spots.forEach(([x, z], i) => {
    P('cylinder', [x, 0.75, z], [9, 1.5, 9], '#8FD19E', 'grass', { name: 'Mound' });
    P('cylinder', [x, 1.55, z], [8, 0.1, 8], '#FFE07A', 'neon', { name: 'Hill zone', canCollide: false, transparency: 0.55, tag: 'hill', bp: { i } });
  });
  for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2, r = 10 + R() * 20; P('block', [Math.cos(a) * r, 1, Math.sin(a) * r], [2, 2, 2], pick(R, ['#FF6A2B', '#2D62F0', '#FFC53A']), 'plastic', { name: 'Crate', rot: [0, R() * 90, 0] }); }
  [[0, -28, 0], [0, 28, 1], [-28, 0, 0], [28, 0, 1]].forEach(([x, z, team], i) => P('cylinder', [x, 0.03, z], [3, 0.06, 3], '#FFFFFF', 'neon', { name: 'Spawn point', canCollide: false, tag: 'spawnpoint', bp: { team, i, yaw: Math.atan2(-x, -z) + Math.PI } }));
  return { parts, spawn: [0, 0.3, -28], spawnYaw: Math.PI * 2 };
}
function arenaPushMap(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), cols = ['#FF6A2B', '#FFC53A', '#2D62F0'];
  P('cylinder', [0, 0, 0], [10, 1, 10], '#FFFFFF', 'plastic', { name: 'Center', tag: 'ring0' });
  [[5, 10, 'ring1'], [10, 16, 'ring2'], [16, 22, 'ring3']].forEach(([r0, r1, tag], k) => {
    const n = 10 + k * 4, rm = (r0 + r1) / 2;
    for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2, w = (2 * Math.PI * rm) / n + 0.3; P('block', [Math.cos(a) * rm, 0, Math.sin(a) * rm], [r1 - r0, 1, w], cols[(i + k) % 3], 'plastic', { name: 'Floor segment', rot: [0, -a * 57.3, 0], tag }); }
  });
  P('block', [0, -20, 0], [300, 2, 300], '#6CA8E0', 'ice', { name: 'Clouds below', canCollide: false, transparency: 0.4 });
  [0, 1, 2, 3].forEach(i => { const a = i / 4 * Math.PI * 2 + 0.4; P('cylinder', [Math.cos(a) * 13, 0.53, Math.sin(a) * 13], [2.4, 0.06, 2.4], '#FFFFFF', 'neon', { name: 'Spawn point', canCollide: false, tag: 'spawnpoint', bp: { i, team: i % 2, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI } }); });
  return { parts, spawn: [Math.cos(0.4) * 13, 0.6, Math.sin(0.4) * 13], spawnYaw: Math.atan2(-Math.cos(0.4), -Math.sin(0.4)) + Math.PI };
}
function arenaPaintMap(R) {
  const parts = [], P = (...a) => parts.push(mkPart(...a)), N = 14, S = 4, half = N * S / 2;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) P('block', [-half + S * (i + 0.5), -0.25, -half + S * (j + 0.5)], [S - 0.05, 0.5, S - 0.05], '#F4F4F6', 'plastic', { name: 'Paint tile', tag: 'ptile' });
  P('block', [0, -1.2, 0], [N * S + 120, 1, N * S + 120], '#6CC38A', 'grass', { name: 'Park' });
  for (const [x, z, w, d] of [[0, half + 1, N * S + 2, 2], [0, -half - 1, N * S + 2, 2], [half + 1, 0, 2, N * S + 2], [-half - 1, 0, 2, N * S + 2]]) P('block', [x, 1, z], [w, 2.5, d], '#FFFFFF', 'plastic', { name: 'Fence' });
  for (let i = 0; i < 8; i++) { const x = (R() - 0.5) * (N * S - 12), z = (R() - 0.5) * (N * S - 20); for (const s of [1, -1]) P('block', [s * x, 1.2, s * z], [3, 2.4, 3], '#9AA5B1', 'plastic', { name: 'Block', rot: [0, 45, 0] }); }
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; P('cylinder', [Math.cos(a) * (half + 14), 2, Math.sin(a) * (half + 14)], [0.9, 4, 0.9], '#8A5A35', 'wood', { name: 'Trunk' }); P('sphere', [Math.cos(a) * (half + 14), 5.2, Math.sin(a) * (half + 14)], [4.4, 4, 4.4], '#4DB06A', 'grass', { name: 'Leaves' }); }
  [[-4, -half + 4, 0], [4, -half + 4, 0], [-4, half - 4, 1], [4, half - 4, 1]].forEach(([x, z, team], i) => P('cylinder', [x, 0.03, z], [3, 0.06, 3], team ? '#2D9CF0' : '#FF6A2B', 'neon', { name: 'Spawn point', canCollide: false, tag: 'spawnpoint', bp: { team, i, yaw: team ? Math.PI : 0 } }));
  return { parts, spawn: [-4, 0.3, -half + 4], spawnYaw: 0 };
}

// ---- Foam blaster rules: duel rounds, team rounds, free-for-all, and room free-for-all ----
const TEAM_COLORS = ['#FF6A2B', '#2D9CF0'];
Modes.rivals = {
  label: 'Blasters', camera: 'shoulder', hp: true, hint: 'WASD to move · Click to shoot · R to reload · Space to jump · Esc frees the mouse',
  defaults: { format: 'duel', weapons: ['splatter', 'popper', 'longshot'], rounds: 5, target: 15, bots: 1, skill: 1 },
  setup(G) {
    ArenaShots.init();
    const o = G.modeOpts;
    this.mp = G.others().length > 0; this.format = this.mp ? 'room' : o.format;
    this.myTeam = 0; this.round = 0; this.wins = [0, 0]; this.splats = 0; this.shots = 0; this.hits = 0; this.phase = 'idle'; this.t = 0; this.cool = 0; this.reloadT = 0;
    this.weapon = o.weapons[0]; this.ammo = BLASTERS[this.weapon].mag; this.trigger = false; this.firing = false; this.joinNote = false; this.winner = null;
    this.spawns = G.partsByTag('spawnpoint');
    this.bots = [];
    if (!this.mp) {
      const plan = this.format === 'teams' ? [[0, 'Pal'], [1, 'Frost'], [1, 'Flurry']] : this.format === 'ffa' ? [[1, 'Zap'], [2, 'Glim'], [3, 'Volt']] : [[1, o.rivalName || 'Rex']];
      this.bots = plan.map(([team, name], i) => {
        const b = G.bots.add({ name, pos: this.spawnPos(team, i + 1), hp: 100, speed: 0.95, seed: G.def.id + name });
        b.team = team; b.data = { weapon: pick(G.R, o.weapons), ammo: 0, cool: 1, strafe: 1, strafeT: 0, jumpT: 2, err: 1.5 - 0.5 * (o.skill || 1), reload: 0, respawnT: 0, splats: 0 }; b.data.ammo = BLASTERS[b.data.weapon].mag; return b;
      });
    }
    G.addAction({ id: 'fire', label: 'Fire', icon: 'blaster', key: 'Mouse0', key2: 'KeyF', primary: true, onDown: () => { this.firing = true; this.trigger = true; }, onUp: () => { this.firing = false; } });
    G.addAction({ id: 'reload', label: 'Reload', icon: 'bolt', key: 'KeyR', keyLabel: 'R', onDown: () => this.startReload(G) });
    this.keyHandler = e => { if (this.phase === 'pick' && /^Digit[1-3]$/.test(e.code)) this.pickWeapon(o.weapons[+e.code.slice(5) - 1], G); };
    window.addEventListener('keydown', this.keyHandler);
    G.hud.stat('ammo', `${this.ammo} / ${BLASTERS[this.weapon].mag}`, { icon: 'blaster', label: 'Ammo' });
    if (this.format === 'duel' || this.format === 'teams') { G.hud.objective(this.format === 'teams' ? `Team up and win ${o.rounds} rounds` : `First to ${o.rounds} rounds wins`); this.score(G); this.nextRound(G); }
    else {
      G.hud.objective(`First to ${o.target} splats wins`); G.hud.stat('splats', `0 / ${o.target}`, { icon: 'target', label: 'Splats' });
      this.phase = 'fight'; this.setTeamPaint();
      if (o.weapons.length > 1) this.showPick(G, false);
    }
    G.setPublic({ hp: G.hp, dead: false });
  },
  teardown(G) { ArenaShots.clear(); window.removeEventListener('keydown', this.keyHandler); this.hidePick(); },
  spawnPos(team, i) {
    let list = this.spawns.filter(p => this.format === 'ffa' || this.format === 'room' ? true : p.bp.team === team);
    if (!list.length) list = this.spawns;
    const p = list[i % list.length]; return [p.pos[0] + (i > 1 ? 2 : 0), p.pos[1] + 0.3, p.pos[2]];
  },
  setTeamPaint() { this.myColor = this.format === 'ffa' || this.format === 'room' ? '#FF6A2B' : TEAM_COLORS[this.myTeam]; },
  score(G) {
    if (this.format === 'teams') G.hud.stat('score', `Your team ${this.wins[0]} - ${this.wins[1]} Rivals`, { icon: 'trophy', label: 'Rounds' });
    else G.hud.stat('score', `You ${this.wins[0]} - ${this.wins[1]} ${this.bots[0] ? this.bots[0].name : 'Rival'}`, { icon: 'trophy', label: 'Rounds' });
  },
  // ---- rounds ----
  nextRound(G) {
    this.round++; ArenaShots.clear();
    const sp = this.spawnPos(this.myTeam, 0); G.setCheckpoint(sp, this.spawns.find(p => p.bp.team === this.myTeam) ? this.spawns.find(p => p.bp.team === this.myTeam).bp.yaw : Math.PI); G.respawn(false);
    this.bots.forEach((b, i) => { b.respawn(this.spawnPos(b.team, i + 1)); b.data.ammo = BLASTERS[b.data.weapon].mag; b.data.cool = 1.2; });
    this.setTeamPaint(); this.ammo = BLASTERS[this.weapon].mag; this.reloadT = 0;
    G.frozen = true;
    if (G.modeOpts.weapons.length > 1) { this.phase = 'pick'; this.t = 7; this.showPick(G, true); }
    else { this.phase = 'count'; this.t = 3.2; }
    G.hud.flash('Round ' + this.round, 'info', 1200);
  },
  showPick(G, timed) {
    this.hidePick();
    const el = document.createElement('div'); el.className = 'ar-pick'; el.id = 'ar-pick';
    const h = document.createElement('h3'); h.textContent = 'Pick your blaster'; el.appendChild(h);
    const row = document.createElement('div'); row.className = 'ar-row';
    G.modeOpts.weapons.forEach((k, i) => {
      const w = BLASTERS[k], b = document.createElement('button'); b.className = 'ar-w' + (k === this.weapon ? ' on' : '');
      b.innerHTML = '<span class="ar-k"></span><b></b><small></small>';
      b.querySelector('.ar-k').textContent = String(i + 1); b.querySelector('b').textContent = w.name; b.querySelector('small').textContent = w.blurb;
      b.addEventListener('click', () => this.pickWeapon(k, G)); row.appendChild(b);
    });
    el.appendChild(row);
    const p = document.createElement('p'); p.id = 'ar-pick-t'; p.textContent = timed ? 'Round starts soon' : 'Tap a blaster to switch'; el.appendChild(p);
    if (!timed) { const c = document.createElement('button'); c.className = 'btn btn-ember'; c.textContent = 'Play'; c.addEventListener('click', () => this.hidePick()); el.appendChild(c); }
    $('#hud').appendChild(el);
  },
  hidePick() { const e = document.getElementById('ar-pick'); if (e) e.remove(); },
  pickWeapon(k, G) {
    if (!k || !BLASTERS[k]) return;
    this.weapon = k; this.ammo = BLASTERS[k].mag; this.reloadT = 0; Sfx.play('pick');
    G.hud.stat('ammo', `${this.ammo} / ${BLASTERS[k].mag}`, { icon: 'blaster' });
    $$('#ar-pick .ar-w').forEach((b, i) => b.classList.toggle('on', G.modeOpts.weapons[i] === k));
    if (this.phase === 'pick') this.t = Math.min(this.t, 1.2);
  },
  roundOver(G, myWin) {
    this.phase = 'roundEnd'; this.t = 2.6; this.wins[myWin ? 0 : 1]++; this.score(G);
    G.hud.flash(myWin ? 'Round won!' : 'Round lost', myWin ? 'good' : 'bad', 1800); Sfx.play(myWin ? 'checkpoint' : 'lose');
  },
  // ---- shooting ----
  startReload(G) { const w = BLASTERS[this.weapon]; if (this.reloadT > 0 || this.ammo >= w.mag) return; this.reloadT = w.reload; G.hud.stat('ammo', 'Reloading', { icon: 'blaster' }); Sfx.play('tick'); },
  shoot(G, from, aim, w, owner, team, color) {
    const R = G.R, dir = this.dirTmp || (this.dirTmp = new THREE.Vector3());
    for (let k = 0; k < w.pellets; k++) {
      dir.copy(aim).sub(from).normalize();
      dir.x += (R() - 0.5) * 2 * w.spread; dir.y += (R() - 0.5) * 2 * w.spread; dir.z += (R() - 0.5) * 2 * w.spread; dir.normalize();
      if (w.grav) dir.y += (w.grav / w.speed) * 0.02 * from.distanceTo(aim) / 10;
      ArenaShots.fire({ from: from.clone(), dir: dir.clone().normalize(), speed: w.speed, grav: w.grav, size: w.size, dmg: w.dmg, owner, team, color });
    }
    Sfx.play('shoot');
  },
  shotTarget(s, pt, G) {
    if (s.owner !== 'me' && !G.dead && hitCapsule(G.body.pos, pt, s.size) && (this.format === 'ffa' || this.format === 'room' || s.team !== this.myTeam)) return { me: true };
    const bot = G.bots.hitTest(pt, s.size, s.owner === 'me' ? null : s.owner);
    if (bot && (this.format === 'ffa' || bot.team !== s.team || s.owner === 'me' && bot.team !== this.myTeam)) return { bot };
    if (s.owner === 'me') for (const o of G.others()) if (o.visible && !(o.x && o.x.dead) && hitCapsule(o.pos, pt, s.size)) return { other: o };
    return null;
  },
  shotHit(s, t, G) {
    if (t.me) { G.damage(s.dmg, s.owner); G.fx.burst({ x: G.body.pos.x, y: G.body.pos.y + 1.2, z: G.body.pos.z }, s.color, 6, 3); return; }
    if (s.owner === 'me') { this.hits++; Sfx.play('pop'); }
    if (t.bot) { const p = t.bot.pos; G.fx.burst({ x: p.x, y: p.y + 1.2, z: p.z }, s.color, 6, 3); if (s.owner === 'me') G.fx.text({ x: p.x, y: p.y + 2.6, z: p.z }, '-' + s.dmg, '#FFE07A'); G.bots.damage(t.bot, s.dmg, s.owner); }
    else if (t.other) { G.fx.burst({ x: t.other.pos.x, y: t.other.pos.y + 1.2, z: t.other.pos.z }, s.color, 6, 3); G.fx.text({ x: t.other.pos.x, y: t.other.pos.y + 2.6, z: t.other.pos.z }, '-' + s.dmg, '#FFE07A'); Shared.act('hit', { to: t.other.peer, dmg: s.dmg }); }
  },
  onBotDown(bot, why, G) {
    if (why === 'me' || (bot.lastBy === 'me')) { this.splats++; G.addScore(1); }
    else if (why && why.data) why.data.splats++;
    G.hud.flash(`${bot.name} splatted!`, 'good', 900);
    if (this.format === 'ffa') { bot.data.respawnT = 2.5; this.checkFfa(G); }
    else this.checkRound(G);
  },
  onBotHit(bot, n, from) { bot.lastBy = from; },
  checkRound(G) {
    if (this.phase !== 'fight') return;
    const enemies = this.bots.filter(b => b.team !== this.myTeam && b.alive).length, mates = this.bots.filter(b => b.team === this.myTeam && b.alive).length + (G.dead ? 0 : 1);
    if (!enemies) this.roundOver(G, true); else if (!mates) this.roundOver(G, false);
  },
  checkFfa(G) {
    const t = G.modeOpts.target;
    if (G.score >= t) G.end({ win: true, title: 'You win the match!', stats: this.stats(G) });
    else { const top = this.bots.find(b => b.data.splats >= t); if (top) G.end({ win: false, title: `${top.name} wins the match`, stats: this.stats(G) }); }
  },
  stats(G) { return [['Splats', this.splats], ['Times splatted', G.deaths], ['Accuracy', this.shots ? Math.round((this.hits / this.shots) * 100) + '%' : '—']]; },
  onDeath(G, why) {
    G.setPublic({ hp: 0, dead: true });
    if (this.format === 'room' && G.lastHitBy && G.lastHitBy !== 'me') Shared.act('down', { by: G.lastHitBy });
    if (why !== 'reset' && G.lastHitBy && G.lastHitBy.data) G.lastHitBy.data.splats++;
    if (this.format === 'duel' || this.format === 'teams') { this.checkRound(G); return true; }
    if (this.format === 'ffa') this.checkFfa(G);
    this.respawnIn = 3; return true;
  },
  onRespawn(G) { G.setPublic({ hp: G.hp, dead: false }); this.ammo = BLASTERS[this.weapon].mag; this.reloadT = 0; G.hud.stat('ammo', `${this.ammo} / ${BLASTERS[this.weapon].mag}`, { icon: 'blaster' }); },
  onAct(from, kind, d, G) {
    if (kind === 'hit' && d && d.to === G.myPeer() && !from.isMe) { G.damage(clamp(Number(d.dmg) || 0, 0, 60), from.peer); G.setPublic({ hp: Math.round(G.hp), dead: G.dead }); }
    if (kind === 'down' && d && d.by === G.myPeer() && !from.isMe) { this.splats++; G.addScore(1); G.hud.flash(`You splatted ${from.name}!`, 'good', 1000); }
  },
  hostState(G) {
    if (this.format !== 'room') return null;
    if (!this.winner) { const t = G.modeOpts.target; if (G.score >= t) this.winner = { peer: G.myPeer(), name: Profile.displayName() }; else for (const o of G.others()) if (o.sc >= t) { this.winner = { peer: o.peer, name: o.name }; break; } }
    return { w: this.winner };
  },
  onShared(st, G) { if (st && st.w && !G.ended) this.endRoom(G, st.w); },
  endRoom(G, w) { const me = w.peer === G.myPeer(); G.end({ win: me, title: me ? 'You win the match!' : `${w.name} wins the match`, stats: this.stats(G) }); },
  // ---- per frame ----
  update(dt, G) {
    const o = G.modeOpts, w = BLASTERS[this.weapon];
    ArenaShots.update(dt, G, this);
    if (G.ended) return;
    if (!this.mp && G.others().length && !this.joinNote) { this.joinNote = true; G.hud.flash('A player joined. Play again for a room match', 'info', 2600); }
    if (this.format === 'room' && this.winner && Shared.isHost()) this.endRoom(G, this.winner);
    // phases
    if (this.phase === 'pick' || this.phase === 'count' || this.phase === 'roundEnd') this.t -= dt;
    if (this.phase === 'pick') { const el = document.getElementById('ar-pick-t'); if (el) el.textContent = `Round starts in ${Math.ceil(this.t)}`; if (this.t <= 0) { this.hidePick(); this.phase = 'count'; this.t = 3.2; } }
    else if (this.phase === 'count') { const n = Math.ceil(this.t); if (n !== this.lastN) { this.lastN = n; if (n > 0 && n <= 3) { G.hud.flash(String(n), 'info', 700); Sfx.play('tick'); } } if (this.t <= 0) { this.phase = 'fight'; G.frozen = false; G.hud.flash('Go!', 'good', 700); Sfx.play('boost'); } }
    else if (this.phase === 'roundEnd' && this.t <= 0) {
      if (this.wins[0] >= o.rounds || this.wins[1] >= o.rounds) { const win = this.wins[0] >= o.rounds; G.end({ win, title: win ? 'You win the match!' : 'Your rival wins the match', sub: `Rounds ${this.wins[0]} - ${this.wins[1]}`, stats: this.stats(G) }); return; }
      this.nextRound(G);
    }
    if (this.respawnIn > 0 && (this.respawnIn -= dt) <= 0) { const sp = this.spawnPos(0, Math.floor(G.R() * 6)); G.setCheckpoint(sp); G.respawn(true); }
    // player firing
    this.cool -= dt;
    if (this.reloadT > 0 && (this.reloadT -= dt) <= 0) { this.ammo = w.mag; G.hud.stat('ammo', `${this.ammo} / ${w.mag}`, { icon: 'blaster' }); }
    const canFire = this.phase === 'fight' && !G.dead && !G.menuOpen && this.reloadT <= 0;
    if (canFire && this.firing && this.cool <= 0 && (w.auto || this.trigger)) {
      if (this.ammo <= 0) this.startReload(G);
      else {
        this.trigger = false; this.cool = w.rate; this.ammo--; this.shots += w.pellets;
        this.shoot(G, G.handPos(), G.aimPoint(200), w, 'me', this.myTeam, this.myColor);
        G.hud.stat('ammo', `${this.ammo} / ${w.mag}`, { icon: 'blaster' });
        if (this.ammo <= 0) this.startReload(G);
      }
    }
    if (this.format === 'ffa' || this.format === 'room') G.hud.stat('splats', `${G.score} / ${o.target}`, { icon: 'target' });
    if (this.format === 'ffa') G.hud.board([{ name: Profile.displayName(), value: G.score, me: true }, ...this.bots.map(b => ({ name: b.name, value: b.data.splats }))].sort((a, b) => b.value - a.value), 'Splats');
    // bots
    for (const b of this.bots) this.botThink(b, dt, G);
  },
  botThink(b, dt, G) {
    const d = b.data;
    if (!b.alive) { if (this.format === 'ffa' && d.respawnT > 0 && (d.respawnT -= dt) <= 0) b.respawn(this.spawnPos(b.team, Math.floor(G.R() * 6))); return; }
    if (this.phase !== 'fight') { b.stop(); return; }
    // nearest enemy: the player, or bots of the other team
    let tgt = null, tpos = null, best = 1e9;
    const consider = (pos, ref) => { const dd = b.dist(pos); if (dd < best) { best = dd; tgt = ref; tpos = pos; } };
    if (!G.dead && (this.format === 'ffa' || b.team !== this.myTeam)) consider(G.body.pos, 'me');
    for (const o of this.bots) if (o !== b && o.alive && (this.format === 'ffa' || o.team !== b.team)) consider(o.pos, o);
    if (!tgt) { b.stop(); return; }
    const w = BLASTERS[d.weapon], [near, far] = w.range;
    const eye = this.eye || (this.eye = new THREE.Vector3()), to = this.to || (this.to = new THREE.Vector3());
    eye.set(b.pos.x, b.pos.y + 1.6, b.pos.z); to.set(tpos.x, tpos.y + 1.3, tpos.z);
    const dist = eye.distanceTo(to), dir = to.clone().sub(eye).normalize(), ray = Phys.raycast(eye, dir, dist);
    const los = !ray || ray.t > dist - 0.6;
    b.face(tpos.x, tpos.z);
    // movement: hold range, strafe, sometimes jump
    if ((d.strafeT -= dt) <= 0) { d.strafeT = 0.8 + G.R() * 1.4; d.strafe = G.R() < 0.5 ? -1 : 1; }
    const fx = (tpos.x - b.pos.x) / (best || 1), fz = (tpos.z - b.pos.z) / (best || 1);
    let mx = -fz * d.strafe * 0.8, mz = fx * d.strafe * 0.8;
    if (!los || best > far) { mx += fx; mz += fz; } else if (best < near) { mx -= fx * 0.8; mz -= fz * 0.8; }
    const l = Math.hypot(mx, mz) || 1; b.move.x = mx / l; b.move.z = mz / l;
    if ((d.jumpT -= dt) <= 0) { d.jumpT = 1.5 + G.R() * 3; if (G.R() < 0.4) b.jump(); }
    // shooting
    d.cool -= dt;
    if (d.reload > 0) { if ((d.reload -= dt) <= 0) d.ammo = w.mag; return; }
    if (los && d.cool <= 0 && best < far * 1.6) {
      if (d.ammo <= 0) { d.reload = w.reload; return; }
      d.cool = w.rate * (w.auto ? 1.6 : 1.15) + G.R() * 0.15; d.ammo--;
      const err = Math.max(0.25, d.err - G.time * 0.004) * (0.5 + dist / 30);
      const tv = tgt === 'me' ? G.body.vel : tgt.body.vel, lead = dist / w.speed * 0.6;
      const aim = to.clone().add(new THREE.Vector3(tv.x * lead + (G.R() - 0.5) * err * 2, (G.R() - 0.5) * err, tv.z * lead + (G.R() - 0.5) * err * 2));
      const color = this.format === 'ffa' ? ['#FF6A2B', '#2D9CF0', '#7CFF6B', '#FF5CA8'][(this.bots.indexOf(b) + 1) % 4] : TEAM_COLORS[b.team];
      this.shoot(G, new THREE.Vector3(b.pos.x, b.pos.y + 1.3, b.pos.z), aim, w, b, b.team, color);
    }
  },
};

// Hold the glowing hill to score. Shove rivals off it.
Modes.koth = {
  label: 'King of the Hill', hint: 'WASD to move · Space to jump · E to shove · Stand on the glowing hill',
  setup(G) {
    this.hills = G.partsByTag('hill'); this.cur = 0; this.moveT = 30; this.pts = { me: 0 }; this.cool = 0;
    this.hills.forEach((h, i) => G.setPartVisible(h.id, i === 0));
    const sp = G.partsByTag('spawnpoint');
    this.bots = ['Brick', 'Juno', 'Mo'].map((n, i) => { const s = sp[(i + 1) % sp.length]; const b = G.bots.add({ name: n, pos: [s.pos[0], 0.4, s.pos[2]], speed: 0.85 + i * 0.05, seed: n }); b.data = { pts: 0, cool: 1 + i, home: [s.pos[0], 0.4, s.pos[2]] }; return b; });
    G.addAction({ id: 'shove', label: 'Shove', icon: 'hand', key: 'KeyE', keyLabel: 'E', primary: true, onDown: () => this.shove(G) });
    G.hud.objective('Stand on the glowing hill to score. First to 100 wins');
    G.hud.stat('pts', '0 / 100', { icon: 'trophy', label: 'Points' });
    G.hud.stat('move', '0:30', { icon: 'clock', label: 'Hill moves in' });
  },
  shove(G) {
    if (this.cool > 0 || G.dead) return; this.cool = 0.8;
    const f = G.facing, fx = Math.sin(f), fz = Math.cos(f);
    for (const b of this.bots) { if (!b.alive) continue; const dx = b.pos.x - G.body.pos.x, dz = b.pos.z - G.body.pos.z, d = Math.hypot(dx, dz); if (d < 3.6 && (dx * fx + dz * fz) / (d || 1) > 0.2) arenaShove(G, G.body.pos, b, 16); }
    Sfx.play('whoosh');
  },
  onHill(pos) { const h = this.hills[this.cur]; return Math.hypot(pos.x - h.pos[0], pos.z - h.pos[2]) < 4 && pos.y > 1 && pos.y < 3.5; },
  update(dt, G) {
    if (G.ended) return;
    this.cool -= dt;
    if ((this.moveT -= dt) <= 0) {
      this.moveT = 30; G.setPartVisible(this.hills[this.cur].id, false); this.cur = (this.cur + 1 + Math.floor(G.R() * (this.hills.length - 1))) % this.hills.length;
      G.setPartVisible(this.hills[this.cur].id, true); G.hud.flash('The hill moved!', 'info', 1400); Sfx.play('alarm');
    }
    G.hud.stat('move', fmtClock(this.moveT), { icon: 'clock' });
    const on = [];
    if (!G.dead && this.onHill(G.body.pos)) on.push('me');
    for (const b of this.bots) if (b.alive && this.onHill(b.pos)) on.push(b);
    if (on.length === 1) { const w = on[0], add = 4 * dt; if (w === 'me') { this.pts.me += add; G.setScore(Math.floor(this.pts.me)); } else w.data.pts += add; }
    G.hud.stat('pts', `${Math.floor(this.pts.me)} / 100`, { icon: 'trophy', warn: on.length > 1 && on.includes('me') });
    G.hud.prompt(on.includes('me') ? (on.length > 1 ? 'Contested! Shove them off' : 'Scoring!') : null);
    G.hud.board([{ name: Profile.displayName(), value: Math.floor(this.pts.me), me: true }, ...this.bots.map(b => ({ name: b.name, value: Math.floor(b.data.pts) }))].sort((a, b) => b.value - a.value), 'Points');
    const h = this.hills[this.cur];
    for (const b of this.bots) {
      if (!b.alive) continue;
      b.goTo(h.pos[0] + Math.sin(b.t + b.id.length) * 1.5, h.pos[2] + Math.cos(b.t * 0.7) * 1.5, 0.4);
      if ((b.data.cool -= dt) <= 0) {
        b.data.cool = 1.4 + G.R();
        const targets = [['me', G.body.pos], ...this.bots.filter(o => o !== b && o.alive).map(o => [o, o.pos])];
        for (const [who, pos] of targets) { if (who === 'me' && G.dead) continue; if (b.dist(pos) < 3.2) { arenaShove(G, b.pos, who, 13); break; } }
      }
    }
    if (this.pts.me >= 100) G.end({ win: true, title: 'King of the Hill!', stats: [['Points', 100], ['Falls', G.deaths]] });
    else { const top = this.bots.find(b => b.data.pts >= 100); if (top) G.end({ win: false, title: `${top.name} rules the hill`, stats: [['Your points', Math.floor(this.pts.me)]] }); }
  },
  onBotDown(bot, why, G) { setTimeout(() => { if (G.mode === this && !G.ended) bot.respawn(bot.data.home); }, 2000); },
};

// Shove everyone off a shrinking sky platform. Best of three rounds.
Modes.knockout = {
  label: 'Push Party', hint: 'WASD to move · Space to jump · E to shove · Be the last one standing',
  setup(G) {
    this.round = 0; this.wins = 0; this.losses = 0; this.cool = 0;
    G.addAction({ id: 'shove', label: 'Shove', icon: 'hand', key: 'KeyE', keyLabel: 'E', primary: true, onDown: () => this.shove(G) });
    G.hud.objective('Shove the others off. Last one standing wins the round');
    this.bots = ['Bonk', 'Wiggles', 'Taffy'].map((n, i) => { const b = G.bots.add({ name: n, pos: [0, 1, 0], speed: 0.9, seed: n }); b.data = { cool: 1 }; return b; });
    this.next(G);
  },
  next(G) {
    this.round++; this.t = 0; this.phase = 'count'; this.cd = 3; G.frozen = true;
    for (const tag of ['ring1', 'ring2', 'ring3']) for (const p of G.partsByTag(tag)) { G.setPartVisible(p.id, true); G.setPartSolid(p.id, true); }
    const sp = G.partsByTag('spawnpoint');
    G.setCheckpoint([sp[0].pos[0], 0.6, sp[0].pos[2]], sp[0].bp.yaw); G.respawn(false);
    this.bots.forEach((b, i) => b.respawn([sp[i + 1].pos[0], 0.7, sp[i + 1].pos[2]]));
    G.hud.stat('round', `Round ${this.round} of 3`, { icon: 'flag', label: 'Round' }); G.hud.stat('wins', `${this.wins} won`, { icon: 'trophy', label: 'Rounds won' });
    G.hud.flash('Round ' + this.round, 'info', 1100);
  },
  shove(G) {
    if (this.cool > 0 || G.dead || this.phase !== 'fight') return; this.cool = 0.7;
    const f = G.facing, fx = Math.sin(f), fz = Math.cos(f);
    for (const b of this.bots) { if (!b.alive) continue; const dx = b.pos.x - G.body.pos.x, dz = b.pos.z - G.body.pos.z, d = Math.hypot(dx, dz); if (d < 3.6 && (dx * fx + dz * fz) / (d || 1) > 0.2) arenaShove(G, G.body.pos, b, 17); }
    Sfx.play('whoosh');
  },
  update(dt, G) {
    if (G.ended) return;
    this.cool -= dt;
    if (this.phase === 'count') { this.cd -= dt; const n = Math.ceil(this.cd); if (n !== this.lastN) { this.lastN = n; if (n > 0) { G.hud.flash(String(n), 'info', 600); Sfx.play('tick'); } } if (this.cd <= 0) { this.phase = 'fight'; G.frozen = false; G.hud.flash('Push!', 'good', 700); } return; }
    if (this.phase === 'after') { if ((this.cd -= dt) <= 0) { if (this.round >= 3 || this.wins >= 2 || this.losses >= 2) G.end({ win: this.wins >= 2, title: this.wins >= 2 ? 'Push Party champion!' : 'Knocked out of the party', stats: [['Rounds won', this.wins], ['Rounds lost', this.losses]] }); else this.next(G); } return; }
    this.t += dt;
    for (const [tag, at] of [['ring3', 25], ['ring2', 50]]) if (this.t >= at && this.t - dt < at) { for (const p of G.partsByTag(tag)) { G.setPartVisible(p.id, false); G.setPartSolid(p.id, false); } G.hud.flash('The floor is shrinking!', 'bad', 1400); Sfx.play('break'); }
    for (const b of this.bots) {
      if (!b.alive) continue;
      const others = [[G.body.pos, 'me'], ...this.bots.filter(o => o !== b && o.alive).map(o => [o.pos, o])].filter(([, w]) => w !== 'me' || !G.dead);
      if (!others.length) { b.stop(); continue; }
      others.sort((a, c) => b.dist(a[0]) - b.dist(c[0]));
      const [pos, who] = others[0], r = Math.hypot(b.pos.x, b.pos.z);
      if (r > 11 - (this.t > 25 ? 5 : 0) - (this.t > 50 ? 5 : 0)) b.goTo(0, 0, 0.5); else b.goTo(pos.x, pos.z, 1.2);
      if ((b.data.cool -= dt) <= 0 && b.dist(pos) < 3) { b.data.cool = 1.1 + G.R(); arenaShove(G, b.pos, who, 13); }
    }
    const left = this.bots.filter(b => b.alive).length;
    if (!G.dead && left === 0) { this.wins++; this.phase = 'after'; this.cd = 2.4; G.hud.flash('You won the round!', 'good', 1800); Sfx.play('checkpoint'); }
  },
  onDeath(G) { this.losses++; this.phase = 'after'; this.cd = 2.4; G.hud.flash('You fell off!', 'bad', 1800); return true; },
  onBotDown(bot, why, G) { G.hud.flash(bot.name + ' is out!', 'info', 800); },
};

// Two teams paint the floor by shooting it and walking over it. Most tiles after 90 seconds wins.
Modes.paintpark = Object.assign({}, Modes.rivals, {
  label: 'Paint the Park', hint: 'WASD to move · Click to shoot paint · Space to jump · Cover the floor in orange',
  defaults: { format: 'teams', weapons: ['splatter'], rounds: 1, time: 90 },
  setup(G) {
    this.tiles = G.partsByTag('ptile'); this.owner = new Map(); this.timeLeft = G.modeOpts.time || 90;
    Modes.rivals.setup.call(this, G);
    this.phase = 'fight'; G.frozen = false; this.hidePick();
    G.hud.objective('Paint more of the park orange than the blue team');
    G.hud.removeStat('score');
    this.format = 'paint';
    this.bots.forEach(b => { b.data.weapon = 'splatter'; b.data.ammo = 30; });
  },
  paint(id, team, G) { if (this.owner.get(id) === team) return; this.owner.set(id, team); G.setPartColor(id, TEAM_COLORS[team]); },
  shotWorld(s, h, G) { const p = h.c && h.c.part; if (p && p.tag === 'ptile') this.paint(p.id, s.team, G); else { const g = Phys.pointHit(h.point.x, h.point.y - 0.3, h.point.z, 0.5); if (g && g.part.tag === 'ptile') this.paint(g.part.id, s.team, G); } },
  shotTarget(s, pt, G) {
    if (s.owner !== 'me' && !G.dead && s.team !== this.myTeam && hitCapsule(G.body.pos, pt, s.size)) return { me: true };
    const bot = G.bots.hitTest(pt, s.size, s.owner === 'me' ? null : s.owner); if (bot && bot.team !== s.team) return { bot };
    return null;
  },
  checkRound() {}, checkFfa() {},
  onBotDown(bot, why, G) { bot.data.respawnT = 3; if (why === 'me') { this.splats++; G.addScore(1); } },
  onDeath(G) { this.respawnIn = 3; return true; },
  update(dt, G) {
    Modes.rivals.update.call(this, dt, G);
    if (G.ended) return;
    this.timeLeft -= dt; G.hud.stat('time', fmtClock(this.timeLeft), { icon: 'clock', warn: this.timeLeft < 10 });
    const g = G.body.groundC; if (!G.dead && g && g.part.tag === 'ptile') this.paint(g.part.id, this.myTeam, G);
    for (const b of this.bots) {
      if (!b.alive) { if ((b.data.respawnT -= dt) <= 0) b.respawn(this.spawnPos(b.team, 1 + this.bots.indexOf(b))); continue; }
      const bg = b.body.groundC; if (bg && bg.part.tag === 'ptile') this.paint(bg.part.id, b.team, G);
      if (!b.data.target || G.R() < dt * 0.4) { const cand = this.tiles.filter(t => this.owner.get(t.id) !== b.team); b.data.target = cand.length ? pick(G.R, cand) : null; }
      if (b.data.target && Math.hypot(b.pos.x - b.data.target.pos[0], b.pos.z - b.data.target.pos[2]) > 6) { b.move.x = b.data.target.pos[0] - b.pos.x; b.move.z = b.data.target.pos[2] - b.pos.z; const l = Math.hypot(b.move.x, b.move.z) || 1; b.move.x /= l; b.move.z /= l; }
    }
    let mine = 0, theirs = 0; for (const v of this.owner.values()) v === 0 ? mine++ : theirs++;
    G.hud.stat('paint', `Orange ${Math.round(mine / this.tiles.length * 100)}% · Blue ${Math.round(theirs / this.tiles.length * 100)}%`, { icon: 'drop', label: 'Paint' });
    if (this.timeLeft <= 0) G.end({ win: mine > theirs, title: mine > theirs ? 'Your team painted the park!' : mine === theirs ? "It's a tie!" : 'The blue team wins', stats: [['Orange', Math.round(mine / this.tiles.length * 100) + '%'], ['Blue', Math.round(theirs / this.tiles.length * 100) + '%'], ['Splats', this.splats]] });
  },
});

registerGames([
  { id: 'splat-rivals', title: 'Splat Rivals', cat: 'featured', featured: true, mode: 'rivals', modeOpts: { format: 'duel', rounds: 5, rivalName: 'Rex' }, env: { sky: 'day' }, accent: '#FF6A2B', icon: 'blaster', tags: ['bots', 'pvp'],
    desc: 'A round-based foam blaster duel. Pick Splatter, Popper or Long Shot each round and splat your rival first. First to five rounds wins.',
    build: arenaMap({ floor: '#E9E4D8', floorMat: 'plastic', wall: '#FFFFFF', center: '#FFC53A', colors: ['#FF6A2B', '#2D9CF0', '#7CFF6B', '#FF5CA8', '#FFC53A'], cover: ['crate', 'wall', 'pillar'], splats: true, ground: '#6CC38A' }), thumb: { pos: [26, 18, 30], look: [0, 0, 0] } },
  { id: 'snowball-siege', title: 'Snowball Siege', cat: 'arena', mode: 'rivals', modeOpts: { format: 'teams', weapons: ['snow'], rounds: 4 }, env: { sky: 'snow' }, accent: '#CFEFFF', icon: 'target', tags: ['bots'],
    desc: 'Two against two in a winter fort. Lob snowballs over the snow walls with your teammate. First team to four rounds.',
    build: arenaMap({ floor: '#F4F8FC', floorMat: 'sand', wall: '#DDE8F4', wallMat: 'sand', center: '#CFEFFF', centerMat: 'ice', colors: ['#EDF4FA', '#CFE3F2'], cover: ['snow', 'snow', 'wall', 'tree'], ground: '#F4F8FC', groundMat: 'sand' }), thumb: { pos: [26, 18, 30], look: [0, 0, 0] } },
  { id: 'laser-lights', title: 'Laser Lights', cat: 'arena', mode: 'rivals', modeOpts: { format: 'ffa', weapons: ['laser'], target: 15 }, env: { sky: 'neon' }, accent: '#4CF0FF', icon: 'bolt', tags: ['bots'],
    desc: 'A glowing free-for-all against three bots with rapid light bolts. First to 15 splats.',
    build: arenaMap({ floor: '#1A1030', floorMat: 'metal', wall: '#2A1C4A', wallMat: 'metal', trim: '#4CF0FF', center: '#7A4FD0', centerMat: 'metal', colors: ['#2A1C4A', '#3A2860', '#7A4FD0'], cover: ['wall', 'pillar', 'crate'], crateMat: 'metal' }), thumb: { pos: [26, 18, 30], look: [0, 0, 0] } },
  { id: 'king-of-the-hill', title: 'King of the Hill', cat: 'arena', mode: 'koth', env: { sky: 'day' }, accent: '#FFE07A', icon: 'trophy', killY: -8, tags: ['bots'],
    desc: 'Stand on the glowing hill to score while three bots try to shove you off. It moves every 30 seconds.', build: arenaHillMap, thumb: { pos: [36, 26, 36], look: [0, 0, 0] } },
  { id: 'push-party', title: 'Push Party', cat: 'arena', mode: 'knockout', env: { sky: 'sunset' }, accent: '#FFC53A', icon: 'hand', killY: -10, tags: ['bots'],
    desc: 'Shove three bots off a floating platform that shrinks as the round goes on. Best of three.', build: arenaPushMap, thumb: { pos: [24, 20, 24], look: [0, 0, 0] } },
  { id: 'paint-the-park', title: 'Paint the Park', cat: 'arena', mode: 'paintpark', env: { sky: 'day' }, accent: '#FF6A2B', icon: 'drop', tags: ['bots'],
    desc: 'Your team paints the park orange, theirs paints it blue. Shoot the floor, walk over it, and own the most after 90 seconds.', build: arenaPaintMap, thumb: { pos: [30, 26, 34], look: [0, 0, 0] } },
]);
