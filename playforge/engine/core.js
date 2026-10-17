// PlayForge engine core: utilities, settings, sound, word filter, platform state (Caps, Me, Profile),
// skin layout and starter skins. Browser only: import the engine from client code after mount.

/* ---------- 1. Utilities ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export const DEG = Math.PI / 180;
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: keep going */ } },
};
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex); const to = amt < 0 ? 0 : 255, t = Math.abs(amt);
  return rgbToHex(r + (to - r) * t, g + (to - g) * t, b + (to - b) * t);
}
export function normHex(s) {
  s = String(s || '').trim(); if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map(c => c + c).join('');
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : null;
}
export function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888888'; }
// Toasts and confirm dialogs live in stores.js; the React shell renders them.
export { toast, askChoice } from './stores.js';

/* ---------- 2. Settings ---------- */
export const PRESETS = {
  low: { prCap: 1, prMul: 0.75, shadow: 0, clouds: false, fogNear: 45, fogFar: 170, aa: false, help: 'Fastest. No shadows or clouds, lower resolution.' },
  medium: { prCap: 1.25, prMul: 1, shadow: 1024, clouds: true, fogNear: 70, fogFar: 270, aa: false, help: 'Tuned for phones. Shadows near you and clouds overhead.' },
  high: { prCap: 2, prMul: 1, shadow: 2048, clouds: true, fogNear: 110, fogFar: 430, aa: true, help: 'Sharpest. Soft shadows, anti-aliasing and full resolution.' },
};
export const IS_TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && 'ontouchstart' in window);
export const Settings = Object.assign(
  { preset: IS_TOUCH ? 'medium' : 'high', volume: 70, sensitivity: 1, invertY: false, showFps: false, dynamicRes: true, bubbles: true },
  LS.get('pf.v1.settings', {})
);
if (!PRESETS[Settings.preset]) Settings.preset = 'medium';
export function saveSettings() { LS.set('pf.v1.settings', Settings); }

