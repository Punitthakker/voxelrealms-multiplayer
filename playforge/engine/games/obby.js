import { DEG, Sfx, clamp, pick } from '../core.js';
import { Phys } from '../physics.js';
import { World, mkPart } from '../world.js';
import { fmtTime } from '../hud.js';
import { Modes, registerGames, saveBest } from '../game.js';

/* ---------- Games: obbies, towers and races ---------- */
// Course builder: elements are laid out in a local frame (u = right, v = up, w = forward) that can turn at checkpoints.
// Jump limits used for fair gaps: walk 8 u/s, jump 16 u/s, gravity 50 x env.gravity.
export function Course(R, th, opt = {}) {
  const parts = [], g = opt.gravity || 1, gs = Math.min(1.9, 1 / Math.sqrt(g)); // gap scale for low gravity
  const D = Object.assign({ gap: 3, plat: 3.2, rise: 0.8 }, opt.diff || {});
  const c = { parts, R, th, D, gs, h: 0, ox: 0, oz: 0, w: 0, u: 0, y: opt.y || 4, stage: 0 };
  const deg = () => (c.h * 180) / Math.PI;
  const wp = (u, w) => [c.ox + Math.cos(c.h) * u - Math.sin(c.h) * w, c.oz - Math.sin(c.h) * u - Math.cos(c.h) * w];
  // Box with its top at yTop, spanning forward from w0 for depth d, centered at u.
  c.box = (u, yTop, w0, wid, th2, d, color, mat, x = {}) => {
    const [px, pz] = wp(u, w0 + d / 2);
    const p = mkPart(x.shape || 'block', [px, yTop - th2 / 2, pz], [wid, th2, d], color, mat || th.mat, Object.assign({ rot: [0, deg(), 0] }, x));
    parts.push(p); return p;
  };
  c.at = (u, y, w) => { const [px, pz] = wp(u, w); return [px, y, pz]; };
  c.col = () => pick(R, th.plat);
  c.gap = (k = 1) => D.gap * gs * k * (0.85 + R() * 0.25);
  c.checkpoint = (size = 5, turn = 0) => {
    c.stage++;
    const w0 = c.w + c.gap(0.7);
    c.box(c.u, c.y, w0, size, 0.8, size, th.cp || '#2D62F0', 'plastic', { name: 'Stage ' + c.stage, behavior: 'checkpoint', tag: 'stage', bp: { stage: c.stage } });
    if (turn) { // pivot the frame around the pad center
      const [px, pz] = wp(c.u, w0 + size / 2); c.ox = px; c.oz = pz; c.h += turn; c.w = size / 2; c.u = 0;
    } else c.w = w0 + size;
  };
  return c;
}
// Elements: each starts after a gap from c.w and leaves c.w at the far edge of its last landing surface.
export const OBBY_EL = {
  hops(c) {
    const n = 3 + Math.floor(c.R() * 3), s = c.D.plat;
    for (let i = 0; i < n; i++) {
      const rise = (c.R() - 0.3) * c.D.rise; c.y = Math.max(2, c.y + rise);
      const w0 = c.w + c.gap(rise > 0.3 ? 0.85 : 1); c.u = clamp(c.u + (c.R() - 0.5) * 3, -6, 6);
      c.box(c.u, c.y, w0, s, 0.8, s, c.col()); c.w = w0 + s;
    }
  },
  beam(c) {
    const len = 8 + c.R() * 5, w0 = c.w + c.gap(0.5);
    c.box(c.u, c.y, w0, Math.max(0.9, c.D.plat * 0.32), 0.6, len, c.th.beam || c.col(), c.th.beamMat || 'wood'); c.w = w0 + len;
  },
  mover(c) {
    const span = 9 + c.R() * 3, w0 = c.w + 0.6, s = c.D.plat + 0.6, per = 4 + c.R() * 2;
    c.box(c.u, c.y, w0, s, 0.7, s, c.th.mover || '#FFC53A', 'plastic', { name: 'Moving platform', behavior: 'move', bp: { offset: (() => { const a = c.at(0, 0, span - s) , b = c.at(0, 0, 0); return [a[0] - b[0], 0, a[2] - b[2]]; })(), period: per, phase: c.R() } });
    c.box(c.u, c.y, w0 + span + 0.6, s + 1, 0.8, s + 1, c.col()); c.w = w0 + span + 0.6 + s + 1;
  },
  logs(c) { // logs sliding sideways over a gap
    const n = 3 + Math.floor(c.R() * 2);
    for (let i = 0; i < n; i++) {
      const w0 = c.w + c.gap(0.6), s = c.D.plat + 0.4, off = c.at(5, 0, 0), base = c.at(0, 0, 0);
      c.box(c.u - 2.5, c.y, w0, s * 1.6, 0.9, s, '#8A5A35', 'wood', { shape: 'block', name: 'Log', behavior: 'move', bp: { offset: [off[0] - base[0], 0, off[2] - base[2]], period: 3 + c.R() * 2, phase: c.R() } });
      c.w = w0 + s;
    }
    const w0 = c.w + c.gap(0.6); c.box(c.u, c.y, w0, 4, 0.8, 4, c.col()); c.w = w0 + 4;
  },
  spinner(c) {
    const w0 = c.w + c.gap(0.6), s = 10;
    c.box(c.u, c.y, w0, s, 0.8, s, c.th.floor2 || c.col());
    const ctr = c.at(c.u, c.y + 0.75, w0 + s / 2);
    c.parts.push(mkPart('block', ctr, [s - 1, 0.5, 0.6], c.th.hazard || '#FF3B1F', 'neon', { name: 'Spinner', behavior: 'spin', bp: { axis: 'y', speed: 70 + c.R() * 60, phase: c.R() }, tag: 'hazard' }));
    c.parts.push(mkPart('cylinder', [ctr[0], c.y + 0.6, ctr[2]], [1.4, 1.2, 1.4], '#4E5B74', 'metal', { name: 'Hub' }));
    c.w = w0 + s;
  },
  swing(c) {
    const len = 14, w0 = c.w + c.gap(0.5);
    c.box(c.u, c.y, w0, 3.2, 0.8, len, c.th.floor2 || c.col());
    for (let i = 0; i < 2; i++) {
      const w = w0 + 4 + i * 6, top = c.y + 7;
      const beamPos = c.at(c.u, top + 0.4, w); c.parts.push(mkPart('block', beamPos, [6, 0.6, 0.6], '#4E5B74', 'metal', { name: 'Hammer beam', rot: [0, (c.h * 180) / Math.PI, 0] }));
      const head = c.at(c.u, c.y + 1.4, w);
      const s1 = { axis: 'z', amp: 55, period: 2.4 + c.R(), phase: i * 0.5, pivot: [0, top - (c.y + 1.4), 0] };
      // swing across the path: axis along the path direction
      const fw = c.at(0, 0, 1), bo = c.at(0, 0, 0), ax = Math.abs(fw[0] - bo[0]) > 0.5 ? 'x' : 'z';
      s1.axis = ax;
      c.parts.push(mkPart('block', head, [1.6, 1.6, 1.6], c.th.hazard || '#E23E62', 'neon', { name: 'Hammer', behavior: 'swing', bp: s1, tag: 'hazard' }));
      c.parts.push(mkPart('block', c.at(c.u, (top + c.y + 1.4) / 2, w), [0.25, top - c.y - 1.4, 0.25], '#9AA5B1', 'metal', { name: 'Rope', canCollide: false, behavior: 'swing', bp: Object.assign({}, s1, { pivot: [0, (top - c.y - 1.4) / 2, 0] }) }));
    }
    c.w = w0 + len;
  },
  vanish(c) {
    const n = 4 + Math.floor(c.R() * 3);
    for (let i = 0; i < n; i++) { const w0 = c.w + c.gap(0.55); c.box(c.u, c.y, w0, 3, 0.5, 3, c.th.vanish || '#B9F3FF', 'ice', { name: 'Vanishing tile', behavior: 'vanish', bp: { delay: 0.45, back: 3 } }); c.w = w0 + 3; }
  },
  fake(c) {
    const rows = 4 + Math.floor(c.R() * 3);
    for (let i = 0; i < rows; i++) {
      const w0 = c.w + c.gap(0.55), left = c.R() < 0.5;
      c.box(c.u - 2, c.y, w0, 2.8, 0.4, 2.8, c.th.glass || '#CFEFFF', 'ice', left ? { name: 'Tile' } : { name: 'Tile', behavior: 'fake', bp: { back: 3 } });
      c.box(c.u + 2, c.y, w0, 2.8, 0.4, 2.8, c.th.glass || '#CFEFFF', 'ice', left ? { name: 'Tile', behavior: 'fake', bp: { back: 3 } } : { name: 'Tile' });
      c.w = w0 + 2.8;
    }
  },
  lava(c) {
    const len = 16, w0 = c.w + c.gap(0.5);
    c.box(c.u, c.y, w0, 5, 0.8, len, c.th.floor2 || c.col());
    for (let i = 0; i < 3; i++) c.box(c.u, c.y + 0.12, w0 + 3 + i * 4.5, 5, 0.2, 1.6, c.th.hazard || '#FF3B1F', 'neon', { name: 'Lava strip', behavior: 'kill' });
    c.w = w0 + len;
  },
  ramp(c) {
    const w0 = c.w + 0.01, len = 8, up = 3;
    c.box(c.u, c.y + up, w0, 4, up, len, c.th.ramp || c.col(), c.th.mat, { shape: 'wedge', name: 'Ramp' });
    c.y += up; const w1 = w0 + len; c.box(c.u, c.y, w1, 4, 0.8, 3, c.col()); c.w = w1 + 3;
  },
  bounce(c) {
    const w0 = c.w + c.gap(0.5);
    c.box(c.u, c.y, w0, 3, 0.8, 3, '#7CFF6B', 'neon', { name: 'Bounce pad', behavior: 'bounce', bp: { power: 30 } });
    const up = 5 + c.R() * 2; c.y += up; const w1 = w0 + 3 + 1.5;
    c.box(c.u, c.y, w1, 4, 0.8, 4, c.col()); c.w = w1 + 4;
  },
  speed(c) {
    const w0 = c.w + c.gap(0.4);
    c.box(c.u, c.y, w0, 4, 0.8, 7, '#4CF0FF', 'neon', { name: 'Speed pad', behavior: 'speed', bp: { mult: 1.9, time: 2.5 } });
    const w1 = w0 + 7 + 6 * c.gs; c.box(c.u, c.y, w1, 4, 0.8, 4, c.col()); c.w = w1 + 4;
  },
  stairs(c) {
    const n = 5;
    for (let i = 0; i < n; i++) { const w0 = c.w + c.gap(0.5); c.y += 1; c.box(c.u + (i % 2 ? 1.5 : -1.5), c.y, w0, 2.4, 0.5, 2.4, c.col()); c.w = w0 + 2.4; }
  },
  walls(c) {
    const len = 16, w0 = c.w + c.gap(0.5);
    c.box(c.u, c.y, w0, 8, 0.8, len, c.th.floor2 || c.col());
    for (let i = 0; i < 3; i++) { const side = i % 2 ? 1 : -1; c.box(c.u + side * 1.5, c.y + 3, w0 + 3 + i * 5, 5, 3, 0.8, c.th.wall || '#9AA5B1', c.th.mat, { name: 'Wall' }); }
    c.w = w0 + len;
  },
};
export function obbyBuild(theme, opt) {
  return R => {
    const th = theme, env = opt.env || {}, c = Course(R, th, { gravity: env.gravity || 1, diff: opt.diff, y: 4 });
    // Start platform with spawn
    c.box(0, c.y, -6, 10, 1, 10, th.start || '#9AA5B1', th.mat, { name: 'Start' });
    c.parts.push(mkPart('spawn', c.at(0, c.y + 0.2, -1), [5, 0.4, 5], '#FF6A2B', 'plastic', { name: 'Spawn' }));
    c.w = 4;
    const n = opt.stages || 10, mix = opt.mix;
    for (let s = 0; s < n; s++) {
      const k = 1 + (R() < 0.45 ? 1 : 0);
      for (let i = 0; i < k; i++) OBBY_EL[pick(R, mix)](c);
      let turn = 0;
      if (opt.turns && s < n - 1 && R() < 0.55) { c.turnSign = -(c.turnSign || -1); turn = c.turnSign * Math.PI / 2; }
      if (s < n - 1) c.checkpoint(5, turn);
    }
    // Finish: pad, arch and flag
    const w0 = c.w + c.gap(0.6);
    c.box(c.u, c.y, w0, 8, 1, 8, '#FFFFFF', 'plastic', { name: 'Finish', behavior: 'finish' });
    const a = c.at(c.u - 3.2, c.y + 3, w0 + 4), b = c.at(c.u + 3.2, c.y + 3, w0 + 4), t = c.at(c.u, c.y + 6.4, w0 + 4);
    c.parts.push(mkPart('block', a, [0.8, 6, 0.8], th.accent || '#FFC53A', 'plastic', { name: 'Arch' }), mkPart('block', b, [0.8, 6, 0.8], th.accent || '#FFC53A', 'plastic', { name: 'Arch' }));
    c.parts.push(mkPart('block', t, [7.2, 0.9, 0.9], '#FF6A2B', 'neon', { name: 'Finish banner', rot: [0, (c.h * 180) / Math.PI, 0] }));
    // Below: a sea or a far ground, plus a few floating decorations
    const xs = c.parts.map(p => p.pos[0]), zs = c.parts.map(p => p.pos[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const sx = Math.max(...xs) - Math.min(...xs) + 120, sz = Math.max(...zs) - Math.min(...zs) + 120;
    if (th.sea) c.parts.push(mkPart('block', [cx, -9, cz], [sx, 2, sz], th.sea, th.seaMat || 'neon', { name: th.seaName || 'Sea', behavior: 'kill', transparency: th.seaT || 0 }));
    const deco = th.deco || 0;
    for (let i = 0; i < deco; i++) {
      const x = cx + (R() - 0.5) * sx * 0.8, z = cz + (R() - 0.5) * sz * 0.8, y = -4 + R() * 30;
      if (c.parts.some(p => Math.abs(p.pos[0] - x) < 10 && Math.abs(p.pos[2] - z) < 10)) continue;
      const s = 2 + R() * 5; c.parts.push(mkPart(pick(R, th.decoShapes || ['block', 'sphere']), [x, y, z], [s, s * (0.6 + R()), s], pick(R, th.plat), pick(R, [th.mat, 'plastic']), { name: 'Decoration', canCollide: false }));
    }
    const sp = c.parts.find(p => p.shape === 'spawn');
    return { parts: c.parts, spawn: [sp.pos[0], sp.pos[1] + 0.2, sp.pos[2]], spawnYaw: Math.PI };
  };
}
// Spiral tower around a core.
export function towerBuild(theme, opt) {
  return R => {
    const parts = [], th = theme, Rad = opt.radius || 11, per = 12, n = opt.hops || 48, P = (...a) => parts.push(mkPart(...a));
    P('block', [0, -1, 0], [90, 2, 90], th.ground || '#6CC38A', th.groundMat || 'grass', { name: 'Ground' });
    P('spawn', [Rad + 4, 0.2, 0], [5, 0.4, 5], '#FF6A2B', 'plastic', { name: 'Spawn' });
    const topY = n * 1.15 + 4;
    P('cylinder', [0, topY / 2, 0], [Rad * 1.05, topY, Rad * 1.05], th.core || '#9AA5B1', th.mat || 'stone', { name: 'Tower core' });
    for (let k = 0; k < 6; k++) P('cylinder', [0, (k + 0.5) * topY / 6, 0], [Rad * 1.12, 0.35, Rad * 1.12], th.accent || '#FFC53A', 'neon', { name: 'Ring light', canCollide: false });
    let stage = 0;
    for (let i = 0; i < n; i++) {
      const a = (i / per) * Math.PI * 2, y = 1.2 + i * 1.15, x = Math.cos(a) * Rad, z = -Math.sin(a) * Rad;
      const rot = [0, (a * 180) / Math.PI, 0];
      if (i % 8 === 7) { stage++; P('block', [x, y - 0.4, z], [4.2, 0.8, 4.2], '#2D62F0', 'plastic', { rot, name: 'Stage ' + stage, behavior: 'checkpoint', tag: 'stage', bp: { stage } }); continue; }
      const kind = i < 3 ? 'plain' : pick(R, opt.mix);
      const col = pick(R, th.plat);
      if (kind === 'vanish') P('block', [x, y - 0.3, z], [3, 0.6, 3], '#B9F3FF', 'ice', { rot, name: 'Vanishing tile', behavior: 'vanish', bp: { delay: 0.5, back: 3 } });
      else if (kind === 'move') P('block', [x, y - 0.3, z], [3, 0.6, 3], '#FFC53A', 'plastic', { rot, name: 'Moving step', behavior: 'move', bp: { offset: [Math.cos(a) * 3, 0, -Math.sin(a) * 3], period: 3, phase: R() } });
      else if (kind === 'lava') { P('block', [x, y - 0.3, z], [3.4, 0.6, 3.4], col, th.mat || 'plastic', { rot }); P('block', [x, y + 0.02, z], [1.2, 0.1, 1.2], '#FF3B1F', 'neon', { rot, name: 'Lava spot', behavior: 'kill' }); }
      else if (kind === 'bar' && i % 3 === 0) { P('block', [x, y - 0.3, z], [3.4, 0.6, 3.4], col, th.mat || 'plastic', { rot }); P('block', [0, y + 0.9, 0], [Rad * 2 + 6, 0.45, 0.45], '#E23E62', 'neon', { name: 'Sweeper', behavior: 'spin', bp: { axis: 'y', speed: 40 + R() * 25, phase: R() }, tag: 'hazard' }); }
      else P('block', [x, y - 0.3, z], [3.2, 0.6, 3.2], col, th.mat || 'plastic', { rot });
    }
    const a = (n / per) * Math.PI * 2, y = 1.2 + n * 1.15, fx = Math.cos(a) * (Rad + 0.6), fz = -Math.sin(a) * (Rad + 0.6);
    P('block', [fx, y - 0.4, fz], [5.2, 0.8, 5.2], '#FFFFFF', 'plastic', { rot: [0, (a * 180) / Math.PI, 0], name: 'Finish', behavior: 'finish' });
    P('cylinder', [fx * 1.15, y + 3, fz * 1.15], [0.4, 6, 0.4], '#EDEFF2', 'metal', { name: 'Flag pole' });
    P('block', [fx * 1.15 + 1.1, y + 5.3, fz * 1.15], [2, 1.2, 0.15], '#FF6A2B', 'plastic', { name: 'Flag', canCollide: false });
    return { parts, spawn: [Rad + 4, 0.4, 0], spawnYaw: Math.PI / 2 + Math.PI };
  };
}
// Race tracks: a loop of road segments through numbered gates, or rooftops point to point.
export function trackBuild(theme, opt) {
  return R => {
    const parts = [], th = theme, P = (...a) => parts.push(mkPart(...a));
    const pts = [];
    if (opt.rooftop) {
      let x = 0, z = 0, y = 12, s = 12;
      for (let i = 0; i < 14; i++) {
        pts.push([x, y, z, s]);
        const ns = 11 + R() * 5, gap = 2 + R() * 1.4, rise = R() < 0.35 ? -(1 + R() * 3) : R() * 1.1;
        z -= s / 2 + gap + ns / 2; x += (R() - 0.5) * 3; y = clamp(y + rise, 8, 22); s = ns;
      }
    } else {
      const n = 16, ra = opt.rx || 70, rb = opt.rz || 44;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 1 + (R() - 0.5) * 0.25; pts.push([Math.cos(a) * ra * k, 0, -Math.sin(a) * rb * k]); }
    }
    const W = opt.rooftop ? 9 : 11;
    if (!opt.rooftop) P('block', [0, -1, 0], [opt.rx * 2 + 120, 2, opt.rz * 2 + 120], th.ground, th.groundMat, { name: 'Ground' });
    const segs = opt.rooftop ? pts.length : pts.length;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (opt.rooftop) {
        const h = a[1], s = a[3];
        P('block', [a[0], h / 2, a[2]], [s, h, s], pick(R, th.plat), th.mat, { name: 'Building' });
        for (let k = 0; k < 4; k++) P('block', [a[0] + (R() - 0.5) * s * 0.6, h + 0.6, a[2] + (R() - 0.5) * s * 0.6], [1.2, 1.2, 1.2], '#4E5B74', 'metal', { name: 'Vent' });
        if (i === pts.length - 1) break;
        continue;
      }
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), yaw = Math.atan2(-dx, -dz);
      const ice = opt.ice && i % 4 === 2;
      P('block', [(a[0] + b[0]) / 2, 0.15, (a[2] + b[2]) / 2], [W, 0.3, L + 1], ice ? '#CFEFFF' : th.road, ice ? 'ice' : th.roadMat || 'stone', { rot: [0, (yaw * 180) / Math.PI, 0], name: ice ? 'Ice patch' : 'Road' });
      P('cylinder', [a[0], 0.16, a[2]], [W, 0.32, W], th.road, th.roadMat || 'stone', { name: 'Corner' });
      if (opt.speed && i % 3 === 1) P('block', [(a[0] + b[0]) / 2, 0.33, (a[2] + b[2]) / 2], [W * 0.5, 0.1, 4], '#4CF0FF', 'neon', { rot: [0, (yaw * 180) / Math.PI, 0], name: 'Speed pad', behavior: 'speed', bp: { mult: 1.6, time: 2 } });
      if (opt.walls) for (const sd of [-1, 1]) { const ox = Math.cos(yaw) * sd * (W / 2 + 6), oz = -Math.sin(yaw) * sd * (W / 2 + 6); P('block', [(a[0] + b[0]) / 2 + ox, 4, (a[2] + b[2]) / 2 + oz], [4 + R() * 3, 8 + R() * 8, L], th.wall, th.mat, { rot: [0, (yaw * 180) / Math.PI, 0], name: 'Canyon wall' }); }
    }
    // Gates: every other point; the last one is the finish line.
    const gateIdx = []; for (let i = 2; i < pts.length; i += 2) gateIdx.push(i);
    if (opt.rooftop) gateIdx.length = 0, pts.forEach((p, i) => { if (i > 0) gateIdx.push(i); });
    else gateIdx.push(0);
    gateIdx.forEach((pi, gi) => {
      const p = pts[pi], q = pts[(pi + 1) % pts.length], o = pts[(pi - 1 + pts.length) % pts.length];
      const yaw = Math.atan2(-(q[0] - o[0]), -(q[2] - o[2])), rot = [0, (yaw * 180) / Math.PI, 0], y = p[1];
      const last = gi === gateIdx.length - 1, col = last ? '#FFFFFF' : th.gate || '#FFC53A';
      const ox = Math.cos(yaw) * (W / 2 + 0.4), oz = -Math.sin(yaw) * (W / 2 + 0.4);
      P('block', [p[0] + ox, y + 3, p[2] + oz], [0.6, 6, 0.6], col, 'plastic', { name: 'Gate post', canCollide: !opt.rooftop });
      P('block', [p[0] - ox, y + 3, p[2] - oz], [0.6, 6, 0.6], col, 'plastic', { name: 'Gate post', canCollide: !opt.rooftop });
      P('block', [p[0], y + 6.2, p[2]], [W + 1.4, 0.7, 0.7], last ? '#FF6A2B' : col, 'neon', { rot, name: last ? 'Finish banner' : 'Gate banner', canCollide: false });
      P('block', [p[0], y + 3, p[2]], [W, 6, 1.2], last ? '#FFFFFF' : '#4CF0FF', 'neon', { rot, name: 'Gate ' + (gi + 1), canCollide: false, transparency: 0.82, tag: 'gate', bp: { i: gi } });
    });
    if (opt.rooftop) for (let i = 0; i < pts.length - 1; i++) if (pts[i + 1][1] - pts[i][1] > 2.2) { const p = pts[i]; P('block', [p[0], p[1] + 0.15, p[2] - 4], [3, 0.3, 3], '#7CFF6B', 'neon', { name: 'Bounce pad', behavior: 'bounce', bp: { power: 28 } }); }
    // Scenery
    for (let i = 0; i < (opt.rooftop ? 0 : 26); i++) {
      const a = R() * Math.PI * 2, r = 1.25 + R() * 0.5, x = Math.cos(a) * opt.rx * r, z = -Math.sin(a) * opt.rz * r;
      if (th.tree === 'cactus') { P('cylinder', [x, 2, z], [1, 4, 1], '#3F8F4A', 'grass', { name: 'Cactus' }); P('cylinder', [x + 0.9, 2.6, z], [0.6, 1.6, 0.6], '#3F8F4A', 'grass', { name: 'Cactus arm' }); }
      else if (th.tree === 'pine') { P('cylinder', [x, 1.5, z], [0.8, 3, 0.8], '#6B4A2E', 'wood', { name: 'Trunk' }); P('cylinder', [x, 4.6, z], [3.6, 4, 3.6], '#2F7A55', 'grass', { name: 'Pine' }); }
      else { P('cylinder', [x, 2, z], [0.9, 4, 0.9], '#8A5A35', 'wood', { name: 'Trunk' }); P('sphere', [x, 5, z], [4.4, 4, 4.4], '#4DB06A', 'grass', { name: 'Leaves' }); }
    }
    // Start grid behind the finish line (loop) or at the first roof.
    const s = pts[0], nx = pts[1], dir = Math.atan2(-(nx[0] - s[0]), -(nx[2] - s[2]));
    const back = opt.rooftop ? 0 : 5, sx = s[0] + Math.sin(dir) * back, sz = s[2] + Math.cos(dir) * back, sy = (opt.rooftop ? s[1] : 0.3) + 0.1;
    P('spawn', [sx, sy - 0.05, sz], [3, 0.1, 3], '#FF6A2B', 'plastic', { name: 'Spawn', canCollide: false });
    return { parts, spawn: [sx, sy, sz], spawnYaw: dir + Math.PI, grid: { x: sx, y: sy, z: sz, yaw: dir } };
  };
}

