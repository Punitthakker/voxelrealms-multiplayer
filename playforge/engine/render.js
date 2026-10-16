import * as THREE from 'three';
import { DEG, PRESETS, Settings, hashStr, rng } from './core.js';
import { World } from './world.js';


/* ---------- 7. Renderer, materials and geometry ---------- */
export const Engine = {
  renderer: null, host: null, w: 1, h: 1, aa: false, dynScale: 1, mode: 'home', views: {},
  init() {
    this.create();
    this.ro = new ResizeObserver(() => this.resize());
    window.addEventListener('resize', () => this.resize());
  },
  create() {
    const p = PRESETS[Settings.preset], old = this.renderer;
    const r = new THREE.WebGLRenderer({ antialias: p.aa, powerPreference: 'high-performance', alpha: false, stencil: false });
    r.setClearColor(0x0B1020, 1);
    r.shadowMap.enabled = p.shadow > 0;
    r.shadowMap.type = Settings.preset === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.domElement.addEventListener('webglcontextlost', e => e.preventDefault());
    this.renderer = r; this.aa = p.aa;
    if (old) {
      const parent = old.domElement.parentNode;
      old.dispose(); try { old.forceContextLoss(); } catch (e) { /* ignore */ }
      if (parent) parent.replaceChild(r.domElement, old.domElement);
    }
    this.applyPixelRatio();
  },
  attach(host) {
    if (this.host !== host) {
      if (this.host) this.ro.unobserve(this.host);
      this.host = host; host.appendChild(this.renderer.domElement); this.ro.observe(host);
    }
    this.resize();
  },
  basePR() { const p = PRESETS[Settings.preset]; return Math.min(window.devicePixelRatio || 1, p.prCap) * p.prMul; },
  applyPixelRatio() {
    const s = this.mode === 'game' && Settings.dynamicRes ? this.dynScale : 1;
    this.renderer.setPixelRatio(Math.max(0.45, this.basePR() * s));
    this.renderer.setSize(this.w, this.h, false);
  },
  resize() {
    if (!this.host) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.w = w; this.h = h; this.renderer.setSize(w, h, false);
    const v = this.views[this.mode]; if (v && v.resize) v.resize(w, h);
  },
  setMode(m) { this.mode = m; this.dynScale = 1; this.applyPixelRatio(); },
  applyPreset() {
    const p = PRESETS[Settings.preset];
    if (p.aa !== this.aa) this.create();
    else { this.renderer.shadowMap.enabled = p.shadow > 0; this.renderer.shadowMap.type = Settings.preset === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; }
    this.dynScale = 1; this.applyPixelRatio(); this.resize();
    World.applyPreset();
  },
};