/* ---------- 3. Sound (all synthesized) ---------- */
export const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null, gestured = false;
  // Browsers only let audio start after the player touched the page (a tap, click or key). Before that, sounds are
  // skipped instead of creating an AudioContext that the browser refuses (and warns about in the console).
  const UA = typeof navigator !== 'undefined' ? navigator.userActivation : null;
  const allowed = () => gestured || !!(UA && UA.hasBeenActive);
  function onGesture(e) {
    if (e.type === 'keydown' && (e.key === 'Escape' || e.ctrlKey || e.metaKey)) return; // not a user activation
    if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return; // touch and pen activate on pointerup
    gestured = true; ensure(); // create or resume inside the gesture (iOS Safari needs that)
    if (ctx && ctx.state === 'running') GESTURES.forEach(t => window.removeEventListener(t, onGesture, true));
  }
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  if (typeof window !== 'undefined') GESTURES.forEach(t => window.addEventListener(t, onGesture, { capture: true, passive: true }));
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended' && allowed()) ctx.resume().catch(() => {}); return ctx; }
    if (!allowed()) return null;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = Settings.volume / 100; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function tone(f0, f1, dur, type, vol, delay = 0) {
    const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, q = 0.8, delay = 0) {
    const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.3); s.stop(t + dur + 0.02);
  }
  const defs = {
    click() { tone(560, 820, 0.06, 'triangle', 0.1); },
    open() { tone(420, 640, 0.08, 'sine', 0.08); },
    jump() { tone(240, 520, 0.15, 'square', 0.035); tone(360, 760, 0.13, 'triangle', 0.06); },
    land() { noise(0.1, 0.3, 380, 0.7); },
    step() { noise(0.045, 0.07, 1500 + Math.random() * 500, 1.2); },
    paint() { tone(1250 + Math.random() * 350, null, 0.025, 'sine', 0.035); },
    fill() { tone(280, 900, 0.16, 'sine', 0.1); },
    pick() { tone(900, 1300, 0.06, 'sine', 0.08); },
    save() { tone(660, null, 0.12, 'triangle', 0.12); tone(990, null, 0.2, 'triangle', 0.12, 0.09); },
    error() { tone(190, 130, 0.18, 'sawtooth', 0.05); },
    spawn() { [523, 659, 784].forEach((f, i) => tone(f, null, 0.12, 'triangle', 0.08, i * 0.07)); },
    respawn() { [784, 622, 466].forEach((f, i) => tone(f, null, 0.12, 'triangle', 0.08, i * 0.07)); },
    die() { tone(420, 90, 0.38, 'square', 0.05); noise(0.25, 0.22, 300, 0.6); },
    hurt() { tone(260, 140, 0.12, 'square', 0.05); noise(0.08, 0.15, 900, 1); },
    coin() { tone(988, null, 0.07, 'square', 0.04); tone(1319, null, 0.16, 'square', 0.045, 0.06); },
    bounce() { tone(180, 720, 0.22, 'sine', 0.14); },
    boost() { tone(300, 1200, 0.3, 'sawtooth', 0.035); noise(0.25, 0.08, 2600, 0.7); },
    checkpoint() { [659, 880, 1175].forEach((f, i) => tone(f, null, 0.14, 'triangle', 0.09, i * 0.08)); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, null, 0.2, 'triangle', 0.1, i * 0.1)); },
    lose() { [523, 466, 392, 330].forEach((f, i) => tone(f, null, 0.22, 'triangle', 0.09, i * 0.13)); },
    break() { noise(0.22, 0.3, 2200, 0.5); tone(900, 300, 0.12, 'square', 0.03); },
    shoot() { tone(720, 220, 0.09, 'square', 0.035); noise(0.06, 0.12, 3000, 1); },
    splat() { noise(0.12, 0.28, 700, 0.8); tone(240, 120, 0.08, 'sine', 0.08); },
    chop() { noise(0.07, 0.35, 1200, 1.4); tone(160, 90, 0.07, 'square', 0.05); },
    pop() { tone(520, 1400, 0.09, 'sine', 0.12); },
    tick() { tone(1500, null, 0.03, 'square', 0.03); },
    alarm() { [880, 660, 880].forEach((f, i) => tone(f, null, 0.12, 'square', 0.035, i * 0.14)); },
    whoosh() { noise(0.35, 0.12, 900, 0.4); },
    crackle() { for (let i = 0; i < 4; i++) noise(0.03, 0.08, 2500 + Math.random() * 2000, 2, Math.random() * 0.25); },
  };
  return {
    unlock: ensure,
    play(name) { if (Settings.volume <= 0 || !ensure() || !defs[name]) return; try { defs[name](); } catch (e) { /* audio is optional */ } },
    setVolume(v) { if (master) master.gain.setTargetAtTime(v / 100, ctx.currentTime, 0.03); },
  };
})();

/* ---------- 4. Word filter (names now, chat and comments later) ---------- */
export const WordFilter = (() => {
  // Stored as ROT13 so the list doesn't sit in plain text. A leading * means whole-word match only.
  const rot = s => s.replace(/[a-z]/g, c => String.fromCharCode((c.charCodeAt(0) - 84) % 26 + 97));
  const RAW = rot('shpx fuvg ovgpu phag nffubyr chffl avttre avttn snttbg jnaxre ergneq qvyqb cbea obyybpxf qbhpuront ' +
    '*qvpx *pbpx *cevpx *snt *fyhg *jubzer *gjng *cvff *onfgneq *encr *encvfg *xlf *frk *gvgf *nff');
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' };
  const collapse = s => s.replace(/(.)\1+/g, '$1');
  const norm = s => s.toLowerCase().replace(/[0-9@$!|]/g, c => LEET[c] || c).replace(/[^a-z]/g, '');
  const WORDS = RAW.split(' ').map(w => (w[0] === '*' ? { w: w.slice(1), whole: true } : { w: collapse(w), whole: false }));
  function isBad(token) {
    const t = norm(token); if (!t) return false; const tc = collapse(t);
    for (const x of WORDS) {
      if (x.whole) { if (t === x.w || t === x.w + 's' || (collapse(x.w) === x.w && tc === x.w)) return true; }
      else if (tc.includes(x.w)) return true;
    }
    return false;
  }
  const clean = text => String(text).replace(/[A-Za-z0-9@$!|]+/g, m => (isBad(m) ? '###' : m));
  return { clean, hasBad: text => clean(text) !== String(text) };
})();

