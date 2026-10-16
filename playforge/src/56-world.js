/* ---------- 10. World: environments, parts, moving parts ---------- */
// Sky presets. fog scales the graphics preset's fog distances; gravity scales physics gravity.
const ENV = {
  day: { top: '#3B7DE8', horizon: '#CFE6FF', bottom: '#E4F0F7', sun: '#FFF4E0', sunI: 0.82, hemiSky: '#DCEBFF', hemiGround: '#5E6F4E', hemiI: 0.72, fog: 1, clouds: true, stars: 0, sunDir: [0.45, 0.78, 0.32] },
  sunset: { top: '#3A3F8F', horizon: '#FFB27A', bottom: '#FFD9B8', sun: '#FFC08A', sunI: 0.9, hemiSky: '#FFD2B0', hemiGround: '#5A4A5E', hemiI: 0.62, fog: 0.9, clouds: true, stars: 0, sunDir: [0.8, 0.25, 0.3] },
  night: { top: '#060A1A', horizon: '#1C2A52', bottom: '#0B1022', sun: '#9DB4FF', sunI: 0.32, hemiSky: '#4A5E9A', hemiGround: '#141A2A', hemiI: 0.42, fog: 0.6, clouds: false, stars: 1, sunDir: [-0.3, 0.7, 0.4] },
  space: { top: '#02030A', horizon: '#0E1430', bottom: '#02030A', sun: '#FFFFFF', sunI: 1, hemiSky: '#8090C0', hemiGround: '#202030', hemiI: 0.5, fog: 2.5, clouds: false, stars: 1, gravity: 0.4, sunDir: [0.5, 0.6, 0.4] },
  candy: { top: '#FF9ACB', horizon: '#FFE3F1', bottom: '#FFF1F8', sun: '#FFF0F6', sunI: 0.8, hemiSky: '#FFE0F0', hemiGround: '#B07AA8', hemiI: 0.75, fog: 1, clouds: true, stars: 0, sunDir: [0.4, 0.8, 0.3] },
  haunted: { top: '#150B26', horizon: '#4B2E66', bottom: '#1A1026', sun: '#C9A8FF', sunI: 0.4, hemiSky: '#6B4A8F', hemiGround: '#1A1424', hemiI: 0.5, fog: 0.45, clouds: false, stars: 0.7, sunDir: [-0.4, 0.6, 0.3] },
  desert: { top: '#4A8FE0', horizon: '#F6D9A8', bottom: '#F2E2C4', sun: '#FFE7BF', sunI: 0.95, hemiSky: '#FFE6C4', hemiGround: '#9C7A4E', hemiI: 0.7, fog: 0.85, clouds: false, stars: 0, sunDir: [0.3, 0.85, 0.2] },
  snow: { top: '#7FA8D8', horizon: '#E8F0F8', bottom: '#F4F8FC', sun: '#FFFFFF', sunI: 0.8, hemiSky: '#F0F6FF', hemiGround: '#9AA8B8', hemiI: 0.8, fog: 0.75, clouds: true, stars: 0, sunDir: [0.4, 0.6, 0.5] },
  cave: { top: '#0C0F14', horizon: '#1E2630', bottom: '#0C0F14', sun: '#FFD9A0', sunI: 0.5, hemiSky: '#5A6676', hemiGround: '#1A1F26', hemiI: 0.55, fog: 0.35, clouds: false, stars: 0, sunDir: [0.2, 0.9, 0.1] },
  neon: { top: '#0A0420', horizon: '#3A1060', bottom: '#0A0420', sun: '#C0A0FF', sunI: 0.45, hemiSky: '#7A5ACF', hemiGround: '#1A1030', hemiI: 0.62, fog: 0.8, clouds: false, stars: 1, sunDir: [0.3, 0.7, 0.4] },
  forest: { top: '#5C8FC4', horizon: '#CFE3D8', bottom: '#DCE9E0', sun: '#FFF0D0', sunI: 0.75, hemiSky: '#D8EBDC', hemiGround: '#3E5A3A', hemiI: 0.7, fog: 0.6, clouds: true, stars: 0, sunDir: [0.4, 0.75, 0.35] },
};
const ENV_KEYS = Object.keys(ENV);
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, clamp(-h * 5.0, 0.0, 1.0));
  float s = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(s, 900.0) * 1.4 + pow(s, 14.0) * 0.16);
  gl_FragColor = vec4(col, 1.0); }`;

// Part factory used by every level generator and by Studio.
let PART_SEQ = 0;
const BEHAVIORS = ['none', 'kill', 'damage', 'checkpoint', 'finish', 'coin', 'bounce', 'speed', 'spin', 'move', 'swing', 'vanish', 'fake', 'teleport'];
const KINEMATIC = { spin: 1, move: 1, swing: 1 };
function mkPart(shape, pos, size, color, material = 'plastic', x = {}) {
  return Object.assign({ id: 'p' + (++PART_SEQ), name: x.name || (shape[0].toUpperCase() + shape.slice(1)), shape, pos, size, rot: [0, 0, 0], color, material, anchored: true, canCollide: true, transparency: 0 }, x);
}
const finite3 = (a, d) => (Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every(Number.isFinite) ? a.slice(0, 3).map(Number) : d.slice());
function normPart(p) {
  const q = Object.assign({ shape: 'block', color: '#A9B4C2', material: 'plastic', anchored: true, canCollide: true, transparency: 0 }, p);
  q.id = String(p.id || 'p' + (++PART_SEQ));
  q.name = String(q.name || q.shape).slice(0, 40);
  q.pos = finite3(p.pos, [0, 0, 0]); q.rot = finite3(p.rot, [0, 0, 0]);
  q.size = finite3(p.size, [4, 1, 4]).map(v => clamp(Math.abs(v), 0.05, 2048));
  q.color = normHex(q.color) || '#A9B4C2';
  if (!TILE[q.material]) q.material = 'plastic';
  q.transparency = clamp(Number(q.transparency) || 0, 0, 1);
  if (q.behavior === 'none' || !BEHAVIORS.includes(q.behavior)) delete q.behavior;
  if (q.bp && typeof q.bp !== 'object') delete q.bp;
  return q;
}
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

const World = {
  scene: null, def: null, env: null, editing: false, parts: [], meshes: new Map(), solid: [], kin: [], spinners: [], spawn: null, spawnYaw: Math.PI,
  sky: null, hemi: null, sun: null, clouds: null, stars: null, sunDir: null, _ca: null, _cb: null,
  time() { return (Date.now() % 3600000) / 1000; }, // shared clock so moving parts line up for every player
  // Parts and spawn for a game definition. Built-in games generate their level from a seeded generator.
  generate(def) {
    let out = def.parts ? { parts: def.parts } : def.build ? def.build(rng(hashStr(def.id || 'x'))) : { parts: [] };
    if (Array.isArray(out)) out = { parts: out };
    const parts = (out.parts || []).filter(p => p && p.shape !== 'group').map(normPart);
    let spawn = out.spawn || def.spawn;
    if (!spawn) { const sp = parts.find(p => p.shape === 'spawn'); spawn = sp ? [sp.pos[0], sp.pos[1] + sp.size[1] / 2, sp.pos[2]] : [0, 3, 0]; }
    return { parts, spawn: finite3(spawn, [0, 3, 0]), spawnYaw: Number.isFinite(out.spawnYaw) ? out.spawnYaw : Number.isFinite(def.spawnYaw) ? def.spawnYaw : Math.PI };
  },
  load(def, opts = {}) {
    this.unload();
    if (!SPHERE_GEO) { SPHERE_GEO = new THREE.SphereGeometry(0.5, 24, 16); CYL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); }
    const scene = new THREE.Scene(); this.scene = scene; this.def = def; this.editing = !!opts.edit;
    const g = this.generate(def);
    this.env = Object.assign({}, ENV.day, ENV[(def.env && def.env.sky) || 'day'] || {}, def.env || {});
    scene.fog = new THREE.Fog(new THREE.Color(this.env.horizon), 70, 270);
    this.sunDir = new THREE.Vector3();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: this.sunDir }, sunCol: { value: new THREE.Color() } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    }));
    sky.frustumCulled = false; sky.renderOrder = -2; scene.add(sky); this.sky = sky;
    this.hemi = new THREE.HemisphereLight('#DCEBFF', '#5E6F4E', 0.72); scene.add(this.hemi);
    const sun = new THREE.DirectionalLight('#FFF4E0', 0.82); this.sun = sun;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
    scene.add(sun); scene.add(sun.target);
    // Blocky clouds and stars, one draw call each.
    const R = rng(42), puffs = [];
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, rad = 120 + R() * 220, cx = Math.cos(a) * rad, cz = Math.sin(a) * rad, cy = 85 + R() * 30;
      for (let k = 0; k < 5; k++) puffs.push([cx + (R() - 0.5) * 26, cy + R() * 4, cz + (R() - 0.5) * 18, 10 + R() * 16, 4 + R() * 3, 8 + R() * 10]);
    }
    const clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#FFFFFF', emissive: '#AFC4E4', emissiveIntensity: 0.45, fog: false }), puffs.length);
    const m4 = new THREE.Matrix4();
    puffs.forEach((p, i) => { m4.makeScale(p[3], p[4], p[5]); m4.setPosition(p[0], p[1], p[2]); clouds.setMatrixAt(i, m4); });
    clouds.frustumCulled = false; scene.add(clouds); this.clouds = clouds;
    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) { const u = R() * 2 - 1, th = R() * Math.PI * 2, y = Math.abs(u) * 0.9 + 0.08, rr = Math.sqrt(1 - y * y); sp.set([Math.cos(th) * rr * 420, y * 420, Math.sin(th) * rr * 420], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#FFFFFF', size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    this.stars.frustumCulled = false; this.stars.renderOrder = -1; scene.add(this.stars);
    // Parts
    this.parts = []; this.meshes = new Map(); this.solid = []; this.kin = []; this.spinners = [];
    if (!this.editing) Phys.setParts([]);
    for (const p of g.parts) this.addPart(p);
    this.spawn = new THREE.Vector3(g.spawn[0], g.spawn[1], g.spawn[2]); this.spawnYaw = g.spawnYaw;
    Phys.params.gravity = 50 * (Number(this.env.gravity) || 1);
    this.setEnv(this.env); this.applyPreset();
    scene.updateMatrixWorld(true);
    return this;
  },
  unload() {
    if (!this.scene) return;
    for (const m of this.meshes.values()) if (m.geometry !== SPHERE_GEO && m.geometry !== CYL_GEO) m.geometry.dispose();
    this.sky.geometry.dispose(); this.sky.material.dispose(); this.clouds.geometry.dispose(); this.clouds.material.dispose();
    this.stars.geometry.dispose(); this.stars.material.dispose();
    this.scene = null; this.meshes = new Map(); this.parts = []; this.solid = []; this.kin = []; this.spinners = [];
  },
  addPart(raw) {
    const p = raw.id && raw.pos && raw.size && raw.rot ? raw : normPart(raw);
    const m = buildPartMesh(p); m.userData.part = p;
    this.scene.add(m); this.meshes.set(p.id, m); this.parts.push(p);
    if (p.canCollide !== false && !(p.transparency > 0.6)) this.solid.push(m);
    if (!this.editing) {
      const c = Phys.addPart(p);
      if (KINEMATIC[p.behavior]) {
        const bp = p.bp || {}, q0 = m.quaternion.clone(), base = m.position.clone();
        const axis = (AXES[bp.axis] || (p.behavior === 'swing' ? AXES.z : AXES.y)).clone();
        const pv = finite3(bp.pivot, [0, p.size[1] / 2, 0]);
        this.kin.push({ p, m, c, base, q0, axis, off: new THREE.Vector3(...finite3(bp.offset, [0, 0, 6])), pivot: base.clone().add(new THREE.Vector3(...pv)) });
        m.matrixAutoUpdate = true;
      } else if (p.behavior === 'coin') { this.spinners.push({ m, q0: m.quaternion.clone(), base: m.position.clone(), ph: hashStr(p.id) % 100 / 16 }); m.matrixAutoUpdate = true; }
    }
    return m;
  },
  removePart(id) {
    const m = this.meshes.get(id); if (!m) return;
    this.scene.remove(m); this.meshes.delete(id);
    if (m.geometry !== SPHERE_GEO && m.geometry !== CYL_GEO) m.geometry.dispose();
    this.parts = this.parts.filter(p => p.id !== id); this.solid = this.solid.filter(x => x !== m);
    this.kin = this.kin.filter(k => k.m !== m); this.spinners = this.spinners.filter(k => k.m !== m);
    if (!this.editing) Phys.removePart(id);
  },
  // Rebuild a part's mesh (and collider) after its data changed. Used by Studio.
  refreshPart(p) {
    const i = this.parts.findIndex(x => x.id === p.id); if (i < 0) return this.addPart(p);
    const sel = this.meshes.get(p.id); const vis = sel ? sel.visible : true;
    this.removePart(p.id); const m = this.addPart(p); m.visible = vis;
    const j = this.parts.indexOf(p); if (j >= 0 && j !== i) { this.parts.splice(j, 1); this.parts.splice(i, 0, p); }
    return m;
  },
  mesh(id) { return this.meshes.get(id) || null; },
  part(id) { return this.parts.find(p => p.id === id) || null; },
  // Moving parts follow the shared clock. Called once per physics step.
  updateKinematics(t) {
    const pos = this._kp || (this._kp = new THREE.Vector3()), q = this._kq || (this._kq = new THREE.Quaternion()), qr = this._kr || (this._kr = new THREE.Quaternion());
    for (const k of this.kin) {
      const bp = k.p.bp || {}, ph = Number(bp.phase) || 0;
      if (k.p.behavior === 'spin') { qr.setFromAxisAngle(k.axis, (Number.isFinite(bp.speed) ? bp.speed : 90) * DEG * t); pos.copy(k.base); q.copy(qr).multiply(k.q0); }
      else if (k.p.behavior === 'move') { const per = Math.max(0.2, Number(bp.period) || 4), f = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / per + ph)); pos.copy(k.base).addScaledVector(k.off, f); q.copy(k.q0); }
      else { const per = Math.max(0.2, Number(bp.period) || 3), amp = (Number.isFinite(bp.amp) ? bp.amp : 60) * DEG; qr.setFromAxisAngle(k.axis, amp * Math.sin(2 * Math.PI * (t / per + ph))); pos.copy(k.base).sub(k.pivot).applyQuaternion(qr).add(k.pivot); q.copy(qr).multiply(k.q0); }
      k.m.position.copy(pos); k.m.quaternion.copy(q);
      if (k.c) Phys.moveCollider(k.c, pos, q);
    }
  },
  setEnv(e) {
    const u = this.sky.material.uniforms;
    u.top.value.set(e.top); u.horizon.value.set(e.horizon); u.bottom.value.set(e.bottom); u.sunCol.value.set(e.sun).multiplyScalar(e.sunI > 0.5 ? 1 : e.sunI * 1.6);
    this.sunDir.set(...e.sunDir).normalize();
    this.scene.fog.color.set(e.horizon);
    this.hemi.color.set(e.hemiSky); this.hemi.groundColor.set(e.hemiGround); this.hemi.intensity = e.hemiI;
    this.sun.color.set(e.sun); this.sun.intensity = e.sunI;
    this.stars.material.opacity = Number(e.stars) || 0; this.stars.visible = this.stars.material.opacity > 0.02;
    if (this.clouds) this.clouds.visible = !!PRESETS[Settings.preset].clouds && e.clouds !== false;
    this.envNow = e; this.applyFog();
  },
  // Blend two sky presets (or preset objects), t in 0..1. Used for day/night cycles.
  setEnvBlend(a, b, t) {
    a = typeof a === 'string' ? ENV[a] : a; b = typeof b === 'string' ? ENV[b] : b;
    const ca = this._ca || (this._ca = new THREE.Color()), cb = this._cb || (this._cb = new THREE.Color());
    const mix = (x, y) => '#' + ca.set(x).lerp(cb.set(y), t).getHexString();
    const e = {};
    for (const k of ['top', 'horizon', 'bottom', 'sun', 'hemiSky', 'hemiGround']) e[k] = mix(a[k], b[k]);
    for (const k of ['sunI', 'hemiI', 'fog', 'stars']) e[k] = lerp(Number(a[k]) || 0, Number(b[k]) || 0, t);
    e.sunDir = [0, 1, 2].map(i => lerp(a.sunDir[i], b.sunDir[i], t)); e.clouds = t < 0.5 ? a.clouds : b.clouds;
    this.setEnv(e);
  },
  applyFog() {
    const p = PRESETS[Settings.preset], f = Number((this.envNow || this.env).fog) || 1;
    this.scene.fog.near = p.fogNear * f; this.scene.fog.far = Math.max(p.fogNear * f + 20, p.fogFar * f);
  },
  applyPreset() {
    if (!this.scene) return;
    const p = PRESETS[Settings.preset], sun = this.sun;
    this.applyFog();
    sun.castShadow = p.shadow > 0;
    if (p.shadow && sun.shadow.mapSize.x !== p.shadow) {
      sun.shadow.mapSize.set(p.shadow, p.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    const ext = p.shadow >= 2048 ? 34 : 24, sc = sun.shadow.camera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
    this.clouds.visible = p.clouds && (this.envNow || this.env).clouds !== false;
    this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
  },
  update(dt, focus, cam) {
    this.sun.position.set(focus.x + this.sunDir.x * 80, focus.y + this.sunDir.y * 80, focus.z + this.sunDir.z * 80);
    this.sun.target.position.copy(focus); this.sun.target.updateMatrixWorld();
    this.sky.position.copy(cam.position); this.stars.position.copy(cam.position);
    if (this.clouds.visible) this.clouds.rotation.y += dt * 0.004;
    if (this.spinners.length) {
      const t = this.time(), q = this._sq || (this._sq = new THREE.Quaternion());
      for (const s of this.spinners) { q.setFromAxisAngle(AXES.y, t * 2.4 + s.ph); s.m.quaternion.copy(q).multiply(s.q0); s.m.position.y = s.base.y + Math.sin(t * 2.6 + s.ph) * 0.18; }
    }
  },
  // Camera framing for thumbnails: the def's own, or a diagonal view over the level's bounds.
  thumbCam() {
    if (this.def && this.def.thumb) return this.def.thumb;
    const b = new THREE.Box3(), v = new THREE.Vector3();
    for (const p of this.parts) { if (p.size[0] > 120 || p.size[2] > 120) continue; b.expandByPoint(v.set(...p.pos)); }
    if (b.isEmpty()) b.expandByPoint(v.set(0, 0, 0)).expandByPoint(v.set(10, 6, 10));
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(12, b.getSize(new THREE.Vector3()).length() * 0.5);
    return { pos: [c.x + r * 0.95, c.y + r * 0.7, c.z + r * 0.95], look: [c.x, c.y, c.z] };
  },
  // A jpeg data URL of the level. viewCam (optional) shoots from that camera instead of the thumbnail framing.
  snapshot(w, h, viewCam, focus) {
    const r = Engine.renderer, tc = viewCam ? null : this.thumbCam(), cam = viewCam ? viewCam.clone() : new THREE.PerspectiveCamera(50, w / h, 0.1, 1200);
    if (viewCam) { cam.aspect = w / h; cam.updateProjectionMatrix(); } else { cam.position.set(...tc.pos); cam.lookAt(...tc.look); }
    this.update(0, focus || (tc ? new THREE.Vector3(...tc.look) : cam.position), cam);
    const pr = r.getPixelRatio(), size = r.getSize(new THREE.Vector2());
    r.setPixelRatio(1); r.setSize(w, h, false); r.render(this.scene, cam);
    let url = '';
    try { url = r.domElement.toDataURL('image/jpeg', 0.78); } catch (e) { /* leave blank */ }
    r.setPixelRatio(pr); r.setSize(Math.max(1, size.x), Math.max(1, size.y), false);
    return url;
  },
};
