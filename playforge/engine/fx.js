import * as THREE from 'three';

/* ---------- 10b. Effects: bursts, splats, floating text, rings ---------- */
export const Fx = {
  scene: null, items: [], splats: [], cube: null, disc: null, ringGeo: null,
  attach(scene) {
    this.clear(); this.scene = scene;
    if (!this.cube) { this.cube = new THREE.BoxGeometry(0.16, 0.16, 0.16); this.disc = new THREE.CircleGeometry(0.5, 18); this.ringGeo = new THREE.RingGeometry(0.42, 0.5, 32); }
  },
  clear() {
    for (const it of this.items) this.drop(it);
    for (const s of this.splats) this.drop(s);
    this.items = []; this.splats = [];
  },
  drop(it) {
    if (this.scene) this.scene.remove(it.obj);
    if (it.mat) it.mat.dispose();
    if (it.tex) it.tex.dispose();
  },
  // Little cubes flying out from a point (pickups, splats, knockouts).
  burst(pos, color = '#FFC53A', n = 14, speed = 6) {
    if (!this.scene) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const group = new THREE.Group(); group.position.set(pos.x, pos.y, pos.z);
    const vel = [];
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.cube, mat); group.add(m);
      const a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1, s = speed * (0.5 + Math.random() * 0.6);
      vel.push(new THREE.Vector3(Math.cos(a) * s * (1 - u * 0.5), u * s, Math.sin(a) * s * (1 - u * 0.5)));
    }
    this.scene.add(group);
    this.items.push({ obj: group, mat, life: 0.8, max: 0.8, kind: 'burst', vel });
  },
  // Paint mark on a surface. Old splats fade; at most 60 stay.
  splat(pos, normal, color = '#FF6A2B', size = 0.9) {
    if (!this.scene) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(this.disc, mat); const n = normal ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    m.position.set(pos.x, pos.y, pos.z).addScaledVector(n, 0.02);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    this.scene.add(m);
    this.splats.push({ obj: m, mat, life: 9, max: 9 });
    if (this.splats.length > 60) this.drop(this.splats.shift());
  },
  // Text that floats up and fades ("+1", "Splat!").
  text(pos, str, color = '#FFFFFF') {
    if (!this.scene) return;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.font = '400 64px "Lilita One", "Arial Rounded MT Bold", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(13,19,33,.75)'; g.strokeText(str, 128, 50); g.fillStyle = color; g.fillText(str, 128, 50);
    const tex = new THREE.CanvasTexture(c); const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat); s.scale.set(1.6, 0.6, 1); s.position.set(pos.x, pos.y, pos.z); s.renderOrder = 12;
    this.scene.add(s); this.items.push({ obj: s, mat, tex, life: 1.1, max: 1.1, kind: 'text' });
  },
  // Flat ring that grows (checkpoints, landings, area hits).
  ring(pos, color = '#3FD07A', size = 3) {
    if (!this.scene) return;
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat); m.rotation.x = -Math.PI / 2; m.position.set(pos.x, pos.y + 0.05, pos.z);
    this.scene.add(m); this.items.push({ obj: m, mat, life: 0.6, max: 0.6, kind: 'ring', size });
  },
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.life -= dt; const k = Math.max(0, it.life / it.max);
      if (it.kind === 'burst') {
        it.obj.children.forEach((m, j) => { const v = it.vel[j]; v.y -= 18 * dt; m.position.addScaledVector(v, dt); m.rotation.x += dt * 6; m.rotation.y += dt * 5; });
        it.mat.opacity = k;
      } else if (it.kind === 'text') { it.obj.position.y += dt * 1.4; it.mat.opacity = Math.min(1, k * 2); }
      else if (it.kind === 'ring') { it.obj.scale.setScalar(1 + (1 - k) * it.size); it.mat.opacity = k; }
      if (it.life <= 0) { this.drop(it); this.items.splice(i, 1); }
    }
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i]; s.life -= dt; if (s.life < 2) s.mat.opacity = Math.max(0, s.life / 2) * 0.92;
      if (s.life <= 0) { this.drop(s); this.splats.splice(i, 1); }
    }
  },
};