/* ---------- 5. Platform state and profile ---------- */
// Filled in by playforge/client/platform.js at start-up.
//   online: the PlayForge server answered; room: lobby RoomClient (client/room.js) or null;
//   downloads: {save({filename, data})}; ready: start-up finished.
export const Caps = { online: false, room: undefined, roomP: null, downloads: null, ready: false };
// The signed-in player. id is the server's user id; token authenticates API and socket calls.
export const Me = { id: null, token: '', accountName: '', color: '#FF6A2B', guestId: '', guestName: '' };
// Set while this device holds profile changes the server hasn't received yet.
const PROFILE_UNSENT = 'pf.v2.profile.unsent';
export const validPng = s => typeof s === 'string' && s.startsWith('data:image/png;base64,') && s.length < 120000;

export const Profile = {
  slots: [null, null, null, null, null], // PNG data URLs (64 × 64 skins)
  active: 0,                             // the slot you wear
  nick: '',                              // optional custom display name
  where: 'device',
  listeners: [],
  onChange(fn) { this.listeners.push(fn); return () => { const i = this.listeners.indexOf(fn); if (i >= 0) this.listeners.splice(i, 1); }; },
  emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
  loadLocal() {
    const d = LS.get('pf.v1.profile', null);
    if (d) {
      if (Array.isArray(d.slots)) this.slots = [0, 1, 2, 3, 4].map(i => (validPng(d.slots[i]) ? d.slots[i] : null));
      this.active = clamp(d.active | 0, 0, 4);
      this.nick = typeof d.nick === 'string' ? d.nick.slice(0, 20) : '';
    }
    let g = LS.get('pf.v1.guest', null);
    if (!g || !g.id) { g = { id: 'g' + Math.random().toString(36).slice(2, 10), name: 'Guest ' + (100 + Math.floor(Math.random() * 900)) }; LS.set('pf.v1.guest', g); }
    Me.guestId = g.id; Me.guestName = g.name;
  },
  saveLocal() { LS.set('pf.v1.profile', { slots: this.slots, active: this.active, nick: this.nick }); },
  displayName() { return this.nick || Me.accountName || Me.guestName || 'Player'; },
  wornSkin() { return this.slots[this.active] || null; },
  // backend: {load() -> {slots, active, nick} | null, save({slots, active, nick, skin})} (client/profile-backend.js)
  backend: null,
  async attachCloud() {
    const be = this.backend; if (!be) return;
    // Changes saved here while the server was unreachable win over the server copy: send them instead of loading.
    if (LS.get(PROFILE_UNSENT, false)) { await this.persist(); return; }
    try {
      const d = await be.load(); if (!d) return;
      if (Array.isArray(d.slots)) this.slots = [0, 1, 2, 3, 4].map(i => (validPng(d.slots[i]) ? d.slots[i] : null));
      if (Number.isInteger(d.active)) this.active = clamp(d.active, 0, 4);
      if (typeof d.nick === 'string') this.nick = d.nick.slice(0, 20);
      this.where = 'cloud'; this.saveLocal();
    } catch (e) { if (!e || e.status !== 0) console.warn('PlayForge: profile read failed, using this device', e); } // status 0: unreachable (offline, or the page is closing)
  },
  _chain: Promise.resolve(),
  // Saves to this device, then to the server when it is available. Resolves 'cloud' or 'device'.
  persist() {
    this.saveLocal();
    const job = this._chain.then(async () => {
      const be = this.backend; if (!be) { LS.set(PROFILE_UNSENT, true); return 'device'; }
      try {
        await be.save({ slots: this.slots.map(s => s || ''), active: this.active, nick: this.nick, skin: this.slots[this.active] || '' });
        LS.set(PROFILE_UNSENT, false); this.where = 'cloud'; return 'cloud';
      } catch (e) {
        LS.set(PROFILE_UNSENT, true);
        if (!e || e.status !== 0) console.warn('PlayForge: cloud save failed', e);
        return 'device';
      }
    });
    this._chain = job.catch(() => {});
    return job;
  },
};

