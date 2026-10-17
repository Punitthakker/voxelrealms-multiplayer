import * as THREE from 'three';
import { BLANK, Caps, FACES, FACE_LABEL, IS_TOUCH, LS, Me, PART, PARTS, PIX, Profile, SK, STARTERS, Sfx, WordFilter, clamp, cssVar, ctx2d, drawFigure, drawPngTo, faceRects, hexToRgb, mirrorPixel, newSkinCanvas, normHex, paintSkin, randomOutfit, rgbToHex, rng, toast } from './core.js';
import { askChoice, createStore, uiStore } from './stores.js';
import { Engine } from './render.js';
import { createAvatar, makeSkinTexture } from './avatar.js';
import { Skins, STARTER_CANVASES, PALETTE } from './skins.js';
import { isTyping } from './input.js';

/* ---------- The avatar and skin editor ----------
   The React screen (components/playforge/avatar) owns the markup. It hands the editor its elements:
     Editor.attach(view, {blocked, onBack}) -> detach   the 3D viewport (pointer painting, turning, zoom) and the keys
     Editor.attachMap(canvas, panel) -> detach            the flat 64 x 64 map in the Paint tab (panel: the tab's element)
     Editor.bindThumb(canvas) -> unbind                   the editing slot's figure in the Skins tab, kept live
   then calls Editor.enter() on mount and Editor.exit() on unmount, and reads editorStore. Engine.views.avatar is the
   editor, so the shared loop renders it while Engine.mode is 'avatar'.
   The skin being edited is Editor.work (a 64 x 64 canvas). Saving writes it to Profile.slots[slot], wears it
   (Profile.active, Skins.setFrom) and calls Profile.persist() (this device, then the server). Unsaved work survives
   leaving the screen without Back (browser Back, reload) in sessionStorage and comes back on the next visit. */

