/* ---------- 9. Physics: signed-distance colliders + a floating-capsule player ---------- */
// Colliders are SDF shapes (box, wedge, ellipsoid, cylinder) with any rotation. Solid ones block bodies;
// trigger ones (parts that can't collide but have a behavior or tag) are only reported by touching().
// Kinematic colliders (spinning, moving, swinging parts) are moved once per physics step and carry bodies standing on them.
const Phys = (() => {
  const V3 = THREE.Vector3;
  let solids = [], triggers = [];
  const byId = new Map();
  const cands = [];
  const tq = new V3(), tv = new V3(), gn = new V3(), ng = new V3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  let hitC = null, seq = 0;
  const params = { gravity: 50, speed: 12.8, jump: 16 };
  const SPEED = 12.8;
  const shapeOf = p => (p.shape === 'block' ? 'box' : p.shape === 'spawn' || p.shape === 'cylinder' ? 'cyl' : p.shape === 'sphere' || p.shape === 'wedge' ? p.shape : 'box');
  function aabb(c) {
    c.min.set(Infinity, Infinity, Infinity); c.max.set(-Infinity, -Infinity, -Infinity);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      tq.set(sx * c.half.x, sy * c.half.y, sz * c.half.z).applyQuaternion(c.quat).add(c.center); c.min.min(tq); c.max.max(tq);
    }
  }
  function makeCollider(p) {
    const c = {
      shape: shapeOf(p), part: p, id: p.id, solid: p.canCollide !== false, enabled: true, kin: false, moveSeq: -1,
      center: new V3(p.pos[0], p.pos[1], p.pos[2]),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler((p.rot[0] || 0) * DEG, (p.rot[1] || 0) * DEG, (p.rot[2] || 0) * DEG, 'YXZ')),
      half: new V3(Math.abs(p.size[0]) / 2, Math.abs(p.size[1]) / 2, Math.abs(p.size[2]) / 2),
      min: new V3(), max: new V3(), p0: new V3(), q0: new THREE.Quaternion(),
    };
    c.inv = c.quat.clone().invert();
    if (c.shape === 'wedge') { const L = Math.hypot(c.half.z, c.half.y) || 1; c.ny = c.half.z / L; c.nz = c.half.y / L; }
    aabb(c);
    return c;
  }
  function sdBox(x, y, z, h) {
    const qx = Math.abs(x) - h.x, qy = Math.abs(y) - h.y, qz = Math.abs(z) - h.z;
    const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
    return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0);
  }
  function sdf(c, wx, wy, wz) {
    tq.set(wx - c.center.x, wy - c.center.y, wz - c.center.z).applyQuaternion(c.inv);
    const x = tq.x, y = tq.y, z = tq.z, h = c.half;
    switch (c.shape) {
      case 'box': return sdBox(x, y, z, h);
      case 'wedge': return Math.max(sdBox(x, y, z, h), y * c.ny + z * c.nz);
      case 'sphere': {
        const ax = x / h.x, ay = y / h.y, az = z / h.z, bx = ax / h.x, by = ay / h.y, bz = az / h.z;
        const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
        return k1 > 1e-6 ? k0 * (k0 - 1) / k1 : -Math.min(h.x, h.y, h.z);
      }
      case 'cyl': {
        const r = Math.min(h.x, h.z), dx = Math.sqrt(x * x + z * z) - r, dy = Math.abs(y) - h.y;
        const ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
        return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy);
      }
    }
    return 1e9;
  }
  function grad(c, x, y, z, out) {
    const e = 0.003;
    out.set(sdf(c, x + e, y, z) - sdf(c, x - e, y, z), sdf(c, x, y + e, z) - sdf(c, x, y - e, z), sdf(c, x, y, z + e) - sdf(c, x, y, z - e));
    const l = out.length(); if (l < 1e-9) out.set(0, 1, 0); else out.multiplyScalar(1 / l);
    return out;
  }
  const overlaps = (c, x0, y0, z0, x1, y1, z1) => c.max.x >= x0 && c.min.x <= x1 && c.max.y >= y0 && c.min.y <= y1 && c.max.z >= z0 && c.min.z <= z1;
  function gather(x0, y0, z0, x1, y1, z1, list = solids) {
    cands.length = 0;
    for (const c of list) if (c.enabled && overlaps(c, x0, y0, z0, x1, y1, z1)) cands.push(c);
  }
  function minSdf(x, y, z) {
    let best = 1e9; hitC = null;
    for (const c of cands) { const d = sdf(c, x, y, z); if (d < best) { best = d; hitC = c; } }
    return best;
  }
  function marchDown(x, y0, z, maxT) {
    let t = 0;
    for (let i = 0; i < 24; i++) { const d = minSdf(x, y0 - t, z); if (d < 0.003) return t; t += d; if (t > maxT) return -1; }
    return -1;
  }
  const R = 0.4, OFFS = [0.75, 1.2, 1.6], PROBE_UP = 0.72, MAX_UP = 0.6, WALKABLE = 0.62;
  const PROBES = [[0, 0], [0.27, 0], [-0.27, 0], [0, 0.27], [0, -0.27], [0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]];
  function createBody(spawn) {
    return {
      pos: new V3().copy(spawn), vel: new V3(), grounded: false, coyote: 0, jumpBuf: 0, noSnap: 0, normal: new V3(0, 1, 0),
      groundC: null, speedMul: 1, speedT: 0, jumpMul: 1, yawDelta: 0, events: [],
    };
  }
  // Ride a kinematic part: move the body by the part's motion this step.
  function carry(b) {
    const c = b.groundC;
    if (!b.grounded || !c || !c.kin || c.moveSeq !== seq) return;
    qb.copy(c.q0).invert();
    tv.copy(b.pos).sub(c.p0).applyQuaternion(qb).applyQuaternion(c.quat).add(c.center);
    b.pos.copy(tv);
    qa.copy(c.quat).multiply(qb); // this step's rotation, in world space
    const yaw = 2 * Math.atan2(qa.y, qa.w); if (Number.isFinite(yaw)) b.yawDelta += Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }
  function step(b, dt, mx, mz, jumpPressed, jumpHeld) {
    carry(b);
    if (b.speedT > 0) { b.speedT -= dt; if (b.speedT <= 0) b.speedMul = 1; }
    const onIce = b.grounded && b.groundC && b.groundC.part.material === 'ice';
    const acc = (b.grounded ? (onIce ? 9 : 75) : 30) * dt, sp = params.speed * b.speedMul;
    let dx = mx * sp - b.vel.x, dz = mz * sp - b.vel.z; const dl = Math.sqrt(dx * dx + dz * dz);
    if (dl > acc) { dx *= acc / dl; dz *= acc / dl; }
    b.vel.x += dx; b.vel.z += dz;
    if (jumpPressed) b.jumpBuf = 0.14; else b.jumpBuf -= dt;
    b.noSnap -= dt;
    if ((b.jumpBuf > 0 || jumpHeld) && (b.grounded || b.coyote > 0) && b.noSnap <= 0) {
      b.vel.y = params.jump * b.jumpMul; b.grounded = false; b.coyote = 0; b.jumpBuf = 0; b.noSnap = 0.15; b.events.push('jump');
    }
    if (!b.grounded) b.vel.y = Math.max(b.vel.y - params.gravity * dt, -75);
    const wasGrounded = b.grounded;
    b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
    gather(b.pos.x - 1.2, b.pos.y - 1.6, b.pos.z - 1.2, b.pos.x + 1.2, b.pos.y + 2.6, b.pos.z + 1.2);
    // Body spheres push out of walls and ceilings.
    let restC = null;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const off of OFFS) for (const c of cands) {
        const cy = b.pos.y + off, d = sdf(c, b.pos.x, cy, b.pos.z);
        if (d < R) {
          grad(c, b.pos.x, cy, b.pos.z, gn); b.pos.addScaledVector(gn, R - d);
          if (off === OFFS[0] && gn.y > WALKABLE) restC = c;
          const vn = b.vel.dot(gn); if (vn < 0) b.vel.addScaledVector(gn, -vn); moved = true;
        }
      }
      if (!moved) break;
    }
    // Ground probes keep the feet on floors, steps and slopes.
    b.grounded = false; b.groundC = null;
    if (b.vel.y <= 0.5 && b.noSnap <= 0) {
      const reach = PROBE_UP + (wasGrounded ? 0.45 : 0.03) + Math.max(0, -b.vel.y * dt);
      let bestY = -Infinity, bestC = null, bx = 0, bz = 0;
      for (const [ox, oz] of PROBES) {
        const x = b.pos.x + ox, z = b.pos.z + oz, y0 = b.pos.y + PROBE_UP, t = marchDown(x, y0, z, reach);
        if (t >= 0 && y0 - t > bestY && y0 - t <= b.pos.y + MAX_UP) { bestY = y0 - t; bestC = hitC; bx = x; bz = z; }
      }
      if (bestC) {
        grad(bestC, bx, bestY, bz, ng);
        if (ng.y > WALKABLE) {
          if (!wasGrounded && b.vel.y < -14) b.events.push('land');
          b.pos.y = bestY; b.vel.y = 0; b.grounded = true; b.normal.copy(ng); b.groundC = bestC;
        }
      }
    }
    // Resting on an edge the probes can't see (a gap between tiles): still counts as standing.
    if (!b.grounded && restC && b.vel.y <= 0.5 && b.noSnap <= 0) { b.grounded = true; b.groundC = restC; b.vel.y = 0; }
    if (b.grounded) b.coyote = 0.1; else b.coyote -= dt;
  }
  // Every collider (solid or trigger) the body overlaps: feet, middle and head test spheres.
  function touching(b, out = []) {
    out.length = 0;
    const x = b.pos.x, y = b.pos.y, z = b.pos.z;
    for (const list of [solids, triggers]) for (const c of list) {
      if (!c.enabled || !overlaps(c, x - 1, y - 0.6, z - 1, x + 1, y + 2.4, z + 1)) continue;
      if (sdf(c, x, y + 0.08, z) < 0.34 || sdf(c, x, y + 1, z) < 0.47 || sdf(c, x, y + 1.7, z) < 0.42) out.push(c);
    }
    return out;
  }
  // Nearest solid within r of a point (projectiles, splats). Returns the collider or null.
  function pointHit(x, y, z, r = 0) {
    let best = null, bd = Infinity;
    for (const c of solids) {
      if (!c.enabled || !overlaps(c, x - r, y - r, z - r, x + r, y + r, z + r)) continue;
      const d = sdf(c, x, y, z); if (d < r && d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // Sphere-traced ray against solids. Returns {t, c, point, normal} or null.
  function raycast(o, dir, maxDist = 200) {
    const ex = dir.x * maxDist, ey = dir.y * maxDist, ez = dir.z * maxDist;
    gather(Math.min(o.x, o.x + ex), Math.min(o.y, o.y + ey), Math.min(o.z, o.z + ez), Math.max(o.x, o.x + ex), Math.max(o.y, o.y + ey), Math.max(o.z, o.z + ez));
    if (!cands.length) return null;
    let t = 0;
    for (let i = 0; i < 96 && t <= maxDist; i++) {
      const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t, d = minSdf(x, y, z);
      if (d < 0.01) { const point = new V3(x, y, z); return { t, c: hitC, point, normal: grad(hitC, x, y, z, new V3()) }; }
      t += Math.max(d, 0.02);
    }
    return null;
  }
  // Height of the first solid surface below (x, fromY, z), or null.
  function groundAt(x, z, fromY = 200, maxDown = 400) {
    gather(x - 0.01, fromY - maxDown, z - 0.01, x + 0.01, fromY, z + 0.01);
    const t = marchDown(x, fromY, z, maxDown); return t < 0 ? null : fromY - t;
  }
  return {
    SPEED, params, sdf, grad, touching, pointHit, raycast, groundAt, createBody, step,
    get solids() { return solids; }, get triggers() { return triggers; },
    // Build colliders for a part list. Parts that can't collide only get a trigger collider when they matter to rules.
    setParts(parts) {
      solids = []; triggers = []; byId.clear();
      for (const p of parts) this.addPart(p);
    },
    addPart(p) {
      if (p.canCollide === false && !p.behavior && !p.tag) return null;
      const c = makeCollider(p); (c.solid ? solids : triggers).push(c); byId.set(p.id, c); return c;
    },
    removePart(id) {
      const c = byId.get(id); if (!c) return; byId.delete(id);
      solids = solids.filter(x => x !== c); triggers = triggers.filter(x => x !== c);
    },
    collider(id) { return byId.get(id) || null; },
    setEnabled(id, on) { const c = byId.get(id); if (c) c.enabled = !!on; },
    // Kinematic move: remember the old transform so bodies standing on it are carried.
    moveCollider(c, pos, quat) {
      c.p0.copy(c.center); c.q0.copy(c.quat); c.center.copy(pos); c.quat.copy(quat); c.inv.copy(quat).invert();
      c.kin = true; c.moveSeq = seq; aabb(c);
    },
    beginStep() { seq++; },
  };
})();