/* ---------- 6. Skin layout (64 × 64, box UV) and starter skins ---------- */
export const SK = 64;
export const PX = 1 / 16; // world units per skin pixel: the avatar is 32 px = 2 units tall
export const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; // BoxGeometry group order
export const FACE_LABEL = { px: 'Left side', nx: 'Right side', py: 'Top', ny: 'Bottom', pz: 'Front', nz: 'Back' };
export const PARTS = [
  { key: 'head', label: 'Head', w: 8, h: 8, d: 8, base: [0, 0], outer: [0, 32], mirror: 'head' },
  { key: 'torso', label: 'Body', w: 8, h: 12, d: 4, base: [32, 0], outer: [32, 32], mirror: 'torso' },
  { key: 'armR', label: 'Right arm', w: 4, h: 12, d: 4, base: [0, 16], outer: [0, 48], mirror: 'armL' },
  { key: 'armL', label: 'Left arm', w: 4, h: 12, d: 4, base: [16, 16], outer: [16, 48], mirror: 'armR' },
  { key: 'legR', label: 'Right leg', w: 4, h: 12, d: 4, base: [32, 16], outer: [32, 48], mirror: 'legL' },
  { key: 'legL', label: 'Left leg', w: 4, h: 12, d: 4, base: [48, 16], outer: [48, 48], mirror: 'legR' },
];
export const PART = Object.fromEntries(PARTS.map(p => [p.key, p]));
// Net per box: row 1 = top, bottom; row 2 = right side, front, left side, back (sides from the avatar's point of view).
export function faceRects(p, layer) {
  const [ox, oy] = layer === 'outer' ? p.outer : p.base, { w, h, d } = p;
  return {
    py: { x: ox + d, y: oy, w, h: d }, ny: { x: ox + d + w, y: oy, w, h: d },
    nx: { x: ox, y: oy + d, w: d, h }, pz: { x: ox + d, y: oy + d, w, h },
    px: { x: ox + d + w, y: oy + d, w: d, h }, nz: { x: ox + 2 * d + w, y: oy + d, w, h },
  };
}
export const PIX = new Array(SK * SK).fill(null);
for (const p of PARTS) for (const layer of ['base', 'outer']) {
  const rects = faceRects(p, layer);
  for (const f of FACES) {
    const r = rects[f];
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) PIX[(r.y + y) * SK + r.x + x] = { part: p.key, layer, face: f, fx: x, fy: y, rect: r };
  }
}
// Pixel on the opposite side of the avatar (left/right mirror across its center line).
export function mirrorPixel(x, y) {
  const info = PIX[y * SK + x]; if (!info) return null;
  const mp = PART[PART[info.part].mirror];
  const mf = info.face === 'px' ? 'nx' : info.face === 'nx' ? 'px' : info.face;
  const r = faceRects(mp, info.layer)[mf];
  return [r.x + (r.w - 1 - info.fx), r.y + info.fy];
}
export const BLANK = '#A9B4C2'; // what the eraser leaves on the base layer, which can't be see-through
export function newSkinCanvas() { const c = document.createElement('canvas'); c.width = c.height = SK; return c; }
export function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }
export function drawPngTo(canvas, src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const g = ctx2d(canvas); g.clearRect(0, 0, SK, SK); g.drawImage(img, 0, 0); res(true); };
    img.onerror = () => res(false);
    img.src = src;
  });
}
// 16 × 32 front view of the whole avatar (thumbnails and home card).
export const FIG_PLACE = [['head', 4, 0], ['torso', 4, 8], ['armR', 0, 8], ['armL', 12, 8], ['legR', 4, 20], ['legL', 8, 20]];
export function drawFigure(dst, skin) {
  const g = dst.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, dst.width, dst.height);
  for (const layer of ['base', 'outer']) for (const [k, x, y] of FIG_PLACE) {
    const r = faceRects(PART[k], layer).pz; g.drawImage(skin, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
  }
}
export function drawHead(dst, skin) {
  const g = dst.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 8, 8);
  for (const layer of ['base', 'outer']) { const r = faceRects(PART.head, layer).pz; g.drawImage(skin, r.x, r.y, 8, 8, 0, 0, 8, 8); }
}

