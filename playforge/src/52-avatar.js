/* ---------- 8. Avatar model ---------- */
const AvatarGeo = {};
function avatarGeo(key, layer) {
  const id = key + layer; if (AvatarGeo[id]) return AvatarGeo[id];
  const p = PART[key], inf = layer === 'outer' ? (key === 'head' ? 1 : 0.5) : 0;
  const g = new THREE.BoxGeometry((p.w + inf) * PX, (p.h + inf) * PX, (p.d + inf) * PX);
  const rects = faceRects(p, layer), uv = g.attributes.uv, E = 0.02;
  FACES.forEach((f, fi) => {
    const r = rects[f];
    for (let i = 0; i < 4; i++) {
      const k = fi * 4 + i, u = uv.getX(k), v = uv.getY(k);
      uv.setXY(k, (r.x + E + u * (r.w - 2 * E)) / SK, 1 - (r.y + E + (1 - v) * (r.h - 2 * E)) / SK);
    }
  });
  return (AvatarGeo[id] = g);
}
// [joint x, y, z, mesh offset x, y, z] in skin pixels. Feet at y = 0, facing +z.
const JOINTS = { head: [0, 24, 0, 0, 4, 0], torso: [0, 18, 0, 0, 0, 0], armR: [-6, 22, 0, 0, -4, 0], armL: [6, 22, 0, 0, -4, 0], legR: [-2, 12, 0, 0, -6, 0], legL: [2, 12, 0, 0, -6, 0] };
function makeSkinTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
function makeNameTag(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat); s.scale.set(2.3, 2.3 * 112 / 512, 1); s.renderOrder = 10;
  s.userData.draw = t => {
    const g = c.getContext('2d'); g.clearRect(0, 0, 512, 112);
    g.font = '700 50px "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
    let label = t; while (g.measureText(label).width > 440 && label.length > 2) label = label.slice(0, -2) + '…';
    const w = Math.min(504, g.measureText(label).width + 60), x = (512 - w) / 2;
    g.fillStyle = 'rgba(13,19,33,.66)'; g.beginPath();
    if (g.roundRect) g.roundRect(x, 10, w, 92, 46); else g.rect(x, 10, w, 92);
    g.fill(); g.fillStyle = '#F4F7FF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 256, 58);
    tex.needsUpdate = true;
  };
  s.userData.draw(text);
  return s;
}
function wrapLines(g, text, maxW, maxLines) {
  const lines = []; let cur = '';
  for (const w of text.split(' ')) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width <= maxW) { cur = t; continue; }
    if (cur) lines.push(cur);
    cur = w;
    while (g.measureText(cur).width > maxW && cur.length > 1) {
      let k = cur.length - 1; while (k > 1 && g.measureText(cur.slice(0, k)).width > maxW) k--;
      lines.push(cur.slice(0, k)); cur = cur.slice(k);
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines; let l = lines[maxLines - 1];
    while (g.measureText(l + '…').width > maxW && l.length > 1) l = l.slice(0, -1);
    lines[maxLines - 1] = l + '…';
  }
  return lines;
}
// Chat bubble that floats above a nametag for a few seconds.
function makeBubble() {
  const W = 512, H = 200, c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat); s.scale.set(2.6, 2.6 * H / W, 1); s.renderOrder = 11; s.visible = false;
  let ttl = 0;
  s.userData.show = text => {
    const g = c.getContext('2d'); g.clearRect(0, 0, W, H);
    g.font = '700 34px "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
    const lines = wrapLines(g, text, 440, 3);
    const w = Math.min(500, Math.max(...lines.map(l => g.measureText(l).width)) + 44), h = lines.length * 40 + 26, x = (W - w) / 2, y = H - 22 - h;
    g.fillStyle = '#FFFFFF'; g.strokeStyle = 'rgba(23,34,58,.25)'; g.lineWidth = 3;
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 22); else g.rect(x, y, w, h); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(W / 2 - 14, y + h - 2); g.lineTo(W / 2, H - 4); g.lineTo(W / 2 + 14, y + h - 2); g.closePath(); g.fill();
    g.fillStyle = '#17223A'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, y + 33 + i * 40));
    tex.needsUpdate = true; mat.opacity = 1; s.visible = true; ttl = Math.min(9, 4.5 + text.length * 0.035);
  };
  s.userData.tick = dt => { if (!s.visible) return; ttl -= dt; mat.opacity = clamp(ttl / 0.6, 0, 1); if (ttl <= 0) s.visible = false; };
  s.userData.hide = () => { s.visible = false; ttl = 0; };
  return s;
}
function createAvatar(texture, name) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mBase = new THREE.MeshLambertMaterial({ map: texture });
  const mOuter = new THREE.MeshLambertMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide });
  const joints = {}, base = [], outer = [];
  for (const p of PARTS) {
    const [jx, jy, jz, mx, my, mz] = JOINTS[p.key];
    const j = new THREE.Group(); j.position.set(jx * PX, jy * PX, jz * PX); body.add(j); joints[p.key] = j;
    const mb = new THREE.Mesh(avatarGeo(p.key, 'base'), mBase);
    mb.position.set(mx * PX, my * PX, mz * PX); mb.castShadow = true; mb.userData = { part: p.key, layer: 'base' }; j.add(mb); base.push(mb);
    const mo = new THREE.Mesh(avatarGeo(p.key, 'outer'), mOuter);
    mo.position.copy(mb.position); mo.userData = { part: p.key, layer: 'outer' }; j.add(mo); outer.push(mo);
  }
  const tag = makeNameTag(name); tag.position.y = 2.42; root.add(tag);
  const bubble = makeBubble(); bubble.position.y = 3.22; root.add(bubble);
  return {
    root, body, joints, base, outer, tag, bubble, phase: 0, stepSign: 0, name,
    say(text) { bubble.userData.show(text); },
    dispose() { mBase.dispose(); mOuter.dispose(); for (const s of [tag, bubble]) { s.material.map.dispose(); s.material.dispose(); } },
    setName(n) { if (n !== this.name) { this.name = n; tag.userData.draw(n); } },
    redrawTag() { tag.userData.draw(this.name); },
    setOuterVisible(v) { outer.forEach(m => { m.visible = v; }); },
    // s: { speed 0..1, grounded, t }. Returns true on a footfall.
    animate(dt, s) {
      bubble.userData.tick(dt);
      const J = joints, moving = s.grounded && s.speed > 0.08;
      if (moving) this.phase += dt * (5 + 7 * Math.min(1, s.speed));
      else this.phase = damp(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 8, dt);
      const sw = Math.sin(this.phase) * 0.95 * Math.min(1, s.speed);
      let lR, lL, aR, aL, aRz, aLz;
      if (!s.grounded) { lR = -0.55; lL = 0.3; aR = -0.35; aL = -0.35; aRz = -0.55; aLz = 0.55; }
      else { const br = Math.sin(s.t * 2.1) * 0.035; lR = sw; lL = -sw; aR = -sw * 0.85; aL = sw * 0.85; aRz = -0.04 - br; aLz = 0.04 + br; }
      const k = 16;
      J.legR.rotation.x = damp(J.legR.rotation.x, lR, k, dt); J.legL.rotation.x = damp(J.legL.rotation.x, lL, k, dt);
      J.armR.rotation.x = damp(J.armR.rotation.x, aR, k, dt); J.armL.rotation.x = damp(J.armL.rotation.x, aL, k, dt);
      J.armR.rotation.z = damp(J.armR.rotation.z, aRz, 10, dt); J.armL.rotation.z = damp(J.armL.rotation.z, aLz, 10, dt);
      J.head.rotation.x = damp(J.head.rotation.x, moving ? 0.06 : Math.sin(s.t * 0.7) * 0.03, 6, dt);
      body.position.y = damp(body.position.y, moving ? Math.abs(Math.cos(this.phase)) * 0.06 * Math.min(1, s.speed) : 0, 20, dt);
      const sg = Math.sin(this.phase) >= 0 ? 1 : -1;
      if (moving && sg !== this.stepSign) { this.stepSign = sg; return true; }
      if (!moving) this.stepSign = 0;
      return false;
    },
  };
}