// Grayscale procedural textures, tinted per part by material color. 128 px covers TILE[kind] world units.
export const TILE = { plastic: 4, grass: 8, wood: 4, stone: 4, brick: 4, metal: 4, sand: 6, ice: 6, neon: 4 };
export const MatTex = {};
export function matTexture(kind) {
  if (MatTex[kind]) return MatTex[kind];
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), R = rng(hashStr(kind));
  const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
  const bevel = (lo = 0.13, hi = 0.5) => {
    g.fillStyle = `rgba(255,255,255,${hi})`; g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
    g.fillStyle = `rgba(0,0,0,${lo})`; g.fillRect(0, S - 3, S, 3); g.fillRect(S - 3, 0, 3, S);
  };
  switch (kind) {
    case 'plastic':
      g.fillStyle = gray(244); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 700; i++) { g.fillStyle = gray(230 + R() * 22); g.fillRect(R() * S | 0, R() * S | 0, 2, 2); }
      bevel(); break;
    case 'grass':
      g.fillStyle = gray(222); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 1800; i++) { g.fillStyle = gray(198 + R() * 46); g.fillRect(R() * S | 0, R() * S | 0, 1, 2 + (R() * 3 | 0)); }
      g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, S - 2, S, 2); g.fillRect(S - 2, 0, 2, S); break;
    case 'wood':
      for (let p = 0; p < 4; p++) {
        const ph = R() * 10;
        for (let y = 0; y < 32; y++) for (let x = 0; x < S; x += 8) {
          g.fillStyle = gray(196 + 22 * Math.sin((y + ph) * 0.8 + Math.sin(x * 0.04 + ph) * 2.2) + R() * 10);
          g.fillRect(x, p * 32 + y, 8, 1);
        }
        g.fillStyle = gray(140); g.fillRect(0, p * 32, S, 2); g.fillRect((R() * 100 + 14) | 0, p * 32, 2, 32);
      }
      break;
    case 'stone':
      g.fillStyle = gray(150); g.fillRect(0, 0, S, S);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = 180 + R() * 50; g.fillStyle = gray(v);
        const jx = R() * 4, jy = R() * 4; g.beginPath();
        if (g.roundRect) g.roundRect(x * 32 + 2 + jx, y * 32 + 2 + jy, 27 - jx, 27 - jy, 6); else g.rect(x * 32 + 2 + jx, y * 32 + 2 + jy, 27 - jx, 27 - jy);
        g.fill();
        for (let i = 0; i < 30; i++) { g.fillStyle = gray(v - 20 + R() * 40); g.fillRect(x * 32 + 4 + R() * 24, y * 32 + 4 + R() * 24, 2, 2); }
      }
      break;
    case 'brick':
      g.fillStyle = gray(235); g.fillRect(0, 0, S, S);
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0), y = row * 16;
        g.fillStyle = gray(170 + R() * 35); g.fillRect(x + 2, y + 2, 28, 12);
      }
      break;
    case 'metal':
      g.fillStyle = gray(210); g.fillRect(0, 0, S, S);
      for (let y = 0; y < S; y++) { g.fillStyle = gray(196 + R() * 30, 0.6); g.fillRect(0, y, S, 1); }
      for (const [x, y] of [[10, 10], [S - 10, 10], [10, S - 10], [S - 10, S - 10]]) {
        g.fillStyle = gray(150); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
        g.fillStyle = gray(245); g.beginPath(); g.arc(x - 1, y - 1, 1.6, 0, 7); g.fill();
      }
      bevel(0.18, 0.4); break;
    case 'sand':
      g.fillStyle = gray(228); g.fillRect(0, 0, S, S);
      for (let i = 0; i < 2400; i++) { g.fillStyle = gray(200 + R() * 55); g.fillRect(R() * S | 0, R() * S | 0, 1, 1); }
      break;
    case 'ice':
      g.fillStyle = gray(236); g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const x = R() * S; g.beginPath(); g.moveTo(x, 0); g.lineTo(x - 50, S); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
      for (let i = 0; i < 4; i++) { g.beginPath(); let x = R() * S, y = R() * S; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += R() * 30 - 15; y += R() * 30 - 15; g.lineTo(x, y); } g.stroke(); }
      break;
    default:
      g.fillStyle = gray(255); g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (MatTex[kind] = t);
}
export const MatCache = new Map();
export function partMaterial(kind, color, transparency = 0) {
  const key = kind + '|' + color + '|' + transparency;
  let m = MatCache.get(key); if (m) return m;
  m = kind === 'neon' ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, map: matTexture(kind) });
  if (transparency > 0) { m.transparent = true; m.opacity = 1 - transparency; m.depthWrite = transparency < 0.5; }
  MatCache.set(key, m); return m;
}
// Box with UVs scaled to world size so textures keep a constant density.
export function boxGeometry(sx, sy, sz, tile) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}
// Wedge: full height at the back (-z), sloping down to the front (+z).
export function wedgeGeometry(sx, sy, sz, tile) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2, L = Math.hypot(sy, sz);
  const A = [-hx, -hy, -hz], B = [hx, -hy, -hz], C = [hx, -hy, hz], D = [-hx, -hy, hz], E = [-hx, hy, -hz], F = [hx, hy, -hz];
  const pos = [], nor = [], uvs = [];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function poly(vs, n, uvf) {
    const c = cross(sub(vs[1], vs[0]), sub(vs[2], vs[0]));
    if (c[0] * n[0] + c[1] * n[1] + c[2] * n[2] < 0) vs = vs.slice().reverse();
    for (let i = 1; i < vs.length - 1; i++) for (const v of [vs[0], vs[i], vs[i + 1]]) { pos.push(...v); nor.push(...n); const t = uvf(v); uvs.push(t[0] / tile, t[1] / tile); }
  }
  poly([A, B, C, D], [0, -1, 0], v => [v[0] + hx, v[2] + hz]);
  poly([A, E, F, B], [0, 0, -1], v => [hx - v[0], v[1] + hy]);
  poly([E, D, C, F], [0, sz / L, sy / L], v => [v[0] + hx, Math.hypot(v[1] + hy, hz - v[2])]);
  poly([A, D, E], [-1, 0, 0], v => [v[2] + hz, v[1] + hy]);
  poly([B, F, C], [1, 0, 0], v => [hz - v[2], v[1] + hy]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
export let SPHERE_GEO = null, CYL_GEO = null;
// Unit sphere and cylinder shared by every part mesh (created on first use).
export function ensureSharedGeo() {
  if (!SPHERE_GEO) { SPHERE_GEO = new THREE.SphereGeometry(0.5, 24, 16); CYL_GEO = new THREE.CylinderGeometry(0.5, 0.5, 1, 24); }
}
export function spawnTopMaterial() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#FF6A2B'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(23,34,58,.35)'; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 104, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 88, 0, 7); g.stroke();
  g.translate(128, 128); g.fillStyle = '#FFC53A'; g.strokeStyle = '#17223A'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 22 : 64, a = i * Math.PI / 4 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t });
}
export function buildPartMesh(p) {
  const [sx, sy, sz] = p.size, tile = TILE[p.material] || 4;
  let geo, mat = partMaterial(p.material, p.color, p.transparency || 0), scaled = false;
  switch (p.shape) {
    case 'wedge': geo = wedgeGeometry(sx, sy, sz, tile); break;
    case 'sphere': geo = SPHERE_GEO; scaled = true; break;
    case 'cylinder': geo = CYL_GEO; scaled = true; break;
    case 'spawn':
      geo = new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 40);
      mat = [partMaterial('plastic', p.color), spawnTopMaterial(), partMaterial('plastic', p.color)]; break;
    default: geo = boxGeometry(sx, sy, sz, tile);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(p.pos[0], p.pos[1], p.pos[2]);
  m.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG, 'YXZ');
  if (scaled) m.scale.set(sx, sy, sz);
  m.castShadow = !(p.transparency > 0.5) && p.material !== 'neon';
  m.receiveShadow = true;
  m.userData.part = p;
  m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}
