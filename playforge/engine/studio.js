import * as THREE from 'three';
import { Caps, DEG, IS_TOUCH, Profile, Sfx, WordFilter, askChoice, clamp, toast } from './core.js';
import { createStore } from './stores.js';
import { Engine } from './render.js';
import { AXES, ENV, World, finite3, mkPart, normPart } from './world.js';
import { isTyping } from './input.js';
import { Modes } from './game.js';
import { GAME_LIMITS, Library } from './library.js';

/* ---------- Studio: make your own games ---------- */
// The game being edited is a draft doc (see Library). doc.parts holds every part plus group nodes
// ({id, name, shape: 'group'}); a part joins a group through part.parent. Studio adds the doc's own part
// objects to the world, so editing a part and refreshing its mesh is enough to keep both in step.
//
// The React screen (components/playforge/studio) owns the markup. It hands Studio the 3D viewport element
// (Studio.attach(view) -> detach), opens a doc (Studio.open(doc)) and reads studioStore. Every change to the doc
// goes through Studio.edit(label, ids, fn) (or beginEdit/endEdit for drags) so undo and redo restore exact
// snapshots, including each part's place in doc.parts.
export const ST_COLORS = ['#FF6A2B', '#FFC53A', '#7CFF6B', '#3FA34D', '#17A39C', '#4CF0FF', '#2D62F0', '#7A4FD0', '#E23E62', '#FF5CA8', '#8A5A35', '#C08A55', '#EDEFF2', '#9AA5B1', '#4E5B74', '#17223A'];
export const ST_MATERIALS = ['plastic', 'wood', 'stone', 'brick', 'metal', 'grass', 'sand', 'ice', 'neon'];
export const BEHAVIOR_INFO = {
  none: { label: 'Nothing' },
  kill: { label: 'Kill on touch', short: 'Kill', help: 'Sends players back to their last checkpoint.' },
  damage: { label: 'Hurt over time', short: 'Hurt', params: [{ k: 'dps', label: 'Damage per second', def: 25, min: 1, max: 500 }] },
  checkpoint: { label: 'Checkpoint', short: 'Checkpoint', help: 'Players respawn here after they touch it.' },
  finish: { label: 'Finish line', short: 'Finish', help: 'Touching it wins the round.' },
  coin: { label: 'Coin', short: 'Coin', params: [{ k: 'value', label: 'Points', def: 1, min: 1, max: 100 }, { k: 'respawn', label: 'Comes back after (seconds, 0 = never)', def: 0, min: 0, max: 600 }] },
  bounce: { label: 'Bounce pad', short: 'Bounce', params: [{ k: 'power', label: 'Power', def: 28, min: 5, max: 90 }] },
  speed: { label: 'Speed boost', short: 'Speed', params: [{ k: 'mult', label: 'Speed ×', def: 1.8, min: 1, max: 4 }, { k: 'time', label: 'Seconds', def: 3, min: 0.5, max: 30 }] },
  spin: { label: 'Spin', short: 'Spin', params: [{ k: 'axis', label: 'Axis', def: 'y', opts: ['x', 'y', 'z'] }, { k: 'speed', label: 'Degrees per second', def: 90, min: -720, max: 720 }] },
  move: { label: 'Move back and forth', short: 'Move', params: [{ k: 'offset', label: 'Moves by', def: [0, 0, 8], vec: true }, { k: 'period', label: 'Seconds per trip', def: 4, min: 0.2, max: 60 }] },
  swing: { label: 'Swing', short: 'Swing', params: [{ k: 'axis', label: 'Axis', def: 'z', opts: ['x', 'y', 'z'] }, { k: 'amp', label: 'Angle', def: 60, min: 1, max: 180 }, { k: 'period', label: 'Seconds per swing', def: 3, min: 0.2, max: 60 }] },
  vanish: { label: 'Vanish when touched', short: 'Vanish', params: [{ k: 'delay', label: 'Delay (seconds)', def: 0.5, min: 0, max: 10 }, { k: 'back', label: 'Back after (seconds)', def: 3, min: 0.2, max: 60 }] },
  fake: { label: 'Fake (breaks at once)', short: 'Fake', params: [{ k: 'back', label: 'Back after (seconds)', def: 4, min: 0.2, max: 60 }] },
  teleport: { label: 'Teleport', short: 'Teleport', params: [{ k: 'to', label: 'Sends players to', def: [0, 5, 0], vec: true }] },
};
export const STUDIO_MODES = {
  custom: ['Finish line and coins', 'Players head for a Finish part. Coins add to the score, and a time limit can end the round.'],
  free: ['Hang out', 'No goal. Players explore and play together.'],
};
// Insert catalogue. make(at) returns parts relative to the drop point (y = height above the surface):
// [shape, [x, y, z], size, color, material, extra]. Several parts become a group.
export const ST_INSERT = {
  parts: [
    { label: 'Block', icon: 'cube', color: '#9AA5B1', make: () => [['block', [0, 1, 0], [4, 2, 4], '#9AA5B1']] },
    { label: 'Plate', icon: 'cube', color: '#EDEFF2', make: () => [['block', [0, 0.25, 0], [8, 0.5, 8], '#EDEFF2', 'plastic', { name: 'Plate' }]] },
    { label: 'Wall', icon: 'cube', color: '#C9B79C', make: () => [['block', [0, 2, 0], [8, 4, 1], '#C9B79C', 'brick', { name: 'Wall' }]] },
    { label: 'Ramp', icon: 'wedge', color: '#FFC53A', make: () => [['wedge', [0, 1, 0], [4, 2, 6], '#FFC53A', 'plastic', { name: 'Ramp' }]] },
    { label: 'Ball', icon: 'ball', color: '#E23E62', make: () => [['sphere', [0, 1.5, 0], [3, 3, 3], '#E23E62', 'plastic', { name: 'Ball' }]] },
    { label: 'Cylinder', icon: 'cyl', color: '#4B7BFF', make: () => [['cylinder', [0, 1.5, 0], [2, 3, 2], '#2D62F0']] },
    { label: 'Stairs', icon: 'wedge', color: '#B9A08A', make: () => [0, 1, 2, 3, 4, 5].map(i => { const h = 0.5 * (i + 1); return ['block', [0, h / 2, -i * 1.2], [4, h, 1.2], '#B9A08A', 'stone', { name: 'Step' }]; }) },
    { label: 'Spawn', icon: 'person', color: '#FF6A2B', make: () => [['spawn', [0, 0.2, 0], [6, 0.4, 6], '#FF6A2B', 'plastic', { name: 'Spawn' }]] },
  ],
  gameplay: [
    { label: 'Coin', icon: 'coin', color: '#FFD24A', make: () => [['cylinder', [0, 1.4, 0], [1.2, 1.2, 0.25], '#FFD24A', 'neon', { name: 'Coin', rot: [90, 0, 0], canCollide: false, behavior: 'coin', bp: { value: 1, respawn: 0 } }]] },
    { label: 'Checkpoint', icon: 'flag', color: '#9AA5B1', make: () => [['block', [0, 0.2, 0], [4, 0.4, 4], '#9AA5B1', 'plastic', { name: 'Checkpoint', behavior: 'checkpoint' }]] },
    { label: 'Finish', icon: 'trophy', color: '#7CFF6B', make: () => [['block', [0, 0.2, 0], [6, 0.4, 6], '#7CFF6B', 'neon', { name: 'Finish', behavior: 'finish' }]] },
    { label: 'Kill brick', icon: 'skull', color: '#FF4B3E', make: () => [['block', [0, 0.5, 0], [4, 1, 4], '#FF3B30', 'neon', { name: 'Kill brick', behavior: 'kill' }]] },
    { label: 'Lava', icon: 'fire', color: '#FF7A2B', make: () => [['block', [0, 0.15, 0], [12, 0.3, 12], '#FF5A1F', 'neon', { name: 'Lava', behavior: 'damage', bp: { dps: 40 } }]] },
    { label: 'Bounce pad', icon: 'jump', color: '#7CFF6B', make: () => [['block', [0, 0.3, 0], [4, 0.6, 4], '#7CFF6B', 'neon', { name: 'Bounce pad', behavior: 'bounce', bp: { power: 30 } }]] },
    { label: 'Speed pad', icon: 'bolt', color: '#4CF0FF', make: () => [['block', [0, 0.15, 0], [4, 0.3, 8], '#4CF0FF', 'neon', { name: 'Speed pad', behavior: 'speed', bp: { mult: 1.8, time: 3 } }]] },
    { label: 'Mover', icon: 'move', color: '#FFC53A', make: () => [['block', [0, 3, 0], [6, 0.6, 4], '#FFC53A', 'plastic', { name: 'Moving platform', behavior: 'move', bp: { offset: [0, 0, 10], period: 5 } }]] },
    { label: 'Spinner', icon: 'rotate', color: '#E23E62', make: () => [['block', [0, 1.3, 0], [12, 0.6, 0.8], '#E23E62', 'plastic', { name: 'Spinner', behavior: 'spin', bp: { axis: 'y', speed: 90 }, tag: 'hazard' }], ['cylinder', [0, 0.6, 0], [1.6, 1.2, 1.6], '#4E5B74', 'metal', { name: 'Spinner hub' }]] },
    { label: 'Swinger', icon: 'hand', color: '#7A4FD0', make: () => [['block', [0, 5.6, 0], [0.8, 5, 0.8], '#7A4FD0', 'metal', { name: 'Swinging bar', behavior: 'swing', bp: { axis: 'z', amp: 60, period: 3 }, tag: 'hazard' }], ['block', [0, 8.4, 0], [7, 0.6, 0.6], '#4E5B74', 'metal', { name: 'Crossbar' }], ['block', [-3.2, 4.2, 0], [0.6, 8.4, 0.6], '#4E5B74', 'metal', { name: 'Post' }], ['block', [3.2, 4.2, 0], [0.6, 8.4, 0.6], '#4E5B74', 'metal', { name: 'Post' }]] },
    { label: 'Vanishing', icon: 'eye', color: '#C9A8FF', make: () => [['block', [0, 0.5, 0], [4, 1, 4], '#C9A8FF', 'ice', { name: 'Vanishing step', behavior: 'vanish', bp: { delay: 0.5, back: 3 } }]] },
    { label: 'Fake block', icon: 'cube', color: '#B9A08A', make: () => [['block', [0, 0.5, 0], [4, 1, 4], '#9AA5B1', 'plastic', { name: 'Fake block', behavior: 'fake', bp: { back: 4 } }]] },
    { label: 'Teleporter', icon: 'bolt', color: '#9A7BFF', make: at => [['cylinder', [0, 0.15, 0], [3, 0.3, 3], '#9A7BFF', 'neon', { name: 'Teleporter', behavior: 'teleport', bp: { to: [Math.round(at.x), Math.round(at.y + 3), Math.round(at.z - 16)] } }]] },
    { label: 'Hazard ball', icon: 'skull', color: '#FF4B3E', make: () => [['sphere', [0, 1.2, 0], [2.4, 2.4, 2.4], '#FF3B30', 'neon', { name: 'Hazard ball', tag: 'hazard' }]] },
  ],
  scenery: [
    { label: 'Tree', icon: 'tree', color: '#4DB06A', make: () => [['cylinder', [0, 2, 0], [0.9, 4, 0.9], '#8A5A35', 'wood', { name: 'Trunk' }], ['sphere', [0, 5.2, 0], [4.4, 4, 4.4], '#4DB06A', 'grass', { name: 'Leaves' }]] },
    { label: 'Pine', icon: 'tree', color: '#2F7A55', make: () => [['cylinder', [0, 1.5, 0], [0.8, 3, 0.8], '#6B4A2E', 'wood', { name: 'Trunk' }], ['cylinder', [0, 4.4, 0], [3.6, 3.6, 3.6], '#2F7A55', 'grass', { name: 'Pine' }], ['cylinder', [0, 6.6, 0], [2.2, 2, 2.2], '#2F7A55', 'grass', { name: 'Pine top' }]] },
    { label: 'Rock', icon: 'ball', color: '#8A939E', make: () => [['sphere', [0, 0.7, 0], [3, 2, 2.6], '#8A939E', 'stone', { name: 'Rock', rot: [0, 25, 0] }]] },
    { label: 'Bush', icon: 'ball', color: '#3F9E57', make: () => [['sphere', [0, 0.7, 0], [2.6, 1.6, 2.6], '#3F9E57', 'grass', { name: 'Bush' }]] },
    { label: 'Crate', icon: 'cube', color: '#C08A55', make: () => [['block', [0, 1, 0], [2, 2, 2], '#C08A55', 'wood', { name: 'Crate' }]] },
    { label: 'Lamp', icon: 'sun', color: '#FFE07A', make: () => [['cylinder', [0, 2, 0], [0.25, 4, 0.25], '#4E5B74', 'metal', { name: 'Lamp post' }], ['sphere', [0, 4.2, 0], [0.8, 0.8, 0.8], '#FFE07A', 'neon', { name: 'Lamp', canCollide: false }]] },
    { label: 'Fence', icon: 'grid', color: '#C08A55', make: () => [['block', [-3, 0.8, 0], [0.4, 1.6, 0.4], '#8A5A35', 'wood', { name: 'Post' }], ['block', [3, 0.8, 0], [0.4, 1.6, 0.4], '#8A5A35', 'wood', { name: 'Post' }], ['block', [0, 1.2, 0], [6.4, 0.25, 0.2], '#C08A55', 'wood', { name: 'Rail' }], ['block', [0, 0.6, 0], [6.4, 0.25, 0.2], '#C08A55', 'wood', { name: 'Rail' }]] },
    { label: 'House', icon: 'folder', color: '#E9E4D8', make: () => {
      const W = '#E9E4D8', out = [['block', [0, 0.15, 0], [8, 0.3, 7], '#8A5A35', 'wood', { name: 'Floor' }], ['block', [0, 2, -3.35], [8, 3.7, 0.3], W, 'brick', { name: 'Wall' }], ['block', [-3.85, 2, 0], [0.3, 3.7, 7], W, 'brick', { name: 'Wall' }], ['block', [3.85, 2, 0], [0.3, 3.7, 7], W, 'brick', { name: 'Wall' }]];
      out.push(['block', [-2.6, 2, 3.35], [2.8, 3.7, 0.3], W, 'brick', { name: 'Wall' }], ['block', [2.6, 2, 3.35], [2.8, 3.7, 0.3], W, 'brick', { name: 'Wall' }], ['block', [0, 3.35, 3.35], [2.4, 1, 0.3], W, 'brick', { name: 'Wall' }]);
      out.push(['wedge', [0, 4.75, -1.85], [8.8, 1.8, 3.9], '#C2410C', 'wood', { name: 'Roof', rot: [0, 180, 0] }], ['wedge', [0, 4.75, 1.85], [8.8, 1.8, 3.9], '#C2410C', 'wood', { name: 'Roof' }]);
      return out;
    } },
    { label: 'Water', icon: 'drop', color: '#2E86D8', make: () => [['block', [0, 0.2, 0], [16, 0.4, 16], '#2E86D8', 'ice', { name: 'Water', transparency: 0.35, canCollide: false }]] },
    { label: 'Cloud', icon: 'ball', color: '#FFFFFF', make: () => [['sphere', [0, 20, 0], [6, 3, 4], '#FFFFFF', 'plastic', { name: 'Cloud', canCollide: false }], ['sphere', [3, 20.6, 0.5], [5, 3.4, 4], '#FFFFFF', 'plastic', { name: 'Cloud', canCollide: false }], ['sphere', [-3, 19.8, 0], [4, 2.4, 3.4], '#FFFFFF', 'plastic', { name: 'Cloud', canCollide: false }]] },
    { label: 'Flag', icon: 'flag', color: '#FF6A2B', make: () => [['cylinder', [0, 3, 0], [0.25, 6, 0.25], '#EDEFF2', 'metal', { name: 'Flag pole' }], ['block', [0.95, 5.3, 0], [1.6, 1, 0.1], '#FF6A2B', 'plastic', { name: 'Flag', canCollide: false }]] },
  ],
};
export const INSERT_CATS = [['parts', 'Parts'], ['gameplay', 'Gameplay'], ['scenery', 'Scenery']];
export const r3 = v => Math.round(v * 1000) / 1000;
export const SNAPS = [1, 2, 4, 0.5, 0.25, 0];
export const STUDIO_TOOLS = [['select', 'Select', 'cursor'], ['move', 'Move', 'move'], ['rotate', 'Rotate', 'rotate'], ['scale', 'Resize', 'scale']];
const MAX_ROWS = 900;
const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const NONE = Object.freeze([]);
const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 999px)').matches);
const toolHint = (tool, snapOn) => ({
  select: IS_TOUCH ? 'Tap a part to select it · drag to look around · pinch to zoom' : 'Click a part to select it · drag to look around · scroll to zoom · WASD to fly',
  move: 'Drag an arrow, or drag a selected part across the ground',
  rotate: 'Drag a ring to turn the selection' + (snapOn ? ' in 15° steps' : ''),
  scale: 'Drag a square to resize the part',
}[tool] || '');
const savedText = doc => (doc && doc.publishedAt ? 'Published · saved on this device' : 'Saved on this device');
// A big flat floor (a remixed level's ground): locked, so taps on it look around instead of grabbing it.
const plainSnap = m => JSON.stringify([...m.values()].map(s => s && s.p));
const isFloor = p => p.shape === 'block' && p.size[0] >= 60 && p.size[2] >= 60 && p.size[1] <= 6 && !p.behavior && !(p.rot || []).some(Boolean);