// Procedural skin painter. o = outfit description; seed controls the pixel shading noise.
export function paintSkin(canvas, o, seed) {
  const g = ctx2d(canvas); g.clearRect(0, 0, SK, SK);
  const R = rng(seed || 7);
  const J = hex => { const k = R(); return k < 0.16 ? shade(hex, -0.07) : k > 0.88 ? shade(hex, 0.06) : hex; };
  const put = (x, y, col) => { if (!col) return; g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const face = (part, layer, f, fn) => {
    const r = faceRects(PART[part], layer)[f];
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) put(r.x + x, r.y + y, fn(x, y, r.w, r.h));
  };
  const all = (part, layer, fn) => FACES.forEach(f => face(part, layer, f, (x, y, w, h) => fn(f, x, y, w, h)));
  const SIDES = ['pz', 'nz', 'px', 'nx'];

  if (o.robot) {
    const M = o.metal, T = o.trim;
    for (const p of PARTS) all(p.key, 'base', (f, x, y, w, h) => ((f !== 'py' && f !== 'ny' && (x === 0 || x === w - 1)) ? shade(M, -0.16) : J(M)));
    face('head', 'base', 'pz', (x, y) => (y >= 3 && y <= 5 ? (y === 4 && (x === 2 || x === 5) ? o.light : T) : y === 7 && x >= 2 && x <= 5 ? shade(M, -0.3) : null));
    face('head', 'outer', 'py', (x, y) => ((x === 3 || x === 4) && (y === 3 || y === 4) ? o.chest : null));
    face('torso', 'base', 'pz', (x, y) => (y >= 3 && y <= 5 && x >= 3 && x <= 4 ? o.chest : (y === 8 && x >= 1 && x <= 6) ? T : (y === 11 ? shade(M, -0.25) : null)));
    face('torso', 'base', 'nz', (x, y) => (y >= 2 && y <= 8 && x >= 2 && x <= 5 && (x + y) % 2 === 0 ? T : null));
    for (const k of ['armR', 'armL']) all(k, 'base', (f, x, y) => (f === 'ny' || y >= 10 ? T : (y === 5 || y === 6) && f !== 'py' ? T : null));
    for (const k of ['legR', 'legL']) all(k, 'base', (f, x, y) => (f === 'ny' || y >= 10 ? T : (y === 5 || y === 6) && f !== 'py' ? T : null));
    return canvas;
  }

  // Head: skin, face, hair
  all('head', 'base', () => J(o.skin));
  const hs = o.hairStyle, H = o.hair;
  face('head', 'base', 'pz', (x, y) => {
    if (y === 4 && (x === 1 || x === 6)) return '#F4F7FF';
    if (y === 4 && (x === 2 || x === 5)) return o.eye;
    if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return hs === 'bald' ? shade(o.skin, -0.25) : shade(H, -0.12);
    if (y === 5 && (x === 3 || x === 4)) return shade(o.skin, -0.1);
    if (y === 6 && (x === 3 || x === 4)) return shade(o.skin, -0.38);
    return null;
  });
  if (hs !== 'bald') {
    face('head', 'base', 'py', () => J(H));
    const frontRows = hs === 'buzz' ? 1 : 2;
    face('head', 'base', 'pz', (x, y) => (y < frontRows || (hs !== 'buzz' && y === 2 && (x === 0 || x === 7)) ? J(H) : null));
    for (const f of ['px', 'nx']) face('head', 'base', f, (x, y) => {
      const fromFront = f === 'px' ? x : 7 - x;
      const lim = hs === 'long' ? (fromFront < 2 ? 3 : 7) : hs === 'buzz' ? 1 : (fromFront < 2 ? 2 : 4);
      return y < lim ? J(H) : null;
    });
    face('head', 'base', 'nz', (x, y) => (y < (hs === 'long' ? 8 : hs === 'buzz' ? 2 : 5) ? J(H) : null));
    if (hs === 'pony') face('head', 'outer', 'nz', (x, y) => (y >= 4 && y <= 7 && (x === 3 || x === 4) ? shade(H, -0.12) : null));
  }

  // Torso
  all('torso', 'base', f => (f === 'ny' ? J(o.pants) : J(o.shirt)));
  for (const f of SIDES) face('torso', 'base', f, (x, y, w, h) => (y === h - 1 ? shade(o.pants, -0.25) : null));
  const S2 = o.shirt2;
  switch (o.top) {
    case 'tee': face('torso', 'base', 'pz', (x, y) => (y === 0 && (x === 3 || x === 4) ? J(o.skin) : null)); break;
    case 'stripes': for (const f of SIDES) face('torso', 'base', f, (x, y) => (y < 11 && y % 3 === 1 ? S2 : null)); break;
    case 'split':
      for (const f of ['pz', 'nz']) face('torso', 'base', f, (x, y) => (y < 11 && (f === 'pz' ? x >= 4 : x < 4) ? J(S2) : null));
      face('torso', 'base', 'px', (x, y) => (y < 11 ? J(S2) : null)); break;
    case 'emblem': face('torso', 'base', 'pz', (x, y) => (Math.abs(x - 3.5) + Math.abs(y - 5) <= 2.5 ? S2 : null)); break;
    case 'apron':
      face('torso', 'base', 'pz', (x, y) => ((x >= 1 && x <= 6 && y >= 3 && y <= 10) || ((x === 1 || x === 6) && y < 3) ? J(S2) : null));
      face('torso', 'base', 'nz', (x, y) => (y === 4 && x >= 1 && x <= 6 ? S2 : null)); break;
    case 'hoodie':
      face('torso', 'base', 'pz', (x, y) => (y >= 7 && y <= 9 && x >= 1 && x <= 6 ? shade(o.shirt, -0.14) : (x === 2 || x === 5) && y >= 1 && y <= 3 ? '#F4F7FF' : y === 0 && x >= 3 && x <= 4 ? shade(o.shirt, -0.22) : null));
      face('torso', 'base', 'nz', (x, y) => (y <= 2 ? shade(o.shirt, -0.1) : null)); break;
    case 'suit':
      face('torso', 'base', 'pz', (x, y) => (y < 11 && (x === 3 || x === 4) ? (y >= 1 && y <= 7 ? S2 : '#F4F7FF') : (x === 2 || x === 5) && y <= 2 ? shade(o.shirt, -0.18) : null)); break;
  }

  // Arms
  const sl = o.sleeves === 'long' ? 10 : o.sleeves === 'short' ? 4 : 0;
  for (const k of ['armR', 'armL']) {
    const base = o.top === 'split' && k === 'armL' ? S2 : o.shirt;
    all(k, 'base', (f, x, y) => {
      if (f === 'py') return sl ? J(base) : J(o.skin);
      if (f === 'ny') return J(o.skin);
      if (y < sl) return o.top === 'stripes' && y % 3 === 1 ? S2 : J(base);
      return J(o.skin);
    });
  }
  // Legs
  for (const k of ['legR', 'legL']) all(k, 'base', (f, x, y) => {
    if (f === 'py') return J(o.pants);
    if (f === 'ny') return shade(o.shoes, -0.3);
    if (y >= 9) return y === 11 ? shade(o.shoes, -0.2) : J(o.shoes);
    return J(o.pants);
  });

  // Outer-layer accessories
  for (const [kind, c1, c2 = '#17223A'] of o.acc || []) {
    switch (kind) {
      case 'cap':
        face('head', 'outer', 'py', () => J(c1));
        face('head', 'outer', 'pz', (x, y) => (y < 2 ? J(c1) : y === 2 ? c2 : null));
        for (const f of ['px', 'nx']) face('head', 'outer', f, (x, y) => (y < 2 ? J(c1) : null));
        face('head', 'outer', 'nz', (x, y) => (y < 3 ? J(c1) : null)); break;
      case 'beanie':
        face('head', 'outer', 'py', () => J(c1));
        for (const f of SIDES) face('head', 'outer', f, (x, y) => (y < 2 ? J(c1) : y === 2 ? shade(c1, -0.22) : null)); break;
      case 'goggles':
        face('head', 'outer', 'pz', (x, y) => (y === 3 ? c1 : y === 4 ? (x === 1 || x === 2 || x === 5 || x === 6 ? c2 : c1) : null));
        for (const f of ['px', 'nx', 'nz']) face('head', 'outer', f, (x, y) => (y === 3 || y === 4 ? shade(c1, -0.25) : null)); break;
      case 'headphones':
        for (const f of ['px', 'nx']) face('head', 'outer', f, (x, y) => (y >= 3 && y <= 5 && x >= 2 && x <= 5 ? (y === 4 && (x === 3 || x === 4) ? c2 : c1) : y < 3 && (x === 3 || x === 4) ? shade(c1, -0.2) : null));
        face('head', 'outer', 'py', (x, y) => (y === 3 || y === 4 ? shade(c1, -0.2) : null)); break;
      case 'hood':
        face('head', 'outer', 'py', () => J(c1));
        for (const f of ['px', 'nx', 'nz']) face('head', 'outer', f, () => J(c1));
        face('head', 'outer', 'pz', (x, y) => (y < 2 || x === 0 || x === 7 ? J(c1) : null));
        face('torso', 'outer', 'nz', (x, y) => (y < 3 ? J(shade(c1, -0.1)) : null)); break;
      case 'glasses':
        face('head', 'outer', 'pz', (x, y) => (y === 3 && x !== 3 && x !== 4 ? c1 : y === 4 && (x === 0 || x === 3 || x === 4 || x === 7) ? c1 : null)); break;
      case 'jacket':
        for (const f of ['px', 'nx', 'nz', 'py']) face('torso', 'outer', f, (x, y, w, h) => (y < h - 1 || f === 'py' ? J(c1) : null));
        face('torso', 'outer', 'pz', (x, y) => (y < 11 && (x <= 1 || x >= 6) ? J(c1) : null));
        for (const k of ['armR', 'armL']) all(k, 'outer', (f, x, y) => (f !== 'ny' && y < 10 ? J(c1) : null)); break;
      case 'scarf':
        for (const f of SIDES) face('torso', 'outer', f, (x, y) => (y < 2 ? J(c1) : null));
        face('torso', 'outer', 'pz', (x, y) => (x >= 5 && x <= 6 && y >= 2 && y <= 6 ? (y === 6 ? c2 : J(c1)) : null)); break;
    }
  }
  return canvas;
}