// ---- Rules ----
Modes.obby = {
  label: 'Obby', board: true, boardTitle: 'Stage', hint: 'WASD to move · Space to jump · Reach the flag',
  setup(G) {
    this.total = G.partsByTag('stage').length + 1;
    G.hud.objective(G.modeOpts.tower ? 'Climb to the top' : 'Reach the finish');
    G.hud.stat('stage', `1 / ${this.total}`, { icon: 'flag', label: 'Stage' });
    G.hud.stat('time', fmtTime(0), { icon: 'clock', label: 'Time' });
    G.hud.stat('falls', '0', { icon: 'skull', label: 'Falls' });
    if (G.modeOpts.tower) G.hud.stat('height', '0 m', { icon: 'star', label: 'Height' });
    G.setScore(1);
  },
  update(dt, G) {
    G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
    G.hud.stat('falls', String(G.deaths), { icon: 'skull' });
    if (G.modeOpts.tower) G.hud.stat('height', Math.max(0, Math.round(G.body.pos.y)) + ' m', { icon: 'star' });
  },
  onCheckpoint(p, G) {
    const n = (Number(p.bp && p.bp.stage) || 0) + 1;
    G.setScore(Math.max(G.score, n));
    G.hud.stat('stage', `${G.score} / ${this.total}`, { icon: 'flag' });
  },
  onFinish(p, G) { G.setScore(this.total); },
};
Modes.race = {
  label: 'Race', hint: 'WASD to move · Space to jump · Pass the gates in order',
  setup(G) {
    this.gates = G.partsByTag('gate').sort((a, b) => a.bp.i - b.bp.i); this.laps = G.modeOpts.laps || 1;
    const sp = World.spawn, yaw = World.spawnYaw, fx = -Math.sin(yaw + Math.PI), fz = -Math.cos(yaw + Math.PI), rx = Math.cos(yaw + Math.PI), rz = -Math.sin(yaw + Math.PI);
    this.me = { lap: 1, next: 0, done: false, place: 0 }; this.finishers = 0; this.count = 3.5; G.frozen = true;
    const names = ['Comet', 'Pip', 'Rally'], skill = G.modeOpts.skill || 1;
    this.bots = names.map((nm, i) => {
      const side = i - 1, back = i === 1 ? 3 : 1.5;
      const b = G.bots.add({ name: nm, pos: [sp.x + rx * side * 2.6 - fx * back, sp.y + 0.2, sp.z + rz * side * 2.6 - fz * back], speed: (0.88 + i * 0.05) * skill, seed: G.def.id });
      b.data = { lap: 1, next: 0, done: false, lane: (side) * 2.2, boostT: 0 }; b.yaw = yaw; return b;
    });
    G.hud.objective('Race through the gates');
    G.hud.stat('lap', `1 / ${this.laps}`, { icon: 'flag', label: 'Lap' });
    G.hud.stat('pos', '1st', { icon: 'trophy', label: 'Position' });
    G.hud.stat('time', fmtTime(0), { icon: 'clock', label: 'Time' });
    G.hud.flash('3', 'info', 900); Sfx.play('tick'); this.lastCount = 3;
  },
  progress(r, pos) {
    const g = this.gates[r.next % this.gates.length], prev = this.gates[(r.next - 1 + this.gates.length) % this.gates.length];
    const seg = Math.hypot(g.pos[0] - prev.pos[0], g.pos[2] - prev.pos[2]) || 1, d = Math.hypot(g.pos[0] - pos.x, g.pos[2] - pos.z);
    return r.done ? 1e6 - r.place : (r.lap - 1) * this.gates.length + r.next + clamp(1 - d / seg, 0, 1);
  },
  pass(r, G, who) {
    r.next++;
    if (r.next >= this.gates.length) {
      if (r.lap < this.laps) { r.lap++; r.next = 0; if (who === 'me') { G.hud.flash('Lap ' + r.lap, 'good', 1200); Sfx.play('checkpoint'); } }
      else { r.done = true; r.place = ++this.finishers; if (who === 'me') this.finishMe(G); }
    } else if (who === 'me') Sfx.play('coin');
  },
  finishMe(G) {
    const place = this.me.place, t = G.time, ord = ['1st', '2nd', '3rd', '4th'][place - 1] || place + 'th';
    const best = saveBest(G.def.id, t);
    G.end({ win: place === 1, title: place === 1 ? 'You won the race!' : `You finished ${ord}`, sub: best.isNew ? 'New personal best!' : `Your best: ${fmtTime(best.best)}`, stats: [['Place', ord], ['Time', fmtTime(t)], ['Falls', G.deaths]] });
  },
  onTouch(p, G) {
    if (p.tag !== 'gate') return;
    if (!G.frozen && !this.me.done && p.bp.i === this.me.next % this.gates.length) {
      G.setCheckpoint([p.pos[0], p.pos[1] - p.size[1] / 2 + 0.1, p.pos[2]], G.facing); this.pass(this.me, G, 'me');
    }
    return true;
  },
  update(dt, G) {
    if (this.count > 0) {
      this.count -= dt; const n = Math.ceil(this.count - 0.5);
      if (n !== this.lastCount && n >= 0) { this.lastCount = n; G.hud.flash(n > 0 ? String(n) : 'Go!', n > 0 ? 'info' : 'good', 800); Sfx.play(n > 0 ? 'tick' : 'boost'); }
      if (this.count <= 0.5 && G.frozen) G.frozen = false;
      for (const b of this.bots) b.stop();
      if (G.frozen) return;
    }
    G.hud.stat('time', fmtTime(G.time), { icon: 'clock' });
    G.hud.stat('lap', `${Math.min(this.me.lap, this.laps)} / ${this.laps}`, { icon: 'flag' });
    for (const b of this.bots) {
      const r = b.data; if (r.done || !b.alive) { b.stop(); continue; }
      const g = this.gates[r.next % this.gates.length];
      const yaw = (g.rot[1] || 0) * DEG, lx = Math.cos(yaw) * r.lane, lz = -Math.sin(yaw) * r.lane;
      b.goTo(g.pos[0] + lx, g.pos[2] + lz, 0.1);
      if (Math.hypot(g.pos[0] - b.pos.x, g.pos[2] - b.pos.z) < 5.5 && Math.abs(g.pos[1] - b.pos.y) < 6) this.pass(r, G, b);
      // jump gaps ahead (rooftops) and ride speed pads
      const bd = b.body;
      if (bd.grounded && (bd.vel.x || bd.vel.z)) {
        const hs = Math.hypot(bd.vel.x, bd.vel.z) || 1, ax = bd.pos.x + (bd.vel.x / hs) * 1.6, az = bd.pos.z + (bd.vel.z / hs) * 1.6;
        const gy = Phys.groundAt(ax, az, bd.pos.y + 1, 6); if (gy === null || gy < bd.pos.y - 1.2) b.jump();
        if (bd.groundC && bd.groundC.part.behavior === 'speed') { bd.speedMul = b.speed * 1.6; r.boostT = 2; }
      }
      if (r.boostT > 0 && (r.boostT -= dt) <= 0) bd.speedMul = b.speed;
    }
    const all = [{ r: this.me, pos: G.body.pos, me: true }, ...this.bots.map(b => ({ r: b.data, pos: b.pos }))];
    all.sort((a, b) => this.progress(b.r, b.pos) - this.progress(a.r, a.pos));
    const place = all.findIndex(x => x.me) + 1; G.hud.stat('pos', ['1st', '2nd', '3rd', '4th'][place - 1], { icon: 'trophy' });
  },
  onBotDown(bot, why, G) { setTimeout(() => { if (G.mode === this && !G.ended) { const g = this.gates[(bot.data.next - 1 + this.gates.length) % this.gates.length]; bot.respawn([g.pos[0], g.pos[1] + 1, g.pos[2]]); } }, 1200); },
  onDeath(G) { return false; },
};
// ---- Themes ----
export const OBBY_THEMES = {
  lava: { plat: ['#3E3A44', '#55505C', '#6B6470'], mat: 'stone', hazard: '#FF3B1F', accent: '#FFC53A', sea: '#FF5A1F', seaName: 'Lava', deco: 10, floor2: '#4A4450', cp: '#FF6A2B' },
  candy: { plat: ['#FF9ACB', '#FFD1E8', '#B8E6FF', '#FFF1A8', '#C9B8FF'], mat: 'plastic', hazard: '#FF3B6B', accent: '#FF6AB0', sea: '#FFE3F1', seaName: 'Cotton candy', seaMat: 'plastic', deco: 18, decoShapes: ['sphere', 'cylinder'], cp: '#7A4FD0' },
  neon: { plat: ['#7A4FD0', '#2D62F0', '#E23E62', '#17A39C'], mat: 'metal', hazard: '#FF2A6D', accent: '#4CF0FF', sea: '#14082E', seaName: 'Void', seaMat: 'plastic', deco: 14, cp: '#4CF0FF' },
  jungle: { plat: ['#4E7A39', '#3F6A35', '#6B8F3A'], mat: 'grass', hazard: '#E23E62', accent: '#FFC53A', sea: '#2E7FA8', seaName: 'River', seaMat: 'ice', deco: 16, decoShapes: ['sphere', 'cylinder'], cp: '#C08A55' },
  ice: { plat: ['#CFEFFF', '#E8F6FF', '#A8D8F0'], mat: 'ice', hazard: '#2D62F0', accent: '#FFFFFF', sea: '#E8F0F8', seaName: 'Snow', seaMat: 'sand', deco: 12, cp: '#2D62F0', glass: '#D8F4FF' },
  sky: { plat: ['#6CC38A', '#8FD19E', '#C08A55'], mat: 'grass', hazard: '#E23E62', accent: '#FFC53A', sea: null, deco: 22, decoShapes: ['sphere'], cp: '#FF6A2B' },
  spinner: { plat: ['#2D62F0', '#FFC53A', '#17A39C', '#FF6A2B'], mat: 'plastic', hazard: '#E23E62', accent: '#FFC53A', sea: '#1B2338', seaName: 'Pit', seaMat: 'plastic', deco: 8, cp: '#7A4FD0' },
  pastel: { plat: ['#BDE7D0', '#FFE3B3', '#D9D2FF', '#FFD3DC', '#BFE7F2'], mat: 'plastic', hazard: '#FF8FA8', accent: '#FFE07A', sea: '#E9F7EF', seaName: 'Soft floor', seaMat: 'plastic', deco: 14, decoShapes: ['sphere'], cp: '#7FC8A9' },
  desert: { plat: ['#D9B47A', '#C9A46A', '#E6C890'], mat: 'sand', hazard: '#FF6A2B', accent: '#8A5A35', sea: '#E2C58E', seaName: 'Quicksand', seaMat: 'sand', deco: 12, cp: '#2D62F0', wall: '#B98F5A' },
  toy: { plat: ['#FF6A2B', '#2D62F0', '#FFC53A', '#3FA34D', '#E23E62'], mat: 'plastic', hazard: '#E23E62', accent: '#FFC53A', sea: '#F4EBD8', seaName: 'Rug', seaMat: 'plastic', deco: 20, cp: '#7A4FD0' },
  space: { plat: ['#9AA5B1', '#C9D2DC', '#6B7686'], mat: 'metal', hazard: '#FF3B6B', accent: '#4CF0FF', sea: null, deco: 16, decoShapes: ['sphere'], cp: '#4CF0FF' },
  rainbow: { plat: ['#FF3B3B', '#FF9A2B', '#FFE02B', '#3FD07A', '#2D9CF0', '#7A4FD0'], mat: 'neon', hazard: '#FFFFFF', accent: '#FFFFFF', sea: null, deco: 18, decoShapes: ['sphere'], cp: '#FFFFFF' },
  pirate: { plat: ['#8A5A35', '#A06B42', '#6B4A2E'], mat: 'wood', hazard: '#E23E62', accent: '#EDEFF2', sea: '#2A6FB0', seaName: 'Sea', seaMat: 'ice', deco: 10, cp: '#E23E62', beam: '#6B4A2E' },
  haunted: { plat: ['#3A2E4A', '#4B3B5E', '#2A2236'], mat: 'stone', hazard: '#9DFF6B', accent: '#C9A8FF', sea: '#120A1E', seaName: 'Darkness', seaMat: 'plastic', deco: 12, cp: '#7A4FD0', vanish: '#C9A8FF' },
  speed: { plat: ['#2D62F0', '#FFFFFF', '#FF6A2B'], mat: 'plastic', hazard: '#E23E62', accent: '#4CF0FF', sea: '#1B2338', seaName: 'Pit', seaMat: 'plastic', deco: 6, cp: '#FF6A2B' },
  bounce: { plat: ['#FFC53A', '#FF6A2B', '#3FA34D'], mat: 'plastic', hazard: '#E23E62', accent: '#7CFF6B', sea: '#6CC38A', seaName: 'Grass', seaMat: 'grass', deco: 12, cp: '#2D62F0' },
};
export const OBBY_DIFF = { easy: { gap: 2.4, plat: 4, rise: 0.6 }, med: { gap: 3.0, plat: 3.2, rise: 0.9 }, hard: { gap: 3.5, plat: 2.6, rise: 1.0 } };
export const obbyDef = (id, title, desc, th, env, o) => ({ id, title, cat: 'obby', mode: 'obby', desc, env, accent: th.accent, icon: 'flag', killY: -7, build: obbyBuild(th, Object.assign({ env, turns: true }, o)) });
registerGames([
  obbyDef('lava-leap', 'Lava Leap', 'Hop across stone islands over a bubbling lava sea. Swinging hammers and spinning bars stand in your way.', OBBY_THEMES.lava, { sky: 'sunset' }, { stages: 10, diff: OBBY_DIFF.med, mix: ['hops', 'hops', 'lava', 'spinner', 'swing', 'beam', 'stairs'] }),
  obbyDef('candy-clouds', 'Candy Clouds', 'Bounce through a sugary sky of pink and blue platforms, then cross fake glass tiles to the finish.', OBBY_THEMES.candy, { sky: 'candy' }, { stages: 9, diff: OBBY_DIFF.med, mix: ['hops', 'bounce', 'fake', 'mover', 'stairs'] }),
  obbyDef('neon-night-run', 'Neon Night Run', 'A glowing course in the dark: moving platforms, laser spinners and tiles that vanish under your feet.', OBBY_THEMES.neon, { sky: 'neon' }, { stages: 11, diff: OBBY_DIFF.hard, mix: ['hops', 'mover', 'spinner', 'vanish', 'speed', 'beam'] }),
  obbyDef('jungle-logs', 'Jungle Logs', 'Ride sliding logs across a jungle river, climb vine steps and dodge the swinging traps.', OBBY_THEMES.jungle, { sky: 'forest' }, { stages: 9, diff: OBBY_DIFF.med, mix: ['logs', 'logs', 'hops', 'swing', 'stairs', 'beam'] }),
  obbyDef('ice-peak', 'Ice Peak', 'Slippery ice platforms all the way up a frozen mountain. Watch your footing.', OBBY_THEMES.ice, { sky: 'snow' }, { stages: 9, diff: OBBY_DIFF.med, mix: ['hops', 'stairs', 'beam', 'vanish', 'ramp'] }),
  obbyDef('sky-islands', 'Sky Islands', 'Leap between floating grass islands at sunset, with moving rafts and bounce pads between them.', OBBY_THEMES.sky, { sky: 'sunset' }, { stages: 10, diff: OBBY_DIFF.med, mix: ['hops', 'mover', 'bounce', 'ramp', 'stairs'] }),
  obbyDef('spinner-mayhem', 'Spinner Mayhem', 'Every stage has a spinning bar or swinging hammer. Time your jumps or start over.', OBBY_THEMES.spinner, { sky: 'day' }, { stages: 10, diff: OBBY_DIFF.med, mix: ['spinner', 'spinner', 'swing', 'hops'] }),
  obbyDef('pastel-steps', 'Pastel Steps', 'A gentle first obby with big soft platforms and short gaps. Great for new players.', OBBY_THEMES.pastel, { sky: 'day' }, { stages: 7, diff: OBBY_DIFF.easy, mix: ['hops', 'stairs', 'ramp', 'bounce'] }),
  obbyDef('desert-ruins', 'Desert Ruins', 'Climb crumbling sandstone ruins over quicksand, past walls and lava traps.', OBBY_THEMES.desert, { sky: 'desert' }, { stages: 10, diff: OBBY_DIFF.med, mix: ['hops', 'walls', 'lava', 'stairs', 'ramp', 'vanish'] }),
  obbyDef('toy-box-climb', 'Toy Box Climb', 'Giant toy blocks stacked across a playroom floor. Bounce, hop and balance your way to the top.', OBBY_THEMES.toy, { sky: 'day' }, { stages: 9, diff: OBBY_DIFF.easy, mix: ['hops', 'bounce', 'stairs', 'beam', 'mover'] }),
  obbyDef('low-g-station', 'Low-G Station', 'A space station course with low gravity: huge floaty jumps between metal platforms.', OBBY_THEMES.space, { sky: 'space', gravity: 0.4 }, { stages: 10, diff: OBBY_DIFF.hard, mix: ['hops', 'hops', 'mover', 'vanish', 'stairs'] }),
  obbyDef('rainbow-road', 'Rainbow Road', 'A glowing rainbow path across the night sky. Speed pads, bounces and narrow bridges.', OBBY_THEMES.rainbow, { sky: 'night' }, { stages: 10, diff: OBBY_DIFF.med, mix: ['speed', 'beam', 'hops', 'bounce', 'mover'] }),
  obbyDef('pirate-planks', 'Pirate Planks', 'Walk the planks between ships, cross wobbly rafts and dodge swinging anchors over the sea.', OBBY_THEMES.pirate, { sky: 'day' }, { stages: 9, diff: OBBY_DIFF.med, mix: ['beam', 'beam', 'logs', 'swing', 'hops'] }),
  obbyDef('haunted-hall', 'Haunted Hall', 'Floors that fade away, glass that breaks and lanterns that swing in a purple fog.', OBBY_THEMES.haunted, { sky: 'haunted' }, { stages: 9, diff: OBBY_DIFF.med, mix: ['vanish', 'fake', 'swing', 'hops', 'beam'] }),
  obbyDef('speedrun-sprint', 'Speedrun Sprint', 'A short course built for speed. Chain the speed pads and beat your best time.', OBBY_THEMES.speed, { sky: 'day' }, { stages: 6, diff: OBBY_DIFF.med, mix: ['speed', 'hops', 'ramp', 'speed'] }),
  obbyDef('bounce-castle', 'Bounce Castle', 'Bounce pads everywhere: launch from pad to pad up to the castle flag.', OBBY_THEMES.bounce, { sky: 'day' }, { stages: 8, diff: OBBY_DIFF.easy, mix: ['bounce', 'bounce', 'hops', 'stairs'] }),
  { id: 'tower-of-trials', title: 'Tower of Trials', cat: 'obby', mode: 'obby', modeOpts: { tower: true }, env: { sky: 'day' }, accent: '#9AA5B1', icon: 'flag',
    desc: 'Spiral up a giant tower past vanishing steps, moving ledges and sweeping bars. Checkpoints every eight steps.',
    build: towerBuild({ plat: ['#FF6A2B', '#FFC53A', '#2D62F0', '#3FA34D'], core: '#9AA5B1', mat: 'stone', accent: '#FFC53A', ground: '#6CC38A', groundMat: 'grass' }, { hops: 56, radius: 11, mix: ['plain', 'plain', 'vanish', 'move', 'lava', 'bar'] }), thumb: { pos: [42, 40, 42], look: [0, 30, 0] } },
  { id: 'mega-spiral', title: 'Mega Spiral', cat: 'obby', mode: 'obby', modeOpts: { tower: true }, env: { sky: 'sunset' }, accent: '#7A4FD0', icon: 'flag',
    desc: 'The tallest climb in PlayForge: a long, wide spiral to the clouds. Pace yourself.',
    build: towerBuild({ plat: ['#7A4FD0', '#E23E62', '#FFC53A', '#17A39C'], core: '#3B3550', mat: 'brick', accent: '#FF9ACB', ground: '#3B3550', groundMat: 'stone' }, { hops: 96, radius: 13, mix: ['plain', 'plain', 'plain', 'vanish', 'move', 'bar'] }), thumb: { pos: [55, 60, 55], look: [0, 50, 0] } },
  { id: 'turbo-track', title: 'Turbo Track', cat: 'race', mode: 'race', modeOpts: { laps: 2 }, env: { sky: 'day' }, accent: '#4CF0FF', icon: 'trophy',
    desc: 'Race three rivals around a speedway packed with speed pads. Two laps, gates in order.',
    build: trackBuild({ ground: '#6CC38A', groundMat: 'grass', road: '#3A3F4A', gate: '#FFC53A' }, { rx: 70, rz: 44, speed: true }) },
  { id: 'canyon-dash', title: 'Canyon Dash', cat: 'race', mode: 'race', modeOpts: { laps: 2 }, env: { sky: 'desert' }, accent: '#D9B47A', icon: 'trophy',
    desc: 'A sandy loop between tall canyon walls. Hug the corners and beat the bots to the line.',
    build: trackBuild({ ground: '#E2C58E', groundMat: 'sand', road: '#B98F5A', roadMat: 'sand', wall: '#C9875A', mat: 'stone', tree: 'cactus', gate: '#FF6A2B' }, { rx: 66, rz: 40, walls: true }) },
  { id: 'snowy-sprint', title: 'Snowy Sprint', cat: 'race', mode: 'race', modeOpts: { laps: 2 }, env: { sky: 'snow' }, accent: '#CFEFFF', icon: 'trophy',
    desc: 'A winter loop with slippery ice patches on the corners. Slow down before you slide.',
    build: trackBuild({ ground: '#F4F8FC', groundMat: 'sand', road: '#9AA8B8', gate: '#2D62F0', tree: 'pine' }, { rx: 64, rz: 42, ice: true }) },
  { id: 'rooftop-run', title: 'Rooftop Run', cat: 'race', mode: 'race', modeOpts: { laps: 1, skill: 0.95 }, env: { sky: 'sunset' }, accent: '#FF6A2B', icon: 'trophy', killY: -5,
    desc: 'Sprint and jump across city rooftops to the far tower. Miss a jump and you restart at your last gate.',
    build: trackBuild({ plat: ['#4E5B74', '#5E6B84', '#3A4256', '#6B7686'], mat: 'brick', gate: '#FFC53A' }, { rooftop: true }) },
]);