// What the React screen reads. The doc's parts live on Studio (Studio.doc, Studio.byId, Studio.rows()); `rev` bumps
// whenever they change and `metaRev` whenever the game's settings (title, sky, rules...) change.
//   sel: selected part ids (a new array on every change), drawer: 'st-left' | 'st-right' | null (phones),
//   pane: 'explorer' | 'props' (which part of the right drawer to show), drawerSeq: bumps on every drawer request,
//   status: the save line, hint: one line under the 3D view, testing: Test is running, publishing: busy.
export const studioStore = createStore({
  open: false, id: '', title: '', published: false, status: '', rev: 0, metaRev: 0, count: 0, sel: NONE,
  tool: 'select', snapOn: true, snapStep: 1, canUndo: false, canRedo: false, hint: '', drawer: null, pane: null, drawerSeq: 0,
  testing: false, publishing: false,
});

export const Studio = {
  doc: null, index: new Map(), sel: new Set(), tool: 'select', snapOn: true, snapStep: 1, undoStack: [], redoStack: [], pend: null,
  cam: null, focus: null, yaw: 0.8, pitch: 0.6, dist: 36, keys: new Set(), ptrs: new Map(), drag: null,
  gscene: null, giz: null, outlines: new Map(), ray: null, grid: null, saveTimer: 0, view: null, blocked: () => false,
  inited: false, testing: false, thumbDone: false, placedNote: false, rev: 0, metaRev: 0, _rows: null, _rowsRev: -1,
  SNAPS,

  init() {
    if (this.inited) return; this.inited = true;
    Engine.views.studio = this;
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1500); this.focus = new THREE.Vector3(); this.ray = new THREE.Raycaster();
    this.buildGizmo();
  },
  // Binds pointer and keyboard handling to the screen's 3D viewport element. opts.blocked() returns true while a
  // dialog is open (keys then belong to it). Returns a detach function.
  attach(view, opts = {}) {
    this.init();
    this.view = view; this.blocked = opts.blocked || (() => false);
    const offs = [], on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); offs.push(() => t.removeEventListener(ev, fn, o)); };
    on(view, 'pointerdown', e => this.onDown(e));
    on(view, 'pointermove', e => this.onMove(e));
    on(view, 'pointerup', e => this.onUp(e));
    on(view, 'pointercancel', e => this.onUp(e, true));
    on(view, 'lostpointercapture', e => { if (this.ptrs.has(e.pointerId)) this.onUp(e, true); });
    on(view, 'wheel', e => {
      e.preventDefault(); if (!this.doc) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      this.dist = clamp(this.dist * Math.pow(1.0015, dy), 3, 420);
    }, { passive: false });
    on(view, 'contextmenu', e => e.preventDefault());
    on(window, 'keydown', e => this.onKeyDown(e));
    on(window, 'keyup', e => this.keys.delete(String(e.key).toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
    // The last edit is saved at once when the page is closed, reloaded or sent to the background.
    on(window, 'pagehide', () => this.flush());
    on(document, 'visibilitychange', () => { if (document.hidden) this.flush(); });
    return () => {
      offs.forEach(f => f());
      if (this.view === view) { this.view = null; this.blocked = () => false; }
      this.keys.clear(); this.ptrs.clear(); this.drag = null;
    };
  },
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); },

  // ---- drafts for the routes ----
  // A new blank game saved as a draft. Its Baseplate is locked so taps on the ground look around.
  createDraft() {
    const n = Library.drafts().length + 1, doc = Library.blank(n > 1 ? `My game ${n}` : 'My game');
    for (const p of doc.parts) if (p.name === 'Baseplate') p.locked = true;
    return Library.saveDraft(doc) ? doc : null;
  },
  // An editable copy of a game definition (built-in or community), saved as a draft. Null if it can't be copied.
  remixDraft(def) {
    if (!def) return null;
    let doc;
    try { doc = Library.remix(def); } catch (e) { console.error(e); toast("This game can't be copied.", true); return null; }
    if (Number.isFinite(def.killY)) doc.killY = def.killY; // players who fall off still respawn in the copy
    if (doc.parts.length > GAME_LIMITS.parts) { doc.parts = doc.parts.slice(0, GAME_LIMITS.parts); toast(`Your copy keeps the first ${GAME_LIMITS.parts} parts.`); }
    for (const p of doc.parts) if (p && p.shape !== 'group' && isFloor(normPart(p))) p.locked = true;
    return Library.saveDraft(doc) ? doc : null;
  },

  // ---- opening and leaving ----
  open(doc) {
    if (!doc) return;
    this.init();
    if (this.doc && this.doc !== doc) this.close();
    const seen = new Set(), parts = [];
    for (const p of Array.isArray(doc.parts) ? doc.parts : []) {
      if (!p || typeof p !== 'object') continue;
      const q = p.shape === 'group' ? { id: String(p.id || ''), name: String(p.name || 'Group').slice(0, 40), shape: 'group' } : normPart(p);
      if (!q.id || seen.has(q.id)) { let id; do { id = (q.shape === 'group' ? 'g' : 'p') + Math.random().toString(36).slice(2, 9); } while (seen.has(id)); q.id = id; }
      seen.add(q.id); parts.push(q);
    }
    for (const q of parts) if (q.parent && !seen.has(q.parent)) delete q.parent;
    doc.parts = parts; doc.env = doc.env && typeof doc.env === 'object' ? doc.env : { sky: 'day' }; doc.modeOpts = doc.modeOpts && typeof doc.modeOpts === 'object' ? doc.modeOpts : {};
    // A remixed level keeps its start point as a Spawn part you can move.
    if (!parts.some(p => p.shape === 'spawn')) {
      const s = finite3(doc.spawn, [0, 3, 0]);
      parts.push(normPart(mkPart('spawn', [s[0], s[1] - 0.2, s[2]], [6, 0.4, 6], '#FF6A2B', 'plastic', { id: 'spawn' + Math.random().toString(36).slice(2, 6), name: 'Spawn' })));
    }
    delete doc.spawn;
    this.doc = doc; this.index = new Map(parts.map(p => [p.id, p]));
    this.sel = new Set(); this.undoStack = []; this.redoStack = []; this.pend = null; this.drag = null; this.ptrs.clear();
    this.testing = false; this.thumbDone = false; this.placedNote = false; this._rows = null;
    this.rev++; this.metaRev++;
    studioStore.set({ open: true, id: doc.id, testing: false, publishing: false, drawer: null, sel: NONE });
    this.show(); this.frameStart();
  },
  // Puts the editor on screen: the renderer in the viewport and the doc's parts in an edit-mode world.
  show() {
    Engine.setMode('studio'); if (this.view) Engine.attach(this.view);
    this.loadWorld(); this.syncOutlines();
    this.syncAll();
  },
  loadWorld() {
    World.load({ id: this.doc.id, title: this.doc.title, env: this.doc.env, parts: [] }, { edit: true });
    for (const p of this.doc.parts) if (p.shape !== 'group') World.addPart(p);
    const grid = new THREE.GridHelper(256, 64, 0x17223A, 0x17223A);
    grid.material.transparent = true; grid.material.opacity = 0.13; grid.material.depthWrite = false; grid.position.y = 0.02; grid.renderOrder = 1;
    this.grid = grid; World.scene.add(grid);
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear();
  },
  // The camera looks along the start point's facing, a little ahead of it, so the first inserts land beside the
  // Spawn instead of on top of it.
  // A narrow (phone) view looks more straight along the facing, so the Spawn stays in the picture.
  frameStart() {
    const sp = this.startSpawn(), yaw = Number.isFinite(this.doc.spawnYaw) ? this.doc.spawnYaw : Math.PI, narrow = this.cam.aspect < 0.9;
    const ahead = narrow ? 9 : 12;
    if (sp) this.focus.set(sp.pos[0] + Math.sin(yaw) * ahead, sp.pos[1], sp.pos[2] + Math.cos(yaw) * ahead);
    else this.focus.set(0, 0, 0);
    this.yaw = yaw + Math.PI + (narrow ? 0.22 : 0.8); this.pitch = 0.6; this.dist = narrow ? 40 : 36;
  },
  startSpawn() { return this.doc ? this.doc.parts.find(p => p.shape === 'spawn') || null : null; },
  // Before leaving for home: a thumbnail of the current view and a final save.
  leave() {
    if (!this.doc) return;
    this.cancelDrag();
    if (!this.testing && World.scene) { this.doc.thumb = this.thumb(); this.thumbDone = true; }
    this.save(true); Sfx.play('click');
  },
  // The screen unmounted: save (with a thumbnail unless leave() made one) and clear the editor.
  close() {
    if (!this.doc) return;
    this.cancelDrag();
    if (!this.testing && !this.thumbDone && World.scene) this.doc.thumb = this.thumb();
    this.save(true);
    if (!this.testing) World.unload(); // while testing, the game owns the world and unloads it itself
    this.grid = null; this.doc = null; this.index = new Map(); this.sel = new Set(); this.undoStack = []; this.redoStack = [];
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear(); this.testing = false; this._rows = null;
    if (Engine.mode === 'studio') Engine.setMode('home');
    studioStore.set({ open: false, id: '', sel: NONE, drawer: null, testing: false, publishing: false, canUndo: false, canRedo: false });
  },
  // The page is closing or going to the background: a field still being typed in commits, then the doc is saved.
  flush() {
    if (!this.doc) return;
    const a = document.activeElement;
    if (a && a !== document.body && isTyping({ target: a })) a.blur();
    this.save(true);
  },
  onEscape() {
    if (studioStore.get().drawer) { this.closeDrawers(); return; }
    if (this.drag) { this.cancelDrag(); return; }
    if (this.sel.size) this.select([]);
  },
  onKeyDown(e) {
    if (Engine.mode !== 'studio' || !this.doc || this.testing || e.defaultPrevented || this.blocked()) return;
    if (isTyping(e)) return; // fields handle their own Enter and Escape
    if (e.key === 'Escape') { this.onEscape(); return; }
    const k = String(e.key).toLowerCase();
    if (!e.ctrlKey && !e.metaKey && !e.altKey && FLY_KEYS.has(k)) { this.keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); }
    this.onKey(e);
  },
  onKey(e) {
    const k = String(e.key).toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.duplicate(); return; }
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) this.ungroup(); else this.group(); return; }
    if (mod && k === 's') { e.preventDefault(); this.save(true); toast('Saved on this device'); return; }
    if (mod || e.altKey) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); this.remove(); return; }
    if (k === '1' || k === '2' || k === '3' || k === '4') { this.setTool(['select', 'move', 'rotate', 'scale'][+k - 1]); return; }
    if (k === 'f') { this.focusSel(); return; }
    if (k === 'g') { this.cycleSnap(); return; }
    if (k === 'r' && this.sel.size) this.quickTurn();
  },

  // ---- store ----
  syncAll() {
    const d = this.doc;
    studioStore.set({
      open: !!d, id: d ? d.id : '', title: d ? d.title || 'Untitled game' : '', published: !!(d && d.publishedAt), status: savedText(d),
      rev: this.rev, metaRev: this.metaRev, count: d ? this.partCount() : 0, sel: this.sel.size ? [...this.sel] : NONE,
      tool: this.tool, snapOn: this.snapOn, snapStep: this.snapStep, hint: toolHint(this.tool, this.snapOn),
      canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length, testing: this.testing,
    });
  },
  syncUndo() { studioStore.set({ canUndo: !!this.undoStack.length, canRedo: !!this.redoStack.length }); },
  metaChanged() { this.metaRev++; this.save(true); studioStore.set({ metaRev: this.metaRev, title: this.doc.title || 'Untitled game' }); },

  // ---- saving ----
  setTitle(v) {
    if (!this.doc) return;
    this.doc.title = WordFilter.clean(String(v || '').replace(/\s+/g, ' ').trim().slice(0, GAME_LIMITS.title)) || 'Untitled game';
    this.metaChanged();
  },
  changed() {
    this.rev++; this.syncUndo();
    clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 700);
    studioStore.set({ rev: this.rev, count: this.partCount(), status: 'Saving…' });
  },
  save(now) {
    clearTimeout(this.saveTimer); if (!this.doc) return false;
    const ok = Library.saveDraft(this.doc);
    studioStore.set({ status: ok ? savedText(this.doc) : 'Not saved: this device is full', published: !!this.doc.publishedAt, title: this.doc.title || 'Untitled game' });
    return ok;
  },
  thumb() {
    if (!World.scene) return '';
    if (this.grid) this.grid.visible = false;
    let url = '';
    try { url = World.snapshot(256, 160, this.cam, this.focus); if (url.length > 23000) url = World.snapshot(192, 120, this.cam, this.focus); } catch (e) { url = ''; }
    if (this.grid) this.grid.visible = true;
    return url.length < 24000 ? url : '';
  },

  // ---- parts and history ----
  byId(id) { return this.index.get(id) || null; },
  partCount() { let n = 0; for (const p of this.doc.parts) if (p.shape !== 'group') n++; return n; },
  kids(gid) { return this.doc.parts.filter(p => p.parent === gid && p.shape !== 'group').map(p => p.id); },
  newId(prefix = 'p') { let id; do { id = prefix + Math.random().toString(36).slice(2, 9); } while (this.index.has(id)); return id; },
  // at: index in doc.parts (the end when left out). Undo puts parts back where they were.
  addRaw(p, at) {
    const L = this.doc.parts;
    if (Number.isInteger(at) && at >= 0 && at < L.length) L.splice(at, 0, p); else L.push(p);
    this.index.set(p.id, p); if (p.shape !== 'group') World.addPart(p);
  },
  removeRaw(id) {
    const i = this.doc.parts.findIndex(p => p.id === id); if (i >= 0) this.doc.parts.splice(i, 1);
    this.index.delete(id); World.removePart(id); this.sel.delete(id); this.dropOutline(id);
  },
  copyOf(p) { return p ? JSON.parse(JSON.stringify(p)) : null; },
  // id -> {p: a copy of the part, i: its index in doc.parts} | null (the part doesn't exist)
  snap(ids) {
    const m = new Map(), pos = new Map(); this.doc.parts.forEach((p, i) => pos.set(p.id, i));
    for (const id of ids) { const p = this.byId(id); m.set(id, p ? { p: this.copyOf(p), i: pos.get(id) } : null); }
    return m;
  },
  pushHist(label, before, after) {
    this.undoStack.push({ label, before, after }); if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = []; this.syncUndo();
  },
  // One undoable step: ids are the parts fn changes or removes; fn returns the ids of parts it creates.
  // An edit that changes nothing (the same colour again, a size of -3 on a part already 3) leaves no step.
  edit(label, ids, fn) {
    const before = this.snap(ids), created = fn() || [];
    const all = [...new Set([...ids, ...created])];
    for (const id of created) if (!before.has(id)) before.set(id, null);
    const after = this.snap(all);
    if (!created.length && plainSnap(before) === plainSnap(after)) return;
    this.pushHist(label, before, after); this.changed();
  },
  // Drags change parts live; the step is recorded when the drag ends.
  beginEdit(ids) { this.pend = { ids: [...ids], before: this.snap(ids) }; },
  endEdit(label = 'Edit') {
    const pe = this.pend; this.pend = null; if (!pe) return;
    const after = this.snap(pe.ids);
    if (plainSnap(pe.before) === plainSnap(after)) return;
    for (const id of pe.ids) { const p = this.byId(id); if (p && p.shape !== 'group') World.refreshPart(p); }
    this.pushHist(label, pe.before, after); this.changed();
  },
  // Drops a drag in progress and puts the parts back (Escape, a cancelled pointer, Test, leaving).
  cancelDrag() {
    if (this.pend) { this.applyState(this.pend.before); this.pend = null; }
    this.drag = null; this.ptrs.clear();
  },
  applyState(map) {
    const adds = [];
    for (const [id, st] of map) {
      const cur = this.byId(id);
      if (!st) { if (cur) this.removeRaw(id); continue; }
      if (cur) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, this.copyOf(st.p)); if (cur.shape !== 'group') World.refreshPart(cur); }
      else adds.push(st);
    }
    // Parts come back at their old places, in ascending order so every index is right when it is used.
    adds.sort((a, b) => (a.i ?? 1e9) - (b.i ?? 1e9));
    for (const st of adds) this.addRaw(this.copyOf(st.p), st.i);
    for (const id of [...this.sel]) if (!this.byId(id)) this.sel.delete(id);
  },
  undo() {
    if (this.pend || !this.doc) return; const h = this.undoStack.pop(); if (!h) return;
    this.applyState(h.before); this.redoStack.push(h); this.afterHistory('Undid ' + h.label.toLowerCase());
  },
  redo() {
    if (this.pend || !this.doc) return; const h = this.redoStack.pop(); if (!h) return;
    this.applyState(h.after); this.undoStack.push(h); this.afterHistory('Redid ' + h.label.toLowerCase());
  },
  afterHistory(msg) { this.changed(); this.selChanged(); Sfx.play('click'); studioStore.set({ hint: msg }); },

  // ---- selection ----
  select(ids) { this.sel = new Set(ids.filter(id => { const p = this.byId(id); return p && p.shape !== 'group'; })); this.selChanged(); },
  selChanged() {
    this.syncOutlines();
    const cur = studioStore.get().sel, next = [...this.sel];
    if (cur.length !== next.length || next.some((id, i) => cur[i] !== id)) studioStore.set({ sel: next.length ? next : NONE });
  },
  selParts() { return [...this.sel].map(id => this.byId(id)).filter(Boolean); },
  selGroup() { // the group, when the selection is exactly one whole group
    const ps = this.selParts(); if (!ps.length || !ps[0].parent) return null;
    const g = ps[0].parent; if (!ps.every(p => p.parent === g)) return null;
    return this.kids(g).length === ps.length ? this.byId(g) : null;
  },
  clickSelect(part, additive) {
    if (!part) { if (!additive) this.select([]); return; }
    let ids = [part.id];
    if (part.parent && this.byId(part.parent)) {
      const kids = this.kids(part.parent), whole = kids.length === this.sel.size && kids.every(id => this.sel.has(id));
      if (!whole) ids = kids; // first tap picks the whole group, the next picks the single part
    }
    if (additive) { const s = new Set(this.sel), on = !ids.every(id => s.has(id)); ids.forEach(id => (on ? s.add(id) : s.delete(id))); this.select([...s]); }
    else this.select(ids);
    Sfx.play('click');
  },
  // A row in the Explorer: a group row picks all its parts.
  listSelect(id, additive) {
    const p = this.byId(id); if (!p) return;
    const ids = p.shape === 'group' ? this.kids(id) : [id];
    if (additive) { const s = new Set(this.sel), on = !ids.every(x => s.has(x)); ids.forEach(x => (on ? s.add(x) : s.delete(x))); this.select([...s]); }
    else this.select(ids);
  },
  selCenter() {
    const c = new THREE.Vector3(), ps = this.selParts(); if (!ps.length) return c;
    for (const p of ps) c.x += p.pos[0], c.y += p.pos[1], c.z += p.pos[2];
    return c.multiplyScalar(1 / ps.length);
  },
  focusSel() {
    const ps = this.selParts(); if (!ps.length) return;
    const c = this.selCenter(); let r = 2;
    for (const p of ps) r = Math.max(r, Math.hypot(p.pos[0] - c.x, p.pos[1] - c.y, p.pos[2] - c.z) + Math.max(...p.size) / 2);
    this.focus.copy(c); this.dist = clamp(r * 2.6, 6, 260);
  },
  // The selection bar's label: the group's name, the part's name, or "3 parts".
  selLabel() {
    const ps = this.doc ? this.selParts() : []; if (!ps.length) return '';
    const g = this.selGroup();
    return g ? g.name : ps.length === 1 ? ps[0].name : `${ps.length} parts`;
  },

  // ---- tools, snapping, drawers ----
  setTool(t) {
    if (!STUDIO_TOOLS.some(x => x[0] === t)) return;
    this.tool = t; studioStore.set({ tool: t, hint: toolHint(t, this.snapOn) });
  },
  cycleSnap() {
    const i = SNAPS.indexOf(this.snapOn ? this.snapStep : 0), next = SNAPS[(i + 1) % SNAPS.length];
    this.snapOn = next > 0; if (next > 0) this.snapStep = next;
    studioStore.set({ snapOn: this.snapOn, snapStep: this.snapStep, hint: toolHint(this.tool, this.snapOn) });
    toast(this.snapOn ? `Snap: ${this.snapStep} stud${this.snapStep === 1 ? '' : 's'}` : 'Snap off');
  },
  snapV(v) { return this.snapOn ? r3(Math.round(v / this.snapStep) * this.snapStep) : r3(v); },
  // Phones: the Insert panel and the Explorer/Properties panel slide in as drawers.
  toggleDrawer(id, pane) {
    const s = studioStore.get(), open = s.drawer !== id || (!!pane && pane !== s.pane);
    studioStore.set({ drawer: open ? id : null, pane: open ? pane || null : null, drawerSeq: s.drawerSeq + 1 });
  },
  closeDrawers() { if (studioStore.get().drawer) studioStore.set({ drawer: null, pane: null }); },

  // ---- insert ----
  dropPoint() {
    this.ray.setFromCamera({ x: 0, y: 0 }, this.cam);
    const hits = this.ray.intersectObjects([...World.meshes.values()].filter(m => m.visible), false);
    const at = new THREE.Vector3();
    if (hits.length && hits[0].distance < 400) {
      at.copy(hits[0].point);
      if (hits[0].face) { const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld); if (n.y < 0.5) at.addScaledVector(n, 2.5); }
    } else if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), at) || at.distanceTo(this.cam.position) > 400) at.copy(this.focus);
    this.snapXZ(at); at.y = r3(at.y); return at;
  },
  snapXZ(at) { const s = this.snapOn ? Math.max(1, this.snapStep) : 0; if (s) { at.x = Math.round(at.x / s) * s; at.z = Math.round(at.z / s) * s; } return at; },
  // New parts never land where players start: if they would cover a Spawn, they slide away from the camera until
  // they are clear of it (true when they moved).
  clearOfSpawn(at, raws) {
    const spawns = this.doc.parts.filter(p => p.shape === 'spawn'); if (!spawns.length) return false;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [, pos, size, , , x = {}] of raws) {
      const turned = Array.isArray(x.rot) && x.rot.some(Boolean), h = size.map(v => v / 2), r = turned ? Math.max(...h) : 0;
      for (let k = 0; k < 3; k++) { const e = turned ? r : h[k]; lo[k] = Math.min(lo[k], pos[k] - e); hi[k] = Math.max(hi[k], pos[k] + e); }
    }
    const zones = spawns.map(s => ({ x0: s.pos[0] - s.size[0] / 2 - 0.5, x1: s.pos[0] + s.size[0] / 2 + 0.5, z0: s.pos[2] - s.size[2] / 2 - 0.5, z1: s.pos[2] + s.size[2] / 2 + 0.5, y0: s.pos[1] - s.size[1] / 2 - 0.5, y1: s.pos[1] + s.size[1] / 2 + 3.5 }));
    const hit = p => zones.some(z => p.x + hi[0] > z.x0 && p.x + lo[0] < z.x1 && p.z + hi[2] > z.z0 && p.z + lo[2] < z.z1 && p.y + hi[1] > z.y0 && p.y + lo[1] < z.y1);
    if (!hit(at)) return false;
    const dir = new THREE.Vector3(this.focus.x - this.cam.position.x, 0, this.focus.z - this.cam.position.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize();
    const step = this.snapOn ? Math.max(1, this.snapStep) : 1, start = at.clone();
    for (let i = 1; i <= 80; i++) {
      at.copy(start).addScaledVector(dir, step * i); this.snapXZ(at);
      if (!hit(at)) return true;
    }
    at.copy(start); return false;
  },
  insert(it) {
    if (!this.doc || this.testing) return;
    const at = this.dropPoint();
    let raws = it.make(at);
    if (this.partCount() + raws.length > GAME_LIMITS.parts) { toast(`Games can have up to ${GAME_LIMITS.parts} parts.`, true); return; }
    if (this.clearOfSpawn(at, raws)) {
      raws = it.make(at);
      if (!this.placedNote) { this.placedNote = true; toast('Placed beside the Spawn, so players don’t start inside it.'); }
    }
    const isSpawn = raws.length === 1 && raws[0][0] === 'spawn';
    const firstSpawn = isSpawn ? this.doc.parts.findIndex(p => p.shape === 'spawn') : -1;
    const ids = [];
    this.edit('Insert ' + it.label, [], () => {
      let gid = null;
      if (raws.length > 1) { gid = this.newId('g'); this.addRaw({ id: gid, name: it.label, shape: 'group' }); ids.push(gid); }
      for (const [shape, pos, size, color, material = 'plastic', x = {}] of raws) {
        const p = normPart(mkPart(shape, [r3(at.x + pos[0]), r3(at.y + pos[1]), r3(at.z + pos[2])], size.slice(), color, material, Object.assign({ name: it.label }, JSON.parse(JSON.stringify(x)))));
        p.id = this.newId('p'); if (gid) p.parent = gid;
        // A new Spawn goes before the old ones in the list: players start on the first Spawn.
        this.addRaw(p, firstSpawn >= 0 ? firstSpawn : undefined); ids.push(p.id);
      }
      return ids;
    });
    this.select(ids);
    if (this.tool === 'select') this.setTool('move');
    if (isPhone()) this.closeDrawers();
    if (firstSpawn >= 0) toast('Players now start on this Spawn.');
    Sfx.play('pick');
  },

  // ---- editing commands ----
  duplicate() {
    const ps = this.selParts(); if (!ps.length) return;
    if (this.partCount() + ps.length > GAME_LIMITS.parts) { toast(`Games can have up to ${GAME_LIMITS.parts} parts.`, true); return; }
    const out = [], off = Math.max(2, this.snapOn ? this.snapStep * 2 : 2), whole = g => this.kids(g).every(id => this.sel.has(id));
    this.edit('Duplicate', [], () => {
      const gmap = new Map();
      for (const p of ps) {
        const q = this.copyOf(p); q.id = this.newId('p'); q.pos = [r3(p.pos[0] + off), p.pos[1], p.pos[2]];
        if (p.parent && whole(p.parent)) {
          if (!gmap.has(p.parent)) { const g = this.byId(p.parent), ng = { id: this.newId('g'), name: g ? g.name : 'Group', shape: 'group' }; this.addRaw(ng); out.push(ng.id); gmap.set(p.parent, ng.id); }
          q.parent = gmap.get(p.parent);
        }
        this.addRaw(q); out.push(q.id);
      }
      return out;
    });
    this.select(out); Sfx.play('pick');
  },
  remove() {
    const ps = this.selParts(); if (!ps.length) return;
    const ids = ps.map(p => p.id), groups = [...new Set(ps.map(p => p.parent).filter(Boolean))].filter(g => this.kids(g).every(id => this.sel.has(id)));
    this.edit('Delete', [...ids, ...groups], () => { for (const id of [...ids, ...groups]) this.removeRaw(id); });
    this.select([]); Sfx.play('break');
  },
  group() {
    const ps = this.selParts(); if (ps.length < 2) return;
    const ids = ps.map(p => p.id), emptied = [...new Set(ps.map(p => p.parent).filter(Boolean))].filter(g => this.kids(g).every(id => this.sel.has(id)));
    this.edit('Group', [...ids, ...emptied], () => {
      const gid = this.newId('g'); this.addRaw({ id: gid, name: 'Group', shape: 'group' });
      for (const p of ps) p.parent = gid;
      for (const g of emptied) this.removeRaw(g);
      return [gid];
    });
    this.selChanged(); toast(IS_TOUCH ? 'Grouped. Tap the group once to pick it all, twice for one part.' : 'Grouped. Click the group once to pick it all, twice for one part.');
  },
  ungroup() {
    const ps = this.selParts().filter(p => p.parent); if (!ps.length) return;
    const ids = ps.map(p => p.id), emptied = [...new Set(ps.map(p => p.parent))].filter(g => this.kids(g).every(id => this.sel.has(id)));
    this.edit('Ungroup', [...ids, ...emptied], () => { for (const p of ps) delete p.parent; for (const g of emptied) this.removeRaw(g); });
    this.selChanged();
  },
  quickTurn() { // R turns the selection 90° around its center
    const ps = this.selParts(); if (!ps.length) return;
    const c = this.selCenter(), q = new THREE.Quaternion().setFromAxisAngle(AXES.y, Math.PI / 2);
    this.edit('Turn', ps.map(p => p.id), () => { for (const p of ps) { this.rotatePart(p, { pos: p.pos.slice(), rot: p.rot.slice() }, q, c); World.refreshPart(p); } });
  },
  partQuat(p) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG, 'YXZ')); },
  rotatePart(p, o, q, c) {
    const v = new THREE.Vector3(o.pos[0] - c.x, o.pos[1] - c.y, o.pos[2] - c.z).applyQuaternion(q).add(c);
    p.pos = [r3(v.x), r3(v.y), r3(v.z)];
    const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(this.partQuat({ rot: o.rot })), 'YXZ');
    p.rot = [e.x, e.y, e.z].map(a => Math.round(a / DEG * 100) / 100);
  },
  syncMesh(p) {
    const m = World.mesh(p.id); if (!m) return;
    m.position.set(p.pos[0], p.pos[1], p.pos[2]); m.rotation.set(p.rot[0] * DEG, p.rot[1] * DEG, p.rot[2] * DEG, 'YXZ'); m.updateMatrix();
  },

  // ---- Properties (the React panel calls these with the ids it was showing) ----
  // fn(part) changes one part. ids: the parts the panel showed when the field was edited, so a value typed for
  // one part never lands on a part selected since. Defaults to the selection.
  editProps(label, fn, ids) {
    if (!this.doc) return;
    const ps = (ids || [...this.sel]).map(id => this.byId(id)).filter(p => p && p.shape !== 'group'); if (!ps.length) return;
    this.edit(label, ps.map(p => p.id), () => { for (const p of ps) { fn(p); World.refreshPart(p); } });
  },
  renameGroup(gid, name) {
    const g = this.byId(gid); if (!g || g.shape !== 'group') return;
    const v = WordFilter.clean(String(name || '').trim()).slice(0, 40) || 'Group'; if (v === g.name) return;
    this.edit('Rename group', [g.id], () => { g.name = v; });
  },
  setBehavior(p, b) {
    const prev = p.behavior;
    if (b === 'none') { delete p.behavior; delete p.bp; }
    else {
      p.behavior = b; const bp = {};
      for (const prm of (BEHAVIOR_INFO[b] || {}).params || []) bp[prm.k] = Array.isArray(prm.def) ? prm.def.slice() : prm.def;
      if (b === 'teleport') bp.to = [r3(p.pos[0]), r3(p.pos[1] + 4), r3(p.pos[2] - 16)];
      if (b === 'coin') p.canCollide = false;
      p.bp = bp;
    }
    if (prev === 'coin' && b !== 'coin') delete p.canCollide; // coins are walk-through; other behaviors are solid again
  },
  // One behavior parameter; for a vector parameter, axis k (0..2) of it, read from the part when the edit applies.
  setParam(ids, prm, v, k) {
    this.editProps(prm.label, q => {
      let nv;
      if (prm.vec) { nv = finite3(q.bp && q.bp[prm.k], prm.def); nv[k] = r3(clamp(v, -5000, 5000)); }
      else if (prm.opts) nv = prm.opts.includes(v) ? v : prm.def;
      else nv = r3(clamp(v, prm.min, prm.max));
      q.bp = Object.assign({}, q.bp || {}, { [prm.k]: nv });
    }, ids);
  },

  // ---- pointer input ----
  setRay(e) {
    const r = this.view.getBoundingClientRect();
    this.ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, this.cam);
  },
  // The part under the pointer. A locked part (the Baseplate) is never picked: a tap on it selects nothing.
  pickPart(e) {
    this.setRay(e);
    const hits = this.ray.intersectObjects([...World.meshes.values()].filter(m => m.visible), false);
    if (!hits.length) return null;
    const part = hits[0].object.userData.part;
    return part && !part.locked ? { part, point: hits[0].point.clone() } : null;
  },
  pickGizmo(e) {
    if (!this.sel.size || this.tool === 'select' || !this.giz.root.visible) return null;
    this.setRay(e); this.gscene.updateMatrixWorld(true);
    const hits = this.ray.intersectObjects(this.giz.hits[this.tool], false);
    return hits.length ? hits[0].object.userData : null;
  },
  onDown(e) {
    if (!this.doc || !this.view || this.testing) return;
    // A Properties field being typed in commits now, for the part it was showing, before the tap selects another.
    const a = document.activeElement;
    if (a && a !== document.body && isTyping({ target: a })) a.blur();
    // With a drawer open, a tap on the 3D view only closes the drawer.
    if (studioStore.get().drawer) { e.preventDefault(); this.closeDrawers(); return; }
    try { this.view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.ptrs.size === 2) {
      if (this.pend) this.endEdit(this.drag && this.drag.label);
      this.drag = Object.assign({ kind: 'pinch' }, this.pinchInfo()); return;
    }
    if (this.ptrs.size > 2) { if (this.drag && this.drag.kind === 'pinch') Object.assign(this.drag, this.pinchInfo()); return; }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (e.button === 1 || e.button === 2) { this.drag = { kind: 'pan' }; return; }
    const h = this.pickGizmo(e);
    if (h) { this.startHandle(h, e); return; }
    const hit = this.pickPart(e);
    // Only the Move tool drags parts across the ground; with Select a drag always looks around.
    if (hit && this.sel.has(hit.part.id) && this.tool === 'move' && !additive) { this.drag = { kind: 'pending-move', hit }; return; }
    this.drag = { kind: 'pending', hit, additive };
  },
  onMove(e) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    const d = this.drag; if (!d) return;
    if (d.kind === 'pinch') { this.pinchMove(); return; }
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > (e.pointerType === 'mouse' ? 4 : 9);
    if (d.kind === 'pending') { if (!moved) return; d.kind = 'orbit'; }
    if (d.kind === 'pending-move') { if (!moved) return; this.startFreeMove(d.hit, e); return; }
    if (d.kind === 'orbit') { this.yaw -= dx * 0.0065; this.pitch = clamp(this.pitch + dy * 0.005, 0.04, 1.53); }
    else if (d.kind === 'pan') this.pan(dx, dy);
    else if (d.kind === 'free') this.freeMove(e);
    else if (d.kind === 'handle') this.handleMove(e);
  },
  onUp(e, cancel) {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    const d = this.drag; if (!d) return;
    if (d.kind === 'pinch') {
      if (this.ptrs.size >= 2) Object.assign(d, this.pinchInfo()); // a third finger lifted: new baseline, no jump
      else if (this.ptrs.size === 1) { const q = [...this.ptrs.values()][0]; q.sx = q.x; q.sy = q.y; this.drag = { kind: 'orbit' }; } // the finger left keeps looking around
      else this.drag = null;
      return;
    }
    if (this.ptrs.size) return;
    if ((d.kind === 'pending' || d.kind === 'pending-move') && !cancel) this.clickSelect(d.hit && d.hit.part, d.additive);
    if (d.kind === 'free' || d.kind === 'handle') {
      if (cancel) { this.cancelDrag(); return; } // the system took the pointer: put the parts back
      this.endEdit(d.label);
    }
    this.drag = null;
  },
  pan(dx, dy) {
    const k = this.dist * 0.0017, rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.focus.x += (-rx * dx + fx * dy) * k; this.focus.z += (-rz * dx + fz * dy) * k;
  },
  pinchInfo() { const p = [...this.ptrs.values()]; return { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 }; },
  pinchMove() {
    if (this.ptrs.size < 2) return;
    const n = this.pinchInfo(), d = this.drag;
    if (d.d > 0 && n.d > 0) this.dist = clamp(this.dist * d.d / n.d, 3, 420);
    this.pan(n.mx - d.mx, n.my - d.my); Object.assign(d, n);
  },
  startFreeMove(hit, e) {
    const ps = this.selParts(); this.beginEdit(ps.map(p => p.id));
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y), start = new THREE.Vector3();
    this.setRay(e);
    this.drag = { kind: 'free', label: 'Move', plane, start: this.ray.ray.intersectPlane(plane, start) ? start : null, orig: new Map(ps.map(p => [p.id, p.pos.slice()])) };
  },
  freeMove(e) {
    const d = this.drag; if (!d.start) return;
    this.setRay(e); const q = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(d.plane, q)) return;
    if (q.distanceTo(d.start) > 300) return; // nearly edge-on to the ground
    const dx = this.snapV(q.x - d.start.x), dz = this.snapV(q.z - d.start.z);
    for (const [id, o] of d.orig) { const p = this.byId(id); if (!p) continue; p.pos = [r3(o[0] + dx), o[1], r3(o[2] + dz)]; this.syncMesh(p); }
  },
  startHandle(h, e) {
    const ps = this.selParts();
    if (h.kind === 'scale' && ps.length !== 1) { toast('Resize one part at a time. Pick a single part first.'); return; }
    const center = this.selCenter();
    const d = { kind: 'handle', h, center, label: { move: 'Move', rotate: 'Rotate', scale: 'Resize' }[h.kind], orig: new Map(ps.map(p => [p.id, { pos: p.pos.slice(), rot: p.rot.slice(), size: p.size.slice() }])) };
    d.axis = AXES[h.axis].clone();
    if (h.kind === 'scale') d.axis.applyQuaternion(this.partQuat(ps[0]));
    if (h.kind === 'rotate') {
      d.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(d.axis, center);
      d.u = new THREE.Vector3().crossVectors(d.axis, Math.abs(d.axis.y) < 0.9 ? AXES.y : AXES.x).normalize(); d.v = new THREE.Vector3().crossVectors(d.axis, d.u);
      d.acc = 0;
    }
    this.setRay(e); const t = this.handleParam(d); if (t === null) return;
    d.t0 = d.last = t; this.beginEdit(ps.map(p => p.id)); this.drag = d;
  },
  handleParam(d) {
    const r = this.ray.ray;
    if (d.h.kind === 'rotate') { const q = new THREE.Vector3(); if (!r.intersectPlane(d.plane, q)) return null; q.sub(d.center); return Math.atan2(q.dot(d.v), q.dot(d.u)); }
    // closest point on the handle's axis line to the pointer ray
    const w0 = d.center.clone().sub(r.origin), b = d.axis.dot(r.direction), dd = d.axis.dot(w0), ee = r.direction.dot(w0), den = 1 - b * b;
    if (den < 1e-3) return null;
    return (b * ee - dd) / den;
  },
  handleMove(e) {
    const d = this.drag; this.setRay(e); const t = this.handleParam(d); if (t === null) return;
    if (d.h.kind === 'move') {
      const delta = this.snapV(t - d.t0);
      if (Math.abs(delta) > 2000) return;
      for (const [id, o] of d.orig) { const p = this.byId(id); if (!p) continue; p.pos = o.pos.map((v, i) => r3(v + d.axis.getComponent(i) * delta)); this.syncMesh(p); }
    } else if (d.h.kind === 'scale') {
      const [id, o] = [...d.orig][0], p = this.byId(id), i = 'xyz'.indexOf(d.h.axis), s = d.h.sign; if (!p) return;
      // Snapping steps the change from the current size (as Move steps the offset), so a 0.4 thick pad stays 0.4
      // until it is dragged a whole step.
      let ds = (t - d.t0) * s;
      if (this.snapOn) ds = Math.round(ds / this.snapStep) * this.snapStep;
      let ns = Math.max(this.snapOn ? Math.min(this.snapStep, o.size[i]) : 0.1, o.size[i] + ds);
      ns = Math.min(2048, r3(ns)); const grow = ns - o.size[i];
      if (p.size[i] === ns) return;
      p.size = o.size.slice(); p.size[i] = ns;
      p.pos = o.pos.map((v, j) => r3(v + d.axis.getComponent(j) * s * grow / 2));
      World.refreshPart(p);
    } else {
      let da = t - d.last; da = Math.atan2(Math.sin(da), Math.cos(da)); d.acc += da; d.last = t;
      let deg = d.acc / DEG; if (this.snapOn) deg = Math.round(deg / 15) * 15;
      const q = new THREE.Quaternion().setFromAxisAngle(d.axis, deg * DEG);
      for (const [id, o] of d.orig) { const p = this.byId(id); if (!p) continue; this.rotatePart(p, o, q, d.center); this.syncMesh(p); }
    }
  },

  // ---- gizmos and outlines ----
  buildGizmo() {
    const gs = this.gscene = new THREE.Scene();
    const mat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: 0.96, fog: false });
    const ghost = new THREE.MeshBasicMaterial({ visible: false });
    const COL = { x: '#E8474E', y: '#3FBE62', z: '#3D74F5' };
    const along = (o, ax) => { if (ax === 'x') o.rotation.z = -Math.PI / 2; else if (ax === 'z') o.rotation.x = Math.PI / 2; };
    const ring = (o, ax) => { if (ax === 'x') o.rotation.y = Math.PI / 2; else if (ax === 'y') o.rotation.x = Math.PI / 2; };
    const root = new THREE.Group(), G = { root, move: new THREE.Group(), rotate: new THREE.Group(), scale: new THREE.Group(), hits: { move: [], rotate: [], scale: [] } };
    root.add(G.move, G.rotate, G.scale); gs.add(root); root.renderOrder = 10;
    const shaft = new THREE.CylinderGeometry(0.04, 0.04, 1.45, 8), tip = new THREE.ConeGeometry(0.14, 0.4, 16), fat = new THREE.CylinderGeometry(0.26, 0.26, 2.1, 6);
    const thin = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), cube = new THREE.BoxGeometry(0.3, 0.3, 0.3), cubeHit = new THREE.BoxGeometry(0.62, 0.62, 0.62);
    for (const ax of ['x', 'y', 'z']) {
      const g = new THREE.Group(); along(g, ax);
      const s = new THREE.Mesh(shaft, mat(COL[ax])); s.position.y = 0.88;
      const c = new THREE.Mesh(tip, mat(COL[ax])); c.position.y = 1.78;
      const h = new THREE.Mesh(fat, ghost); h.position.y = 1.1; h.userData = { kind: 'move', axis: ax };
      g.add(s, c, h); G.move.add(g); G.hits.move.push(h);
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.035, 6, 72), mat(COL[ax])), rh = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.2, 6, 36), ghost);
      ring(r, ax); ring(rh, ax); rh.userData = { kind: 'rotate', axis: ax }; G.rotate.add(r, rh); G.hits.rotate.push(rh);
      for (const sg of [1, -1]) {
        const b = new THREE.Mesh(cube, mat(COL[ax])), bh = new THREE.Mesh(cubeHit, ghost), l = new THREE.Mesh(thin, mat(COL[ax]));
        b.position.copy(AXES[ax]).multiplyScalar(sg * 1.6); bh.position.copy(b.position); bh.userData = { kind: 'scale', axis: ax, sign: sg };
        along(l, ax); l.position.copy(AXES[ax]).multiplyScalar(sg * 0.85);
        G.scale.add(l, b, bh); G.hits.scale.push(bh);
      }
    }
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat('#FFFFFF')); root.add(dot);
    this.giz = G;
    this.outGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outMat = new THREE.LineBasicMaterial({ color: '#FFC53A', depthTest: false, transparent: true, opacity: 0.95, fog: false });
  },
  syncOutlines() {
    for (const [id, o] of this.outlines) if (!this.sel.has(id)) { this.gscene.remove(o); this.outlines.delete(id); }
    for (const id of this.sel) if (!this.outlines.has(id)) { const o = new THREE.LineSegments(this.outGeo, this.outMat); this.outlines.set(id, o); this.gscene.add(o); }
  },
  dropOutline(id) { const o = this.outlines.get(id); if (o) { this.gscene.remove(o); this.outlines.delete(id); } },
  updateOverlay() {
    for (const [id, o] of this.outlines) {
      const p = this.byId(id), m = p && World.mesh(id); if (!m) { o.visible = false; continue; }
      o.visible = true; o.position.copy(m.position); o.quaternion.copy(m.quaternion);
      o.scale.set(p.size[0] + 0.08, p.size[1] + 0.08, p.size[2] + 0.08);
    }
    const G = this.giz, show = this.sel.size > 0 && this.tool !== 'select';
    G.root.visible = show; if (!show) return;
    const c = this.selCenter(); G.root.position.copy(c);
    G.root.scale.setScalar(Math.max(0.2, this.cam.position.distanceTo(c) * 0.08));
    G.move.visible = this.tool === 'move'; G.rotate.visible = this.tool === 'rotate'; G.scale.visible = this.tool === 'scale';
    if (this.tool === 'scale' && this.sel.size === 1) G.scale.quaternion.copy(this.partQuat(this.selParts()[0])); else G.scale.quaternion.identity();
  },

  // ---- per frame ----
  frame(dt) {
    if (!World.scene || !this.doc || this.testing) return;
    const K = this.keys, kx = (K.has('d') || K.has('arrowright') ? 1 : 0) - (K.has('a') || K.has('arrowleft') ? 1 : 0);
    const kz = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0), ky = (K.has('e') ? 1 : 0) - (K.has('q') ? 1 : 0);
    if (kx || kz || ky) {
      const sp = Math.max(10, this.dist * 0.9) * dt, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      this.focus.x += (-sy * kz + cy * kx) * sp; this.focus.z += (-cy * kz - sy * kx) * sp; this.focus.y = clamp(this.focus.y + ky * sp, -200, 600);
    }
    const cp = Math.cos(this.pitch);
    this.cam.position.set(this.focus.x + Math.sin(this.yaw) * cp * this.dist, this.focus.y + Math.sin(this.pitch) * this.dist, this.focus.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.focus);
    this.updateOverlay();
    World.update(dt, this.focus, this.cam);
    const r = Engine.renderer;
    r.render(World.scene, this.cam);
    r.autoClear = false; r.clearDepth(); r.render(this.gscene, this.cam); r.autoClear = true;
  },

  // ---- Explorer rows ----
  // [{p, kind: 'grp' | 'kid' | '', n (parts in a group)}], at most MAX_ROWS, cached per parts version.
  rows() {
    if (!this.doc) return NONE;
    if (this._rows && this._rowsRev === this.rev) return this._rows;
    const kidsOf = new Map(), out = []; let more = false;
    for (const p of this.doc.parts) if (p.shape !== 'group' && p.parent && this.index.has(p.parent)) { if (!kidsOf.has(p.parent)) kidsOf.set(p.parent, []); kidsOf.get(p.parent).push(p); }
    for (const p of this.doc.parts) {
      if (out.length >= MAX_ROWS) { more = true; break; }
      if (p.shape === 'group') {
        const ks = kidsOf.get(p.id) || []; out.push({ p, kind: 'grp', n: ks.length });
        for (const k of ks) { if (out.length >= MAX_ROWS) { more = true; break; } out.push({ p: k, kind: 'kid' }); }
      } else if (!p.parent || !this.index.has(p.parent)) out.push({ p, kind: '' });
    }
    out.more = more; out.max = MAX_ROWS;
    this._rows = out; this._rowsRev = this.rev;
    return out;
  },

  // ---- game settings ----
  setDesc(v) { if (!this.doc) return; this.doc.desc = WordFilter.clean(String(v || '').trim()).slice(0, GAME_LIMITS.desc); this.metaChanged(); },
  setSky(k) {
    if (!this.doc || !ENV[k]) return;
    this.doc.env = { sky: k };
    const env = Object.assign({}, ENV.day, ENV[k]);
    if (World.scene && !this.testing) { World.setEnv(env); World.env = env; }
    this.metaChanged();
  },
  gravity() { return this.doc ? Number(this.doc.env.gravity) || (ENV[this.doc.env.sky] || {}).gravity || 1 : 1; },
  setGravity(g) {
    if (!this.doc) return; g = clamp(Number(g) || 1, 0.2, 1.6);
    const base = (ENV[this.doc.env.sky] || {}).gravity || 1;
    if (Math.abs(g - base) < 0.001) delete this.doc.env.gravity; else this.doc.env.gravity = Math.round(g * 100) / 100;
    this.metaChanged();
  },
  setRules(m) { if (!this.doc || !(STUDIO_MODES[m] || Modes[m])) return; this.doc.mode = m; this.metaChanged(); },
  // [[mode, label]] for the Rules menu: Studio's own rule sets, plus the copied game's when it is a remix.
  rulesOptions() {
    const d = this.doc, out = Object.entries(STUDIO_MODES).map(([k, v]) => [k, v[0]]);
    if (d && !STUDIO_MODES[d.mode] && Modes[d.mode]) out.push([d.mode, `${Modes[d.mode].label || d.mode} (from the original)`]);
    return out;
  },
  rulesHelp(m) {
    const info = STUDIO_MODES[m];
    return info ? info[1] : `Rules from the game you copied (${(Modes[m] && Modes[m].label) || m}). Its special parts keep working while their tags stay the same.`;
  },
  setTimeLimit(v) {
    if (!this.doc) return; const n = Math.round(clamp(parseFloat(v) || 0, 0, 3600));
    if (n) this.doc.modeOpts.timeLimit = n; else delete this.doc.modeOpts.timeLimit;
    this.metaChanged();
  },
  setKillY(v) {
    if (!this.doc) return; const raw = typeof v === 'string' ? (v.trim() ? parseFloat(v) : NaN) : Number(v);
    if (Number.isFinite(raw)) this.doc.killY = Math.round(clamp(raw, -500, 100)); else delete this.doc.killY;
    this.metaChanged();
  },
  async download() {
    const dl = Caps.downloads; if (!dl || !this.doc) return;
    const d = this.doc, file = { v: 1, kind: 'playforge-game', title: d.title, desc: d.desc || '', mode: d.mode, modeOpts: d.modeOpts, env: d.env, killY: d.killY, spawnYaw: d.spawnYaw, parts: Library.compact(d.parts) };
    const name = (d.title || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
    try { await dl.save({ filename: `${name}.playforge.json`, data: new Blob([JSON.stringify(file)], { type: 'application/json' }) }); toast('Game file downloaded'); }
    catch (err) { const code = err && err.code; if (code === 'declined') return; toast('Downloads are not available here.', true); }
  },
  // Deletes the draft (and unpublishes it when it was published). True when it was deleted.
  async deleteGame() {
    if (!this.doc) return false; const d = this.doc;
    if (d.publishedAt && Library.canPublish()) {
      try { await Library.unpublish(d.id); } catch (e) { toast("Couldn't unpublish it. It was still deleted from this device.", true); }
    }
    if (this.doc !== d) return false;
    this.cancelDrag(); clearTimeout(this.saveTimer);
    if (!this.testing) World.unload();
    this.grid = null; this.doc = null; this.sel = new Set(); this.index = new Map(); this.undoStack = []; this.redoStack = [];
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear();
    Library.deleteDraft(d.id);
    if (Engine.mode === 'studio') Engine.setMode('home');
    studioStore.set({ open: false, id: '', sel: NONE, drawer: null, testing: false });
    toast('Game deleted');
    return true;
  },
  async unpublish() {
    if (!this.doc || !this.doc.publishedAt) return false;
    const d = this.doc;
    try { await Library.unpublish(d.id); } catch (e) { toast("Couldn't unpublish it right now. Try again in a moment.", true); return false; }
    if (this.doc === d) { delete d.publishedAt; this.save(true); this.metaChanged(); }
    toast('Unpublished. Only you can see it now.');
    return true;
  },

  // ---- test and publish ----
  // Hands back the definition the game screen plays (GameScreen with test: true). Studio clears its world; resume()
  // brings the editor back with the same camera when the test ends.
  test() {
    if (!this.doc || this.testing) return null;
    this.cancelDrag(); this.save(true);
    if (!this.doc.parts.some(p => p.shape === 'spawn')) toast('Tip: insert a Spawn so players start in the right place.');
    const def = Library.toDef(this.doc, Profile.displayName());
    this.closeDrawers(); this.keys.clear();
    World.unload(); this.grid = null;
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear();
    this.testing = true; studioStore.set({ testing: true });
    return def;
  },
  resume() {
    if (!this.doc || !this.testing) return;
    this.testing = false; this.show();
  },
  // Asks first, then publishes (or updates) the game. Resolves to {id, again} when it went live, else null.
  async publish() {
    if (!this.doc || this.testing || studioStore.get().publishing) return null;
    if (!Library.canPublish()) { toast(Caps.online ? 'Publishing is not available right now.' : 'Publishing needs the PlayForge server, which is not reachable right now.', true); return null; }
    const d = this.doc, again = !!d.publishedAt;
    const ok = await askChoice({
      title: again ? 'Update your game?' : 'Publish your game?',
      body: again ? `Everyone will get the latest version of ${d.title}.` : `${d.title} will show up for everyone on the PlayForge home screen under New, and anyone with its link can play it. You can unpublish it any time.`,
      buttons: [{ label: 'Not yet', value: false }, { label: again ? 'Update' : 'Publish', value: true, kind: 'ember' }],
    });
    if (ok !== true || this.doc !== d) return null;
    this.cancelDrag();
    if (World.scene && !this.testing) d.thumb = this.thumb();
    this.save(true);
    studioStore.set({ publishing: true });
    try {
      await Library.publish(d, d.thumb);
      Sfx.play('win');
      if (this.doc === d) { this.save(true); this.metaChanged(); }
      return { id: d.id, again, title: d.title };
    } catch (e) {
      const m = e && e.message;
      toast(m === 'limit' ? `You can publish up to ${GAME_LIMITS.published} games. Unpublish one first.`
        : m === 'offline' ? "Can't reach PlayForge right now. Try again in a moment."
          : m === 'invalid' ? "PlayForge didn't accept this game. Check its name and description, then try again."
            : m === 'forbidden' ? 'This game belongs to another player, so it can’t be published from here.'
              : m === 'rate_limited' ? 'That was a lot of publishing. Wait a moment, then try again.'
                : m === 'signin' ? 'Publishing is not available right now.' : "Couldn't publish right now. Try again in a moment.", true);
      return null;
    } finally { studioStore.set({ publishing: false }); }
  },
};