export const STARTERS = [
  { name: 'Ember Smith', o: { skin: '#C68A5E', hair: '#2A1C15', hairStyle: 'short', eye: '#3B2A1E', shirt: '#3E4A5D', shirt2: '#E8622B', top: 'apron', sleeves: 'short', pants: '#4A3B30', shoes: '#25211F', acc: [['goggles', '#6A4A2E', '#FFC53A']] } },
  { name: 'Tide Runner', o: { skin: '#F0C6A2', hair: '#E2A93F', hairStyle: 'pony', eye: '#2D62F0', shirt: '#17A39C', shirt2: '#0E7C77', top: 'hoodie', sleeves: 'long', pants: '#2F4F88', shoes: '#EEF1F6', acc: [['headphones', '#FF6A2B', '#17223A']] } },
  { name: 'Moss Ranger', o: { skin: '#8C593A', hair: '#17100D', hairStyle: 'buzz', eye: '#1E3B23', shirt: '#4E7A39', shirt2: '#C9B37A', top: 'emblem', sleeves: 'long', pants: '#5A4932', shoes: '#3A2A1E', acc: [['hood', '#3E6834']] } },
  { name: 'Byte Bot', o: { robot: true, metal: '#AEB8C6', trim: '#3B465A', light: '#4CF0FF', chest: '#FF6A2B' } },
  { name: 'Star Captain', o: { skin: '#E2AE80', hair: '#6A3E24', hairStyle: 'short', eye: '#3A2618', shirt: '#25365F', shirt2: '#FFC53A', top: 'suit', sleeves: 'long', pants: '#1D2A4A', shoes: '#121826', acc: [['cap', '#25365F', '#FFC53A']] } },
];
export function randomOutfit(R) {
  const brights = ['#FF6A2B', '#2D62F0', '#17A39C', '#E23E62', '#7A4FD0', '#3FA34D', '#FFC53A', '#22314F', '#EDEFF2', '#C2410C', '#0E7490', '#9D174D'];
  if (R() < 0.15) return { robot: true, metal: pick(R, ['#AEB8C6', '#C9A76A', '#8FA3B8', '#E8E2D0']), trim: pick(R, ['#3B465A', '#22314F', '#5A3420']), light: pick(R, ['#4CF0FF', '#7CFF6B', '#FF5CA8']), chest: pick(R, brights) };
  const shirt = pick(R, brights); let shirt2 = pick(R, brights); if (shirt2 === shirt) shirt2 = shade(shirt, -0.3);
  const o = {
    skin: pick(R, ['#F3D2B5', '#E8B990', '#D19A6D', '#B07A50', '#8A5A3A', '#5E3B26', '#F0C6A2']),
    hair: pick(R, ['#17100D', '#2A1C15', '#5A3420', '#8A5A2B', '#D9A441', '#E8D27A', '#B5462E', '#2F5BD8', '#E25C9A', '#7A4FD0', '#EDEFF2']),
    hairStyle: pick(R, ['short', 'long', 'buzz', 'bald', 'pony', 'short']),
    eye: pick(R, ['#3B2A1E', '#2D62F0', '#1E3B23', '#5A3420', '#17223A']),
    shirt, shirt2, top: pick(R, ['tee', 'stripes', 'split', 'emblem', 'apron', 'hoodie', 'suit']),
    sleeves: pick(R, ['short', 'long', 'none', 'short']),
    pants: pick(R, ['#2F4F88', '#22314F', '#4A3B30', '#5A4932', '#3A3F4A', '#1D2A4A', '#6B7280', '#7C2D12']),
    shoes: pick(R, ['#25211F', '#EEF1F6', '#E23E62', '#3A2A1E', '#121826', '#FFC53A', '#2D62F0']),
    acc: [],
  };
  if (R() < 0.75) o.acc.push([pick(R, ['cap', 'beanie', 'goggles', 'headphones', 'hood', 'jacket', 'scarf']), pick(R, brights), pick(R, ['#FFC53A', '#17223A', '#EDEFF2', '#4CF0FF'])]);
  if (R() < 0.2) o.acc.push(['glasses', '#17223A']);
  return o;
}
export function defaultStarterIndex() { return hashStr(Me.guestId || 'pf') % STARTERS.length; }