const STASH_KEY = 'pf.v2.avatar.draft';
const RECENT_KEY = 'pf.v1.recent';
const UNDO_MAX = 60;
const MAP_CAPTION = 'Skin map · 64 × 64';
const HINT_PAINT = IS_TOUCH ? 'Paint on the avatar · drag the background to turn it' : 'Paint on the avatar · drag the background to turn it';
const HINT_TURN = 'Turn mode: drag anywhere to turn the avatar';
const NICK_HELP = 'Shown on the nametag above your head. 3 to 20 letters, numbers, spaces, dots, dashes or underscores.';
const TOOL_KEYS = { b: 'pencil', p: 'pencil', e: 'eraser', g: 'bucket', f: 'bucket', i: 'picker' };
export const EDITOR_TOOLS = [
  { id: 'pencil', label: 'Pencil', icon: 'pencil', key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E' },
  { id: 'bucket', label: 'Fill bucket', icon: 'bucket', key: 'G' },
  { id: 'picker', label: 'Eyedropper', icon: 'dropper', key: 'I' },
];
export const EDITOR_SIZES = [1, 2, 3];
export const UNDO_STEPS = UNDO_MAX;

// The name of the player without a custom name (the server's guest name, or this device's when offline).
const baseName = () => Me.accountName || Me.guestName || 'Player';
const clearLabel = () => (/^Guest \d+$/.test(baseName()) || !Me.accountName ? 'Use my guest name' : 'Use my account name');
const sessionGet = () => { try { return JSON.parse(sessionStorage.getItem(STASH_KEY) || 'null'); } catch (e) { return null; } };
const sessionSet = v => { try { if (v) sessionStorage.setItem(STASH_KEY, JSON.stringify(v)); else sessionStorage.removeItem(STASH_KEY); } catch (e) { /* storage blocked */ } };

// What the React screen reads.
//   open: the editor is on screen; ready: the first skin is loaded; status: the save line; dirty: unsaved changes;
//   saving: a save is on its way; tool, size, mirror, grid, layer ('base' | 'outer'), turn (the turn tool is on);
//   color: '#RRGGBB'; recent: custom colors (newest first); slot: the slot being edited; worn: the slot you wear;
//   slots: Profile.slots (PNG data URLs or null, a new array on every change); tab: 'paint' | 'skins' | 'name';
//   caption: the line under the map; hint: the line under the 3D view; nick, nickDefault (placeholder), nickHelp,
//   nickError, nickClear (the reset button's label), nickSeq (bumps after every name save);
//   canDownload: downloads are available.
export const editorStore = createStore({
  open: false, ready: false, status: 'Saved', dirty: false, saving: false, canUndo: false, canRedo: false,
  tool: 'pencil', size: 1, mirror: false, grid: true, layer: 'base', turn: false,
  color: '#FF6A2B', recent: [], slot: 0, worn: 0, slots: [null, null, null, null, null], tab: 'paint',
  caption: MAP_CAPTION, hint: HINT_PAINT, nick: '', nickDefault: '', nickHelp: NICK_HELP, nickError: false, nickClear: 'Use my guest name', nickSeq: 0,
  canDownload: false,
});

export const Editor = {
  inited: false, open: false, work: null, g: null, tex: null, scene: null, cam: null, avatar: null, ray: null, ndc: null,
  tool: 'pencil', lastPaintTool: 'pencil', size: 1, mirror: false, grid: true, layer: 'base', rotateTool: false, tab: 'paint',
  color: '#FF6A2B', recent: [], undo: [], redo: [], dirty: false, saving: 0, slot: 0, thumbs: new Set(), thumbDirty: false,
  yaw: 0.55, pitch: 0.1, dist: 5, drag: null, pts: new Map(), pinchD: 0, stroke: null, mapDirty: true, t: 0, hover: null,
  mapBg: null, colors: {}, lastSfx: 0, busy: false, loadTok: 0, selfEmit: false, asking: null,
  view: null, map: null, panel: null, blocked: () => false, onBack: null,

  init() {
    if (this.inited) return; this.inited = true;
    Skins.init();
    this.work = newSkinCanvas(); this.g = ctx2d(this.work); this.tex = makeSkinTexture(this.work);
    const scene = new THREE.Scene(); this.scene = scene;
    scene.add(new THREE.HemisphereLight('#FFFFFF', '#8A95A8', 0.8));
    const key = new THREE.DirectionalLight('#FFFFFF', 0.6); key.position.set(2.5, 4, 5); scene.add(key);
    const rim = new THREE.DirectionalLight('#FFFFFF', 0.28); rim.position.set(-3, 2, -4); scene.add(rim);
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d');
    const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.002; scene.add(disc);
    this.avatar = createAvatar(this.tex, Profile.displayName()); this.avatar.tag.visible = false; scene.add(this.avatar.root); this.avatar.setOuterVisible(false);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50); this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    Engine.views.avatar = this;
    this.recent = (LS.get(RECENT_KEY, []) || []).map(normHex).filter(Boolean).slice(0, 10);
    this.applyTheme();
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', () => this.applyTheme());
    new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    Profile.onChange(() => this.onProfileChanged());
    editorStore.set({ recent: this.recent.slice(), color: this.color });
  },
  applyTheme() {
    this.colors = { surface: cssVar('--surface'), surface2: cssVar('--surface-2'), bg: cssVar('--bg'), line: cssVar('--line'), ink2: cssVar('--ink-2'), cobalt: cssVar('--cobalt'), ember: cssVar('--ember') };
    if (this.scene) this.scene.background = new THREE.Color(this.colors.surface2);
    this.mapBg = null; this.mapDirty = true;
  },
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); },

  // ---- the screen's elements ----
  // view: the 3D viewport. opts.blocked() is true while a dialog is open (keys then belong to it);
  // opts.onBack() runs on Escape (the screen asks to leave, then goes home).
  attach(view, opts = {}) {
    this.init();
    this.view = view; this.blocked = opts.blocked || (() => false); this.onBack = opts.onBack || null;
    const offs = [], on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
    const pts = this.pts;
    const d2 = () => { const p = [...pts.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    on(view, 'pointerdown', e => {
      if (!this.open) return;
      e.preventDefault(); try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) { this.endStroke(); this.drag = 'pinch'; this.pinchD = d2(); return; }
      if (e.button === 1 || e.button === 2 || this.rotateTool) { this.drag = 'rotate'; return; }
      const hit = this.pick3D(e.clientX, e.clientY);
      if (hit) { this.drag = 'paint'; this.act(hit.x, hit.y, hit.rect); this.setHover([hit.x, hit.y]); } else this.drag = 'rotate';
    });
    on(view, 'pointermove', e => {
      if (!this.open) return;
      const p = pts.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse' && !this.rotateTool) { const h = this.pick3D(e.clientX, e.clientY); this.setHover(h ? [h.x, h.y] : null); } return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (this.drag === 'rotate') { this.yaw -= dx * 0.011; this.pitch = clamp(this.pitch + dy * 0.008, -0.6, 1.0); }
      else if (this.drag === 'pinch' && pts.size >= 2) { const d = d2(); if (this.pinchD > 0 && d > 0) this.dist = clamp(this.dist * this.pinchD / d, 2.2, 9); this.pinchD = d; this.yaw -= dx * 0.005; }
      else if (this.drag === 'paint' && this.stroke) { const h = this.pick3D(e.clientX, e.clientY); if (h) { this.strokeTo(h.x, h.y, h.rect); this.setHover([h.x, h.y]); } }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (this.drag === 'paint') this.endStroke();
      if (!pts.size) this.drag = null; else if (this.drag === 'pinch') this.drag = 'rotate';
      if (e.pointerType !== 'mouse' && !pts.size) this.setHover(null);
    };
    on(view, 'pointerup', up); on(view, 'pointercancel', up); on(view, 'lostpointercapture', up);
    on(view, 'pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) this.setHover(null); });
    on(view, 'contextmenu', e => e.preventDefault());
    on(view, 'wheel', e => {
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      this.dist = clamp(this.dist * Math.pow(1.0015, dy), 2.2, 9);
    }, { passive: false });
    on(view, 'dblclick', e => e.preventDefault());
    on(window, 'keydown', e => this.onKeyDown(e));
    // Unsaved work is kept for the next visit when the page closes, reloads or goes to the background.
    on(window, 'pagehide', () => this.stash());
    on(document, 'visibilitychange', () => { if (document.hidden) this.stash(); });
    on(window, 'beforeunload', e => { if (this.open && this.dirty) { this.stash(); e.preventDefault(); e.returnValue = ''; } });
    if (this.open) { Engine.setMode('avatar'); Engine.attach(view); }
    return () => {
      offs.forEach(f => f());
      if (this.view === view) { this.view = null; this.blocked = () => false; this.onBack = null; }
      pts.clear(); this.drag = null;
    };
  },
  // canvas: the flat map; panel: the Paint tab (its width sizes the map, and the map is drawn only while it shows).
  attachMap(canvas, panel) {
    this.init();
    this.map = canvas; this.panel = panel;
    const offs = [], on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(canvas, 'pointerdown', e => {
      if (!this.open) return;
      e.preventDefault(); const p = this.mapPixel(e); if (!p) return;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const info = PIX[p[1] * SK + p[0]]; if (info && info.layer !== this.layer) this.setLayer(info.layer, true);
      this.act(p[0], p[1], null); this.setHover(p);
    });
    on(canvas, 'pointermove', e => { if (!this.open) return; const p = this.mapPixel(e); this.setHover(p); if (p && this.stroke) this.strokeTo(p[0], p[1], null); });
    const up = e => { this.endStroke(); if (e.pointerType !== 'mouse') this.setHover(null); };
    on(canvas, 'pointerup', up); on(canvas, 'pointercancel', up);
    on(canvas, 'pointerleave', e => { if (e.pointerType === 'mouse' && !this.stroke) this.setHover(null); });
    on(canvas, 'contextmenu', e => e.preventDefault());
    const ro = new ResizeObserver(() => this.sizeMap()); ro.observe(panel);
    this.sizeMap();
    return () => {
      offs.forEach(f => f()); ro.disconnect();
      if (this.map === canvas) { this.map = null; this.panel = null; }
    };
  },
  // The editing slot's figure: redrawn from the work canvas as you paint (several can be bound).
  bindThumb(canvas) {
    if (!canvas) return () => {};
    this.thumbs.add(canvas); if (this.work) drawFigure(canvas, this.work);
    return () => { this.thumbs.delete(canvas); };
  },

  // ---- entering and leaving ----
  async enter() {
    this.init();
    this.open = true; this.endStroke(); this.hover = null; this.drag = null; this.pts.clear();
    this.yaw = 0.55; this.pitch = 0.1; this.dist = 5;
    Engine.setMode('avatar'); if (this.view) Engine.attach(this.view);
    this.avatar.setName(Profile.displayName());
    editorStore.set({ open: true, ready: false, canDownload: !!Caps.downloads, caption: MAP_CAPTION, tab: this.tab });
    this.syncName(); this.syncSlots();
    const stash = sessionGet(); sessionSet(null);
    const tok = ++this.loadTok;
    let restored = false;
    if (stash && typeof stash.png === 'string' && (!stash.uid || !Me.id || stash.uid === Me.id)) {
      const tmp = newSkinCanvas();
      if (await drawPngTo(tmp, stash.png)) {
        if (tok !== this.loadTok || !this.open) return;
        this.slot = clamp(stash.slot | 0, 0, 4); this.putWork(tmp); restored = true;
      }
    }
    if (!restored) {
      this.slot = Profile.active;
      const r = await this.loadSlot(this.slot); if (!r || !this.open) return;
    }
    this.undo = []; this.redo = []; this.updateUndo(); this.afterChange();
    this.setDirty(restored); this.syncSlots();
    editorStore.set({ ready: true });
    if (restored) toast(`Your unsaved changes to slot ${this.slot + 1} are back. Save to keep them.`);
    Sfx.play('open');
  },
  // The screen unmounted (Back, browser Back or a link). Unsaved work is stashed for the next visit.
  exit() {
    if (!this.open) return;
    this.endStroke(); this.stash();
    if (this.asking) { const c = uiStore.get().choice; if (c && c === this.asking) c.resolve('cancel'); this.asking = null; }
    this.open = false; this.loadTok++; this.busy = false; this.pts.clear(); this.drag = null; this.hover = null;
    if (Engine.mode === 'avatar') Engine.setMode('home');
    editorStore.set({ open: false, ready: false });
  },
  stash() {
    if (!this.open || !this.dirty || !this.work) return;
    this.endStroke();
    try { sessionSet({ slot: this.slot, png: this.work.toDataURL('image/png'), uid: Me.id || null, at: Date.now() }); } catch (e) { /* optional */ }
  },
  // A dialog of the editor's own; it closes (as Cancel) if the screen goes away first.
  async ask(opts) {
    const p = askChoice(opts); this.asking = uiStore.get().choice;
    try { return await p; } finally { if (this.asking && uiStore.get().choice !== this.asking) this.asking = null; }
  },
  // Back asks first when there are unsaved changes. Resolves true when the screen may close.
  async confirmLeave() {
    if (!this.open) return true;
    if (this.busy) return false;
    this.endStroke();
    if (this.dirty) {
      this.busy = true;
      let c;
      try {
        c = await this.ask({ title: 'Save your skin?', body: `Slot ${this.slot + 1} has changes that are not saved yet.`,
          buttons: [{ label: 'Keep editing', value: 'cancel' }, { label: 'Discard', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'ember' }] });
      } finally { this.busy = false; }
      if (c === 'cancel' || !this.open) return false;
      if (c === 'save') await this.save(); else { this.setDirty(false); sessionSet(null); }
    }
    Sfx.play('click');
    return true;
  },
  // Loads slot i into the work canvas (an empty slot starts from the skin you wear). Resolves {had} or null when a
  // newer load replaced it.
  async loadSlot(i) {
    const tok = ++this.loadTok, src = Profile.slots[i], tmp = newSkinCanvas();
    let had = false;
    if (src && await drawPngTo(tmp, src)) had = true;
    else { const g = ctx2d(tmp); g.clearRect(0, 0, SK, SK); g.drawImage(Skins.worn, 0, 0); }
    if (tok !== this.loadTok) return null;
    this.putWork(tmp);
    return { had };
  },
  putWork(src) { this.g.clearRect(0, 0, SK, SK); this.g.drawImage(src, 0, 0); this.afterChange(); },

  async save() {
    if (!this.open) return;
    this.endStroke();
    const png = this.work.toDataURL('image/png'), slot = this.slot;
    Profile.slots[slot] = png; Profile.active = slot; Skins.setFrom(this.work);
    sessionSet(null);
    this.saving++; this.setDirty(false); this.syncSlots(); Sfx.play('save');
    this.emitProfile();
    let where = 'device';
    try { where = await Profile.persist(); } finally { this.saving = Math.max(0, this.saving - 1); this.setDirty(this.dirty); }
    toast(where === 'cloud' ? `Saved to slot ${slot + 1}. Other players will see this skin.` : `Saved to slot ${slot + 1} on this device.`);
  },
  setDirty(d) {
    this.dirty = !!d;
    const status = this.dirty ? 'Unsaved changes' : this.saving ? 'Saving…' : Profile.where === 'cloud' ? 'Saved' : 'Saved on this device';
    editorStore.set({ dirty: this.dirty, status, saving: !!this.saving });
  },
  // Tells the rest of the app (home card, nametags, the room) about a new skin or name, without reloading the editor.
  emitProfile() { this.selfEmit = true; try { Profile.emit(); } finally { this.selfEmit = false; } },
  onProfileChanged() {
    if (this.selfEmit || !this.inited) return;
    this.avatar.setName(Profile.displayName()); this.syncName();
    if (this.open && !this.dirty && !this.stroke && !this.busy) {
      this.slot = Profile.active;
      this.loadSlot(this.slot).then(r => {
        if (!r || !this.open) return;
        this.undo = []; this.redo = []; this.updateUndo(); this.setDirty(false); this.syncSlots();
      });
    } else { this.syncSlots(); this.setDirty(this.dirty); }
  },
  syncSlots() { editorStore.set({ slots: Profile.slots.slice(), slot: this.slot, worn: Profile.active }); },

  // ---- painting ----
  afterChange() { this.tex.needsUpdate = true; this.mapDirty = true; this.thumbDirty = true; },
  snap() { return this.g.getImageData(0, 0, SK, SK); },
  pushUndo(s) { this.undo.push(s); if (this.undo.length > UNDO_MAX) this.undo.shift(); this.redo.length = 0; this.updateUndo(); },
  updateUndo() { editorStore.set({ canUndo: this.undo.length > 0, canRedo: this.redo.length > 0 }); },
  doUndo() {
    this.endStroke(); if (!this.open || !this.undo.length) return;
    this.redo.push(this.snap()); this.g.putImageData(this.undo.pop(), 0, 0); this.afterChange(); this.setDirty(true); this.updateUndo(); Sfx.play('click');
  },
  doRedo() {
    this.endStroke(); if (!this.open || !this.redo.length) return;
    this.undo.push(this.snap()); this.g.putImageData(this.redo.pop(), 0, 0); this.afterChange(); this.setDirty(true); this.updateUndo(); Sfx.play('click');
  },
  beginStroke() { this.endStroke(); this.stroke = { snap: this.snap(), last: null, clip: null, changed: false }; },
  endStroke() {
    const s = this.stroke; if (!s) return; this.stroke = null;
    if (s.changed) { this.pushUndo(s.snap); this.setDirty(true); }
  },
  act(x, y, clip) {
    if (this.tool === 'picker') { this.pickColor(x, y); return; }
    if (this.tool === 'bucket') { this.fill(x, y); return; }
    this.beginStroke(); this.brush(x, y, clip); this.stroke.last = [x, y]; this.stroke.clip = clip;
  },
  strokeTo(x, y, clip) {
    const s = this.stroke; if (!s || !s.last) return;
    if (clip && clip !== s.clip) this.brush(x, y, clip);
    else {
      let [x0, y0] = s.last; const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1; let err = dx + dy;
      for (let guard = 0; guard < 200; guard++) {
        this.brush(x0, y0, clip); if (x0 === x && y0 === y) break;
        const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    s.last = [x, y]; s.clip = clip;
  },
  brush(x, y, clip) {
    const n = this.size, o = n === 3 ? -1 : 0;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const px = x + o + dx, py = y + o + dy;
      if (px < 0 || py < 0 || px >= SK || py >= SK) continue;
      if (clip && (px < clip.x || py < clip.y || px >= clip.x + clip.w || py >= clip.y + clip.h)) continue;
      this.setPx(px, py);
      if (this.mirror) { const m = mirrorPixel(px, py); if (m) this.setPx(m[0], m[1]); }
    }
    this.afterChange();
    const now = performance.now(); if (now - this.lastSfx > 80) { this.lastSfx = now; Sfx.play('paint'); }
  },
  setPx(x, y) {
    const g = this.g;
    if (this.tool === 'eraser') {
      const info = PIX[y * SK + x];
      if (info && info.layer === 'base') { g.fillStyle = BLANK; g.fillRect(x, y, 1, 1); } else g.clearRect(x, y, 1, 1);
    } else { g.fillStyle = this.color; g.fillRect(x, y, 1, 1); }
    if (this.stroke) this.stroke.changed = true;
  },
  fill(x, y) {
    if (!PIX[y * SK + x]) { toast('That spot is not part of the avatar.'); return; }
    const before = this.snap(), img = this.snap();
    let changed = this.flood(img, x, y);
    if (this.mirror) { const m = mirrorPixel(x, y); if (m) changed = this.flood(img, m[0], m[1]) || changed; }
    if (!changed) return;
    this.g.putImageData(img, 0, 0); this.pushUndo(before); this.afterChange(); this.setDirty(true); Sfx.play('fill');
  },
  flood(img, x, y) {
    const r = PIX[y * SK + x].rect, d = img.data, i0 = (y * SK + x) * 4;
    const t0 = d[i0], t1 = d[i0 + 1], t2 = d[i0 + 2], t3 = d[i0 + 3], [cr, cg, cb] = hexToRgb(this.color);
    if (t3 === 255 && t0 === cr && t1 === cg && t2 === cb) return false;
    const seen = new Uint8Array(SK * SK), stack = [x, y];
    while (stack.length) {
      const py = stack.pop(), px = stack.pop();
      if (px < r.x || py < r.y || px >= r.x + r.w || py >= r.y + r.h) continue;
      const k = py * SK + px; if (seen[k]) continue; seen[k] = 1;
      const i = k * 4; if (d[i] !== t0 || d[i + 1] !== t1 || d[i + 2] !== t2 || d[i + 3] !== t3) continue;
      d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = 255;
      stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
    }
    return true;
  },
  pickColor(x, y) {
    const d = this.g.getImageData(x, y, 1, 1).data;
    if (d[3] < 128) { toast('That pixel is see-through. Pick a painted one.'); return; }
    this.setColor(rgbToHex(d[0], d[1], d[2]), true);
    this.setTool(this.lastPaintTool === 'eraser' ? 'pencil' : this.lastPaintTool); Sfx.play('pick');
  },
  applyWhole(src, msg) {
    if (!this.open) return;
    this.endStroke(); const before = this.snap();
    this.putWork(src);
    this.pushUndo(before); this.setDirty(true); Sfx.play('fill'); if (msg) toast(msg);
  },
  randomize() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.applyWhole(paintSkin(newSkinCanvas(), randomOutfit(rng(seed)), seed + 1));
  },
  applyStarter(i) {
    const s = STARTERS[i], c = STARTER_CANVASES[i]; if (!s || !c) return;
    this.applyWhole(c, `${s.name} loaded. Save to keep it.`);
  },

  // ---- tools and colors ----
  setTool(t) {
    if (!EDITOR_TOOLS.some(x => x.id === t)) return;
    this.tool = t; if (t !== 'picker') this.lastPaintTool = t;
    this.mapDirty = true; editorStore.set({ tool: t });
  },
  setSize(n) { if (!EDITOR_SIZES.includes(n)) return; this.size = n; this.mapDirty = true; editorStore.set({ size: n }); },
  toggleMirror() {
    this.mirror = !this.mirror; this.mapDirty = true; editorStore.set({ mirror: this.mirror });
    toast(this.mirror ? 'Mirror on: paint once, both sides change' : 'Mirror off');
  },
  toggleGrid() { this.grid = !this.grid; this.mapDirty = true; editorStore.set({ grid: this.grid }); },
  setLayer(l, quiet) {
    if (l !== 'base' && l !== 'outer') return;
    this.layer = l; this.avatar.setOuterVisible(l === 'outer'); this.mapDirty = true;
    editorStore.set({ layer: l }); if (!quiet) Sfx.play('click');
  },
  toggleTurn() {
    this.rotateTool = !this.rotateTool; if (this.rotateTool) this.setHover(null);
    editorStore.set({ turn: this.rotateTool, hint: this.rotateTool ? HINT_TURN : HINT_PAINT });
  },
  setColor(hex, remember) {
    const h = normHex(hex); if (!h) return;
    this.color = h; editorStore.set({ color: h });
    if (this.tool === 'eraser' || this.tool === 'picker') this.setTool('pencil');
    if (remember) this.remember(h);
  },
  // The hex field: true when the text was a color.
  commitHex(text) {
    const h = normHex(text);
    if (!h) { toast('Use a hex color like #FF6A2B.'); return false; }
    this.setColor(h, true); return true;
  },
  remember(hex) {
    if (PALETTE.includes(hex)) return;
    this.recent = [hex, ...this.recent.filter(c => c !== hex)].slice(0, 10); LS.set(RECENT_KEY, this.recent);
    editorStore.set({ recent: this.recent.slice() });
  },
  setTab(t) {
    if (t !== 'paint' && t !== 'skins' && t !== 'name') return;
    this.tab = t; this.mapDirty = true; this.thumbDirty = true;
    if (t !== 'paint') this.setHover(null);
    editorStore.set({ tab: t });
  },

  // ---- slots ----
  async selectSlot(i) {
    i = clamp(i | 0, 0, 4);
    if (!this.open || i === this.slot || this.busy) return;
    this.endStroke();
    this.busy = true;
    try {
      if (this.dirty) {
        const c = await this.ask({ title: 'Save before switching?', body: `Your changes to slot ${this.slot + 1} are not saved yet.`,
          buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Discard', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'ember' }] });
        if (c === 'cancel' || !this.open) return;
        if (c === 'save') await this.save();
        sessionSet(null);
      }
      this.slot = i;
      const r = await this.loadSlot(i); if (!r || !this.open) return;
      this.undo = []; this.redo = []; this.updateUndo();
      if (r.had) {
        Profile.active = i; Skins.setFrom(this.work); this.setDirty(false); this.syncSlots(); this.emitProfile();
        this.saving++; this.setDirty(false);
        Profile.persist().finally(() => { this.saving = Math.max(0, this.saving - 1); this.setDirty(this.dirty); });
        toast(`Wearing slot ${i + 1}`);
      } else { this.setDirty(true); toast(`Slot ${i + 1} is empty. It starts as a copy of your current skin. Save to keep it.`); }
      this.syncSlots(); Sfx.play('click');
    } finally { this.busy = false; }
  },

  // ---- import and download ----
  importFile(f) {
    if (!f || !this.open) return;
    const url = URL.createObjectURL(f), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width !== SK || img.height !== SK) { toast('Skins must be 64 × 64 pixels.', true); Sfx.play('error'); return; }
      const c = newSkinCanvas(); ctx2d(c).drawImage(img, 0, 0); this.applyWhole(c, 'Skin imported. Save to keep it.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("That file isn't a PNG image PlayForge can read.", true); Sfx.play('error'); };
    img.src = url;
  },
  download() {
    const dl = Caps.downloads; if (!dl || !this.work) { toast('Downloads are not available here.', true); return; }
    this.endStroke();
    const slot = this.slot;
    this.work.toBlob(async blob => {
      if (!blob) return;
      try { await dl.save({ filename: `playforge-skin-${slot + 1}.png`, data: blob }); toast('Skin downloaded'); Sfx.play('click'); }
      catch (err) {
        const code = err && err.code;
        if (code === 'declined') return;
        toast(code === 'rate_limited' ? 'A download is already waiting for your answer.' : 'Downloads are not available here.', true);
      }
    }, 'image/png');
  },

  // ---- display name ----
  syncName() {
    editorStore.set({ nick: Profile.nick, nickDefault: baseName(), nickClear: clearLabel() });
  },
  // Saves the custom display name ('' goes back to the guest name). Resolves true when it was saved.
  async saveNick(text) {
    const v = String(text || '').trim().replace(/\s+/g, ' ');
    const fail = msg => { editorStore.set({ nickHelp: msg, nickError: true }); Sfx.play('error'); return false; };
    if (v && (v.length < 3 || v.length > 20 || !/^[A-Za-z0-9 _.-]+$/.test(v))) return fail('Use 3 to 20 letters, numbers, spaces, dots, dashes or underscores.');
    if (WordFilter.hasBad(v)) return fail("That name isn't allowed. Try a different one.");
    Profile.nick = v;
    editorStore.set({ nickHelp: NICK_HELP, nickError: false, nickSeq: editorStore.get().nickSeq + 1 });
    this.syncName(); this.avatar.setName(Profile.displayName());
    this.emitProfile(); // the in-game nametag, the home card and the room use the new name
    Sfx.play('save');
    const where = await Profile.persist();
    if (this.open) this.setDirty(this.dirty);
    toast((v ? `Name saved: ${v}` : `Using your guest name, ${baseName()}`) + (where === 'cloud' ? '' : ' (on this device)'));
    return true;
  },
  clearNickError() { if (editorStore.get().nickError) editorStore.set({ nickHelp: NICK_HELP, nickError: false }); },

  // ---- keys ----
  onKeyDown(e) {
    if (!this.open || Engine.mode !== 'avatar' || e.defaultPrevented || this.blocked()) return;
    const mod = e.ctrlKey || e.metaKey, k = String(e.key || '').toLowerCase();
    if (k === 'escape') {
      if (isTyping(e)) { e.target.blur(); return; }
      if (this.onBack) { e.preventDefault(); this.onBack(); }
      return;
    }
    if (mod && k === 's') { e.preventDefault(); if (isTyping(e)) e.target.blur(); this.save(); return; }
    if (isTyping(e)) return;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod || e.altKey || e.repeat) return;
    if (TOOL_KEYS[k]) { this.setTool(TOOL_KEYS[k]); Sfx.play('click'); }
    else if (k === 'm') { this.toggleMirror(); Sfx.play('click'); }
    else if (k === '1' || k === '2' || k === '3') { this.setSize(+k); Sfx.play('click'); }
  },

  // ---- picking ----
  pick3D(cx, cy) {
    if (!this.view) return null;
    const r = this.view.getBoundingClientRect(); if (!r.width) return null;
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    const hits = this.ray.intersectObjects(this.layer === 'outer' ? this.avatar.outer : this.avatar.base, false);
    if (!hits.length || !hits[0].uv) return null;
    const h = hits[0], ud = h.object.userData, rect = faceRects(PART[ud.part], ud.layer)[FACES[Math.floor(h.faceIndex / 2)]];
    const x = clamp(Math.floor(h.uv.x * SK), rect.x, rect.x + rect.w - 1), y = clamp(Math.floor((1 - h.uv.y) * SK), rect.y, rect.y + rect.h - 1);
    const info = PIX[y * SK + x]; if (!info) return null;
    return { x, y, rect: info.rect };
  },
  mapPixel(e) {
    if (!this.map) return null;
    const r = this.map.getBoundingClientRect(); if (!r.width) return null;
    const x = Math.floor((e.clientX - r.left) / r.width * SK), y = Math.floor((e.clientY - r.top) / r.height * SK);
    return x < 0 || y < 0 || x >= SK || y >= SK ? null : [x, y];
  },
  setHover(p) {
    const same = p && this.hover && p[0] === this.hover[0] && p[1] === this.hover[1];
    if (same || (!p && !this.hover)) return;
    this.hover = p; this.mapDirty = true;
    if (!p) { editorStore.set({ caption: MAP_CAPTION }); return; }
    const info = PIX[p[1] * SK + p[0]];
    editorStore.set({ caption: (info ? `${PART[info.part].label} · ${FACE_LABEL[info.face]}${info.layer === 'outer' ? ' · outer layer' : ''}` : 'Unused area') + ` · ${p[0]}, ${p[1]}` });
  },

  // ---- the flat map ----
  sizeMap() {
    const panel = this.panel, c = this.map; if (!panel || !c || panel.hidden) return;
    const cs = getComputedStyle(panel), avail = panel.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (avail <= 0) return;
    const z = clamp(Math.floor(avail / SK), 3, 7), css = SK * z, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.style.width = css + 'px'; c.style.height = css + 'px';
    const px = Math.round(css * dpr); if (c.width !== px) { c.width = px; c.height = px; }
    this.mapDirty = true;
  },
  buildMapBg() {
    const c = document.createElement('canvas'); c.width = c.height = SK * 4; const g = c.getContext('2d'), C = this.colors;
    g.fillStyle = C.bg; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = C.line; g.lineWidth = 1.5;
    for (let i = -256; i < 256; i += 8) { g.beginPath(); g.moveTo(i, 256); g.lineTo(i + 256, 0); g.stroke(); }
    for (let y = 0; y < SK; y++) for (let x = 0; x < SK; x++) if (PIX[y * SK + x]) {
      g.fillStyle = C.surface; g.fillRect(x * 4, y * 4, 4, 4);
      g.fillStyle = C.surface2; g.fillRect(x * 4, y * 4, 2, 2); g.fillRect(x * 4 + 2, y * 4 + 2, 2, 2);
    }
    this.mapBg = c;
  },
  drawMap() {
    this.mapDirty = false;
    const c = this.map, g = c.getContext('2d'), W = c.width, S = W / SK, C = this.colors;
    if (!this.mapBg) this.buildMapBg();
    g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBg, 0, 0, W, W); g.drawImage(this.work, 0, 0, W, W);
    g.globalAlpha = 0.55; g.fillStyle = C.surface; g.fillRect(0, this.layer === 'base' ? W / 2 : 0, W, W / 2); g.globalAlpha = 1;
    if (this.grid && S >= 4) {
      g.strokeStyle = 'rgba(120,132,152,.3)'; g.lineWidth = 1; g.beginPath();
      for (let i = 1; i < SK; i++) { const p = Math.round(i * S) + 0.5; g.moveTo(p, 0); g.lineTo(p, W); g.moveTo(0, p); g.lineTo(W, p); }
      g.stroke();
    }
    const lw = Math.max(1, Math.round(S / 4)); g.strokeStyle = C.ink2; g.globalAlpha = 0.6; g.lineWidth = lw;
    for (const p of PARTS) for (const layer of ['base', 'outer']) { const rs = faceRects(p, layer); for (const f of FACES) { const r = rs[f]; g.strokeRect(r.x * S + lw / 2, r.y * S + lw / 2, r.w * S - lw, r.h * S - lw); } }
    g.globalAlpha = 1;
    if (this.hover) {
      const n = this.tool === 'bucket' || this.tool === 'picker' ? 1 : this.size, o = n === 3 ? -1 : 0;
      const box = (x, y, col) => { g.strokeStyle = col; g.lineWidth = 2; g.strokeRect((x + o) * S + 1, (y + o) * S + 1, n * S - 2, n * S - 2); };
      box(this.hover[0], this.hover[1], C.cobalt);
      if (this.mirror) { const m = mirrorPixel(this.hover[0], this.hover[1]); if (m) box(m[0], m[1], C.ember); }
    }
  },

  // ---- the shared loop (Engine.views.avatar) ----
  frame(dt) {
    this.t += dt;
    this.avatar.body.position.y = Math.sin(this.t * 2) * 0.008;
    if (this.mapDirty && this.map && this.panel && !this.panel.hidden && this.map.width > 0) this.drawMap();
    if (this.thumbDirty && this.thumbs.size) { this.thumbDirty = false; this.thumbs.forEach(c => { if (c.isConnected) drawFigure(c, this.work); }); }
    const cp = Math.cos(this.pitch);
    this.cam.position.set(Math.sin(this.yaw) * cp * this.dist, 1.05 + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(0, 1.05, 0);
    Engine.renderer.render(this.scene, this.cam);
  },
};
