/* ---------- 11. Input: keyboard, mouse, touch joystick, jump button, camera drag and pinch, actions ---------- */
const Input = {
  keys: new Set(), joyId: null, joyX: 0, joyY: 0, ox: 0, oy: 0, cam: new Map(), pinch: 0,
  jumpHeld: false, jumpQueued: false, lookDX: 0, lookDY: 0, zoom: 0, enabled: false,
  JOY_R: 52,
  aim: false,          // shooter camera: mouse aims (pointer lock on desktop) and left click fires
  actions: new Map(),  // id -> {id, key, held, onDown, onUp, btn}
  init() {
    const tl = $('#touch-layer'), base = $('#joy-base'), knob = $('#joy-knob');
    const placeIdle = () => {
      base.classList.add('idle'); knob.style.transform = '';
      base.style.left = 'calc(env(safe-area-inset-left, 0px) + 100px)'; base.style.top = 'calc(100% - env(safe-area-inset-bottom, 0px) - 120px)';
    };
    this.placeIdle = placeIdle;
    const pinchDist = () => { const p = [...this.cam.values()]; return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    tl.addEventListener('pointerdown', e => {
      const ci = $('#chat-input'); if (document.activeElement === ci) ci.blur();
      if (!this.enabled) return;
      if (e.pointerType === 'touch') document.body.classList.add('touch');
      if (e.pointerType === 'mouse' && this.aim && e.button === 0) {
        if (this.locked()) { this.press('Mouse0'); return; }
        if (tl.requestPointerLock) { try { const r = tl.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* optional */ } }
        this.press('Mouse0'); this.mouseFire = true; // fire on the same click; drag still looks around
      }
      try { tl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (e.pointerType !== 'mouse' && this.joyId === null && e.clientX < tl.clientWidth * 0.45 && e.clientY > tl.clientHeight * 0.3) {
        this.joyId = e.pointerId; this.ox = e.clientX; this.oy = e.clientY; this.joyX = this.joyY = 0;
        base.classList.remove('idle'); base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px'; knob.style.transform = '';
        return;
      }
      this.cam.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.cam.size === 2) this.pinch = pinchDist();
    });
    tl.addEventListener('pointermove', e => {
      if (this.locked()) { this.lookDX += e.movementX * 0.45; this.lookDY += e.movementY * 0.45; return; }
      if (e.pointerId === this.joyId) {
        let dx = e.clientX - this.ox, dy = e.clientY - this.oy; const l = Math.hypot(dx, dy), R = this.JOY_R;
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const m = Math.min(1, l / R), dead = 0.12, k = m < dead ? 0 : (m - dead) / (1 - dead);
        this.joyX = l > 0 ? (dx / Math.max(l, 1e-6)) * k : 0; this.joyY = l > 0 ? (dy / Math.max(l, 1e-6)) * k : 0;
        return;
      }
      const p = this.cam.get(e.pointerId); if (!p) return;
      if (this.cam.size === 1) { this.lookDX += e.clientX - p.x; this.lookDY += e.clientY - p.y; }
      p.x = e.clientX; p.y = e.clientY;
      if (this.cam.size === 2) { const d = pinchDist(); if (this.pinch > 0 && d > 0) this.zoom += (this.pinch - d) * 2.2; this.pinch = d; }
    });
    const up = e => {
      if (e.pointerType === 'mouse' && e.button === 0 && (this.mouseFire || this.locked())) { this.mouseFire = false; this.release('Mouse0'); }
      if (e.pointerId === this.joyId) { this.joyId = null; this.joyX = this.joyY = 0; placeIdle(); return; }
      this.cam.delete(e.pointerId); if (this.cam.size < 2) this.pinch = 0;
    };
    tl.addEventListener('pointerup', up); tl.addEventListener('pointercancel', up);
    tl.addEventListener('contextmenu', e => e.preventDefault());
    tl.addEventListener('wheel', e => { if (this.enabled) { e.preventDefault(); this.zoom += e.deltaY; } }, { passive: false });
    const jb = $('#hud-jump');
    jb.addEventListener('pointerdown', e => { e.preventDefault(); try { jb.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.jumpHeld = true; this.jumpQueued = true; jb.classList.add('down'); });
    const jup = () => { this.jumpHeld = false; jb.classList.remove('down'); };
    jb.addEventListener('pointerup', jup); jb.addEventListener('pointercancel', jup); jb.addEventListener('lostpointercapture', jup);
    const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', e => {
      if (Engine.mode !== 'game' || !this.enabled || isTyping(e)) return;
      if (MOVE.includes(e.code)) {
        e.preventDefault();
        if (e.code === 'Space') { if (!this.keys.has('Space')) this.jumpQueued = true; this.jumpHeld = true; }
        this.keys.add(e.code);
      }
      if (!e.repeat) this.press(e.code);
    });
    window.addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'Space') this.jumpHeld = false; this.release(e.code); });
    window.addEventListener('blur', () => this.release());
    document.addEventListener('pointerlockchange', () => { if (!this.locked()) this.release('Mouse0'); });
    placeIdle();
  },
  locked() { return document.pointerLockElement === $('#touch-layer'); },
  unlock() { if (this.locked() && document.exitPointerLock) document.exitPointerLock(); },
  // Action keys and buttons (fire, chop, use...). Registered by Game.addAction.
  press(key) { for (const a of this.actions.values()) if ((a.key === key || a.key2 === key) && !a.held) this.down(a); },
  down(a) { if (!this.enabled || a.disabled) return; a.held = true; if (a.btn) a.btn.classList.add('down'); try { if (a.onDown) a.onDown(); } catch (e) { console.error(e); } },
  up(a) { if (!a.held) return; a.held = false; if (a.btn) a.btn.classList.remove('down'); try { if (a.onUp) a.onUp(); } catch (e) { console.error(e); } },
  release(key) {
    if (key) { for (const a of this.actions.values()) if (a.key === key || a.key2 === key) this.up(a); return; }
    this.keys.clear(); this.cam.clear(); this.joyId = null; this.joyX = this.joyY = 0; this.jumpHeld = false; this.jumpQueued = false;
    this.lookDX = this.lookDY = this.zoom = 0; this.pinch = 0; this.mouseFire = false; $('#hud-jump').classList.remove('down');
    for (const a of this.actions.values()) this.up(a);
    if (this.placeIdle) this.placeIdle();
  },
  // Camera-relative move vector on the ground plane.
  move(yaw) {
    const k = this.keys; let ix = 0, iy = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
    ix += this.joyX; iy -= this.joyY;
    const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    return [rx * ix + fx * iy, rz * ix + fz * iy];
  },
};
function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }
