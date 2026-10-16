/* ---------- 16. Studio: make your own games ---------- */
// The game being edited is a draft doc (see Library). doc.parts holds every part plus group nodes
// ({id, name, shape: 'group'}); a part joins a group through part.parent. Studio adds the doc's own part
// objects to the world, so editing a part and refreshing its mesh is enough to keep both in step.
const ST_COLORS = ['#FF6A2B', '#FFC53A', '#7CFF6B', '#3FA34D', '#17A39C', '#4CF0FF', '#2D62F0', '#7A4FD0', '#E23E62', '#FF5CA8', '#8A5A35', '#C08A55', '#EDEFF2', '#9AA5B1', '#4E5B74', '#17223A'];
const ST_MATERIALS = ['plastic', 'wood', 'stone', 'brick', 'metal', 'grass', 'sand', 'ice', 'neon'];
const BEHAVIOR_INFO = {
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
const STUDIO_MODES = {
  custom: ['Finish line and coins', 'Players head for a Finish part. Coins add to the score, and a time limit can end the round.'],
  free: ['Hang out', 'No goal. Players explore and play together.'],
};
// Insert catalogue. make(at) returns parts relative to the drop point (y = height above the surface):
// [shape, [x, y, z], size, color, material, extra]. Several parts become a group.
const ST_INSERT = {
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
const stEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const r3 = v => Math.round(v * 1000) / 1000;
const stIcon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const Studio = {
  doc: null, index: new Map(), sel: new Set(), tool: 'select', snapOn: true, snapStep: 1, undoStack: [], redoStack: [], pend: null,
  cam: null, focus: null, yaw: 0.8, pitch: 0.6, dist: 36, keys: new Set(), ptrs: new Map(), drag: null, cat: 'parts',
  gscene: null, giz: null, outlines: new Map(), ray: null, grid: null, saveTimer: 0, listQueued: false, el: {},
  SNAPS: [1, 2, 4, 0.5, 0.25, 0],

  init() {
    Engine.views.studio = this;
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.1, 1500); this.focus = new THREE.Vector3(); this.ray = new THREE.Raycaster();
    this.buildGizmo();
    const E = this.el = {
      view: $('#st-view'), title: $('#st-title'), status: $('#st-status'), list: $('#st-list'), props: $('#st-props'), insert: $('#st-insert'),
      count: $('#st-count'), selBar: $('#st-sel-bar'), selName: $('#st-sel-name'), hint: $('#st-hint'), left: $('#st-left'), right: $('#st-right'),
    };
    $('#st-back').addEventListener('click', () => this.leave());
    $('#st-undo').addEventListener('click', () => this.undo());
    $('#st-redo').addEventListener('click', () => this.redo());
    $('#st-test').addEventListener('click', () => this.test());
    $('#st-publish').addEventListener('click', () => this.publish());
    $('#st-game').addEventListener('click', () => this.openSettings());
    $('#st-snap').addEventListener('click', () => this.cycleSnap());
    for (const id of ['#st-dup', '#st-dup2']) $(id).addEventListener('click', () => this.duplicate());
    for (const id of ['#st-del', '#st-del2']) $(id).addEventListener('click', () => this.remove());
    $('#st-group').addEventListener('click', () => this.group());
    $('#st-ungroup').addEventListener('click', () => this.ungroup());
    $$('#studio .st-tools [data-tool]').forEach(b => b.addEventListener('click', () => this.setTool(b.dataset.tool)));
    $$('#st-left [data-cat]').forEach(b => b.addEventListener('click', () => { this.cat = b.dataset.cat; this.renderInsert(); }));
    $$('#studio [data-drawer]').forEach(b => b.addEventListener('click', () => this.toggleDrawer(b.dataset.drawer, b.dataset.pane)));
    $$('#studio [data-drawer-close]').forEach(b => b.addEventListener('click', () => this.closeDrawers()));
    E.title.addEventListener('change', () => this.setTitle(E.title.value));
    E.title.addEventListener('keydown', e => { if (e.key === 'Enter') E.title.blur(); });
    E.list.addEventListener('click', e => this.onListClick(e));
    E.list.addEventListener('dblclick', () => this.focusSel());
    const v = E.view;
    v.addEventListener('pointerdown', e => this.onDown(e));
    v.addEventListener('pointermove', e => this.onMove(e));
    v.addEventListener('pointerup', e => this.onUp(e));
    v.addEventListener('pointercancel', e => this.onUp(e, true));
    v.addEventListener('lostpointercapture', e => { if (this.ptrs.has(e.pointerId)) this.onUp(e, true); });
    v.addEventListener('wheel', e => { e.preventDefault(); this.dist = clamp(this.dist * Math.pow(1.0015, e.deltaY), 3, 420); }, { passive: false });
    v.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => { if (Engine.mode === 'studio' && !isTyping(e) && !e.ctrlKey && !e.metaKey && !Modals.top()) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    this.bindSettings();
    this.renderInsert();
  },
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); },
  isPhone() { return window.matchMedia('(max-width: 999px)').matches; },

  // ---- opening and leaving ----
  newGame() {
    const n = Library.drafts().length + 1, doc = Library.blank(n > 1 ? `My game ${n}` : 'My game');
    Library.saveDraft(doc); this.open(doc);
    toast('New game! Add parts from Insert, then press Test.');
  },
  remix(def) {
    if (!def) return;
    let doc;
    try { doc = Library.remix(def); } catch (e) { console.error(e); toast("This game can't be copied.", true); return; }
    if (doc.parts.length > GAME_LIMITS.parts) { doc.parts = doc.parts.slice(0, GAME_LIMITS.parts); toast(`Your copy keeps the first ${GAME_LIMITS.parts} parts.`); }
    if (!Library.saveDraft(doc)) return;
    this.open(doc); toast(`You're editing your own copy of ${def.title}.`);
  },
  open(doc) {
    if (!doc) return;
    if (this.doc && this.doc !== doc) this.save(true);
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
    this.sel = new Set(); this.undoStack = []; this.redoStack = []; this.pend = null; this.drag = null;
    this.el.title.value = doc.title || 'Untitled game';
    this.show(); this.frameStart();
  },
  show() {
    showScreen('studio'); Engine.setMode('studio'); Engine.attach(this.el.view);
    $('#st-publish').hidden = !Caps.db;
    this.loadWorld(); this.closeDrawers();
    this.renderList(); this.selChanged(); this.syncUndo(); this.setTool(this.tool);
    this.el.status.textContent = this.doc.publishedAt ? 'Published · saved on this device' : 'Saved on this device';
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
  frameStart() {
    const sp = this.doc.parts.find(p => p.shape === 'spawn');
    this.focus.set(sp ? sp.pos[0] : 0, sp ? sp.pos[1] : 0, sp ? sp.pos[2] : 0);
    this.yaw = 0.8; this.pitch = 0.6; this.dist = 36;
  },
  leave() {
    if (!this.doc) { showScreen('home'); Engine.setMode('home'); return; }
    this.cancelDrag();
    if (World.scene) this.doc.thumb = this.thumb();
    this.save(true);
    World.unload(); this.grid = null; this.doc = null; this.sel = new Set(); this.closeDrawers();
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear();
    showScreen('home'); Engine.setMode('home'); Sfx.play('click');
    if (Home.onReturn) Home.onReturn();
  },
  onEscape() {
    if (this.el.left.classList.contains('open') || this.el.right.classList.contains('open')) { this.closeDrawers(); return; }
    if (this.drag) { this.cancelDrag(); return; }
    if (this.sel.size) this.select([]);
  },
  onKey(e) {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
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
    if (k === 'r' && this.sel.size) { this.quickTurn(); }
  },

  // ---- saving ----
  setTitle(v) {
    if (!this.doc) return;
    const t = WordFilter.clean(String(v || '').trim().slice(0, GAME_LIMITS.title)) || 'Untitled game';
    this.doc.title = t; this.el.title.value = t; this.save(true);
  },
  changed() {
    this.syncUndo(); this.renderListSoon(); this.syncSelBar();
    this.el.status.textContent = 'Saving…'; clearTimeout(this.saveTimer); this.saveTimer = setTimeout(() => this.save(), 700);
  },
  save(now) {
    clearTimeout(this.saveTimer); if (!this.doc) return;
    const ok = Library.saveDraft(this.doc);
    if (this.el.status) this.el.status.textContent = ok ? (this.doc.publishedAt ? 'Published · saved on this device' : 'Saved on this device') : 'Not saved: this device is full';
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
  addRaw(p) { this.doc.parts.push(p); this.index.set(p.id, p); if (p.shape !== 'group') World.addPart(p); },
  removeRaw(id) {
    const i = this.doc.parts.findIndex(p => p.id === id); if (i >= 0) this.doc.parts.splice(i, 1);
    this.index.delete(id); World.removePart(id); this.sel.delete(id); this.dropOutline(id);
  },
  copyOf(p) { return p ? JSON.parse(JSON.stringify(p)) : null; },
  snap(ids) { const m = new Map(); for (const id of ids) m.set(id, this.copyOf(this.byId(id))); return m; },
  pushHist(label, before, after) {
    this.undoStack.push({ label, before, after }); if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack = []; this.syncUndo();
  },
  // One undoable step: ids are the parts fn changes or removes; fn returns the ids of parts it creates.
  edit(label, ids, fn) {
    const before = this.snap(ids), created = fn() || [];
    const all = [...new Set([...ids, ...created])];
    for (const id of created) if (!before.has(id)) before.set(id, null);
    this.pushHist(label, before, this.snap(all)); this.changed();
  },
  // Drags change parts live; the step is recorded when the drag ends.
  beginEdit(ids) { this.pend = { ids: [...ids], before: this.snap(ids) }; },
  endEdit(label = 'Edit') {
    const pe = this.pend; this.pend = null; if (!pe) return;
    const after = this.snap(pe.ids);
    if (JSON.stringify([...pe.before.values()]) === JSON.stringify([...after.values()])) return;
    for (const id of pe.ids) { const p = this.byId(id); if (p && p.shape !== 'group') World.refreshPart(p); }
    this.pushHist(label, pe.before, after); this.changed(); this.renderProps();
  },
  cancelDrag() {
    if (this.pend) { this.applyState(this.pend.before); this.pend = null; }
    this.drag = null; this.ptrs.clear();
  },
  applyState(map) {
    for (const [id, st] of map) {
      const cur = this.byId(id);
      if (!st) { if (cur) this.removeRaw(id); continue; }
      if (cur) { for (const k of Object.keys(cur)) delete cur[k]; Object.assign(cur, this.copyOf(st)); if (cur.shape !== 'group') World.refreshPart(cur); }
      else this.addRaw(this.copyOf(st));
    }
    for (const id of [...this.sel]) if (!this.byId(id)) this.sel.delete(id);
  },
  undo() {
    if (this.pend) return; const h = this.undoStack.pop(); if (!h) return;
    this.applyState(h.before); this.redoStack.push(h); this.afterHistory('Undid ' + h.label.toLowerCase());
  },
  redo() {
    if (this.pend) return; const h = this.redoStack.pop(); if (!h) return;
    this.applyState(h.after); this.undoStack.push(h); this.afterHistory('Redid ' + h.label.toLowerCase());
  },
  afterHistory(msg) { this.changed(); this.renderList(); this.selChanged(); Sfx.play('click'); this.el.hint.textContent = msg; },
  syncUndo() { $('#st-undo').disabled = !this.undoStack.length; $('#st-redo').disabled = !this.redoStack.length; },

  // ---- selection ----
  select(ids) { this.sel = new Set(ids.filter(id => { const p = this.byId(id); return p && p.shape !== 'group'; })); this.selChanged(); },
  selChanged() { this.syncOutlines(); this.renderProps(); this.markList(); this.syncSelBar(); },
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
  syncSelBar() {
    const ps = this.doc ? this.selParts() : [], g = ps.length ? this.selGroup() : null;
    this.el.selBar.hidden = !ps.length;
    this.el.selName.textContent = g ? g.name : ps.length === 1 ? ps[0].name : `${ps.length} parts`;
    const any = ps.length > 0;
    for (const id of ['#st-dup2', '#st-del2']) $(id).disabled = !any;
    $('#st-group').disabled = ps.length < 2 || !!g; $('#st-ungroup').disabled = !ps.some(p => p.parent);
  },

  // ---- tools, snapping, drawers ----
  setTool(t) {
    this.tool = t;
    $$('#studio .st-tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    this.el.hint.textContent = {
      select: 'Tap a part to select it · drag to look around · scroll or pinch to zoom',
      move: 'Drag an arrow, or drag a selected part across the ground',
      rotate: 'Drag a ring to turn the selection' + (this.snapOn ? ' in 15° steps' : ''),
      scale: 'Drag a square to resize the part',
    }[t];
  },
  cycleSnap() {
    const i = this.SNAPS.indexOf(this.snapOn ? this.snapStep : 0), next = this.SNAPS[(i + 1) % this.SNAPS.length];
    this.snapOn = next > 0; if (next > 0) this.snapStep = next;
    $('#st-snap').setAttribute('aria-pressed', String(this.snapOn)); $('#st-snap-v').textContent = this.snapOn ? String(this.snapStep) : 'Off';
    toast(this.snapOn ? `Snap: ${this.snapStep} stud${this.snapStep === 1 ? '' : 's'}` : 'Snap off');
  },
  snapV(v) { return this.snapOn ? r3(Math.round(v / this.snapStep) * this.snapStep) : r3(v); },
  toggleDrawer(id, pane) {
    const d = $('#' + id), open = !d.classList.contains('open') || !!pane;
    this.closeDrawers(); if (!open) return;
    d.classList.add('open');
    if (pane === 'props') setTimeout(() => $('#st-props-head').scrollIntoView({ block: 'start' }), 30);
    else if (pane === 'explorer') d.scrollTop = 0;
  },
  closeDrawers() { this.el.left.classList.remove('open'); this.el.right.classList.remove('open'); },

  // ---- insert ----
  renderInsert() {
    $$('#st-left [data-cat]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === this.cat)));
    const box = this.el.insert; box.textContent = '';
    for (const it of ST_INSERT[this.cat]) {
      const b = stEl('button', 'st-item'); b.type = 'button';
      b.innerHTML = `<span class="ic">${stIcon(it.icon)}</span><span></span>`;
      b.querySelector('.ic').style.background = it.color; b.lastChild.textContent = it.label;
      b.setAttribute('aria-label', 'Insert ' + it.label);
      b.addEventListener('click', () => this.insert(it));
      box.appendChild(b);
    }
  },
  dropPoint() {
    this.ray.setFromCamera({ x: 0, y: 0 }, this.cam);
    const hits = this.ray.intersectObjects([...World.meshes.values()].filter(m => m.visible), false);
    const at = new THREE.Vector3();
    if (hits.length && hits[0].distance < 400) {
      at.copy(hits[0].point);
      if (hits[0].face) { const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld); if (n.y < 0.5) at.addScaledVector(n, 2.5); }
    } else if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), at) || at.distanceTo(this.cam.position) > 400) at.copy(this.focus);
    const s = this.snapOn ? Math.max(1, this.snapStep) : 0;
    if (s) { at.x = Math.round(at.x / s) * s; at.z = Math.round(at.z / s) * s; }
    at.y = r3(at.y); return at;
  },
  insert(it) {
    if (!this.doc) return;
    const at = this.dropPoint(), raws = it.make(at);
    if (this.partCount() + raws.length > GAME_LIMITS.parts) { toast(`Games can have up to ${GAME_LIMITS.parts} parts.`, true); return; }
    const ids = [];
    this.edit('Insert ' + it.label, [], () => {
      let gid = null;
      if (raws.length > 1) { gid = this.newId('g'); this.addRaw({ id: gid, name: it.label, shape: 'group' }); ids.push(gid); }
      for (const [shape, pos, size, color, material = 'plastic', x = {}] of raws) {
        const p = normPart(mkPart(shape, [r3(at.x + pos[0]), r3(at.y + pos[1]), r3(at.z + pos[2])], size.slice(), color, material, Object.assign({ name: it.label }, JSON.parse(JSON.stringify(x)))));
        p.id = this.newId('p'); if (gid) p.parent = gid;
        this.addRaw(p); ids.push(p.id);
      }
      return ids;
    });
    this.renderList(); this.select(ids);
    if (this.tool === 'select') this.setTool('move');
    if (this.isPhone()) this.closeDrawers();
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
    this.renderList(); this.select(out); Sfx.play('pick');
  },
  remove() {
    const ps = this.selParts(); if (!ps.length) return;
    const ids = ps.map(p => p.id), groups = [...new Set(ps.map(p => p.parent).filter(Boolean))].filter(g => this.kids(g).every(id => this.sel.has(id)));
    this.edit('Delete', [...ids, ...groups], () => { for (const id of [...ids, ...groups]) this.removeRaw(id); });
    this.renderList(); this.select([]); Sfx.play('break');
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
    this.renderList(); this.selChanged(); toast('Grouped. Tap the group once to pick it all, twice for one part.');
  },
  ungroup() {
    const ps = this.selParts().filter(p => p.parent); if (!ps.length) return;
    const ids = ps.map(p => p.id), emptied = [...new Set(ps.map(p => p.parent))].filter(g => this.kids(g).every(id => this.sel.has(id)));
    this.edit('Ungroup', [...ids, ...emptied], () => { for (const p of ps) delete p.parent; for (const g of emptied) this.removeRaw(g); });
    this.renderList(); this.selChanged();
  },
  quickTurn() { // R turns the selection 90° around its center
    const ps = this.selParts(), c = this.selCenter(), q = new THREE.Quaternion().setFromAxisAngle(AXES.y, Math.PI / 2);
    this.edit('Turn', ps.map(p => p.id), () => { for (const p of ps) { this.rotatePart(p, { pos: p.pos.slice(), rot: p.rot.slice() }, q, c); World.refreshPart(p); } });
    this.renderProps();
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

  // ---- pointer input ----
  setRay(e) {
    const r = this.el.view.getBoundingClientRect();
    this.ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, this.cam);
  },
  pickPart(e) {
    this.setRay(e);
    const hits = this.ray.intersectObjects([...World.meshes.values()].filter(m => m.visible), false);
    return hits.length ? { part: hits[0].object.userData.part, point: hits[0].point.clone() } : null;
  },
  pickGizmo(e) {
    if (!this.sel.size || this.tool === 'select' || !this.giz.root.visible) return null;
    this.setRay(e); this.gscene.updateMatrixWorld(true);
    const hits = this.ray.intersectObjects(this.giz.hits[this.tool], false);
    return hits.length ? hits[0].object.userData : null;
  },
  onDown(e) {
    if (!this.doc) return;
    this.closeDrawers();
    try { this.el.view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.ptrs.size === 2) {
      if (this.pend) { this.endEdit(this.drag && this.drag.label); }
      this.drag = Object.assign({ kind: 'pinch' }, this.pinchInfo()); return;
    }
    if (this.ptrs.size > 2) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (e.button === 1 || e.button === 2) { this.drag = { kind: 'pan' }; return; }
    const h = this.pickGizmo(e);
    if (h) { this.startHandle(h, e); return; }
    const hit = this.pickPart(e);
    if (hit && this.sel.has(hit.part.id) && (this.tool === 'move' || this.tool === 'select') && !additive) { this.drag = { kind: 'pending-move', hit }; return; }
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
    if (d.kind === 'pinch') { if (this.ptrs.size < 2) this.drag = null; return; }
    if (this.ptrs.size) return;
    if ((d.kind === 'pending' || d.kind === 'pending-move') && !cancel) this.clickSelect(d.hit && d.hit.part, d.additive);
    if (d.kind === 'free' || d.kind === 'handle') this.endEdit(d.label);
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
      let ns = o.size[i] + (t - d.t0) * s;
      ns = this.snapOn ? Math.max(this.snapStep, Math.round(ns / this.snapStep) * this.snapStep) : Math.max(0.1, ns);
      ns = Math.min(2048, r3(ns)); const grow = ns - o.size[i];
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
    if (!World.scene || !this.doc) return;
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

  // ---- explorer ----
  renderListSoon() { if (this.listQueued) return; this.listQueued = true; requestAnimationFrame(() => { this.listQueued = false; if (this.doc) this.renderList(); }); },
  renderList() {
    const L = this.el.list; L.textContent = ''; if (!this.doc) return;
    const kidsOf = new Map(), MAX = 900; let n = 0;
    for (const p of this.doc.parts) if (p.shape !== 'group' && p.parent && this.index.has(p.parent)) { if (!kidsOf.has(p.parent)) kidsOf.set(p.parent, []); kidsOf.get(p.parent).push(p); }
    const frag = document.createDocumentFragment();
    for (const p of this.doc.parts) {
      if (n >= MAX) break;
      if (p.shape === 'group') { const ks = kidsOf.get(p.id) || []; frag.append(this.row(p, 'grp', ks.length)); n++; for (const k of ks) { if (n >= MAX) break; frag.append(this.row(k, 'kid')); n++; } }
      else if (!p.parent || !this.index.has(p.parent)) { frag.append(this.row(p)); n++; }
    }
    const total = this.partCount();
    if (n >= MAX) frag.append(stEl('div', 'st-more', `Showing the first ${MAX} rows. Tap parts in the 3D view to pick the rest.`));
    L.append(frag); this.el.count.textContent = `${total} / ${GAME_LIMITS.parts} parts`; this.markList();
  },
  row(p, kind, nKids) {
    const b = stEl('button', 'st-row' + (kind ? ' ' + kind : '')); b.type = 'button'; b.dataset.id = p.id; b.setAttribute('role', 'option');
    if (kind === 'grp') { b.innerHTML = stIcon('folder') + '<span class="nm"></span><span class="tag"></span>'; b.querySelector('.tag').textContent = String(nKids); }
    else {
      b.innerHTML = '<span class="sw"></span><span class="nm"></span>' + (p.behavior || p.tag ? '<span class="tag"></span>' : '');
      b.querySelector('.sw').style.background = p.color;
      if (p.behavior || p.tag) b.querySelector('.tag').textContent = p.behavior ? (BEHAVIOR_INFO[p.behavior] || {}).short || p.behavior : p.tag;
    }
    b.querySelector('.nm').textContent = p.name;
    return b;
  },
  markList() {
    for (const b of this.el.list.children) {
      const id = b.dataset.id; if (!id) continue;
      let on = this.sel.has(id);
      if (b.classList.contains('grp')) { const ks = this.kids(id); on = ks.length > 0 && ks.every(k => this.sel.has(k)); }
      b.classList.toggle('sel', on); b.setAttribute('aria-selected', String(on));
    }
  },
  onListClick(e) {
    const b = e.target.closest('.st-row'); if (!b) return;
    const id = b.dataset.id, p = this.byId(id); if (!p) return;
    const ids = p.shape === 'group' ? this.kids(id) : [id], additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive) { const s = new Set(this.sel), on = !ids.every(x => s.has(x)); ids.forEach(x => (on ? s.add(x) : s.delete(x))); this.select([...s]); }
    else this.select(ids);
  },

  // ---- properties ----
  renderProps() {
    const box = this.el.props; box.textContent = '';
    if (!this.doc) return;
    const ps = this.selParts();
    if (!ps.length) { box.append(stEl('p', 'st-empty', 'Select a part to change how it looks and what it does. Tap it in the 3D view or pick it in the Explorer.')); return; }
    const one = ps.length === 1 ? ps[0] : null, g = this.selGroup();
    if (g) {
      const f = this.fld('Group name'), i = this.text(g.name, 40);
      i.addEventListener('change', () => { const v = WordFilter.clean(i.value.trim()).slice(0, 40) || 'Group'; this.edit('Rename group', [g.id], () => { g.name = v; }); this.syncSelBar(); });
      f.append(i);
    }
    if (one) {
      const f = this.fld('Name'), i = this.text(one.name, 40);
      i.addEventListener('change', () => this.editProps('Rename', p => { p.name = WordFilter.clean(i.value.trim()).slice(0, 40) || p.shape; }));
      f.append(i);
      this.fld('Position').append(this.xyz('Position', one.pos, (k, v) => this.editProps('Move', p => { p.pos[k] = r3(clamp(v, -5000, 5000)); })));
      this.fld('Size').append(this.xyz('Size', one.size, (k, v) => this.editProps('Resize', p => { p.size[k] = r3(clamp(Math.abs(v), 0.05, 2048)); })));
      this.fld('Rotation (degrees)').append(this.xyz('Rotation', one.rot, (k, v) => this.editProps('Rotate', p => { p.rot[k] = Math.round(v * 100) / 100; })));
    } else if (!g) box.append(stEl('p', 'st-empty', `${ps.length} parts selected. Changes below apply to all of them.`));
    else box.append(stEl('p', 'st-empty', `${ps.length} parts in this group. Changes below apply to all of them.`));
    // Color
    const cf = this.fld('Color'), sw = stEl('div', 'st-sw'), cur = ps[0].color;
    for (const c of ST_COLORS) {
      const b = stEl('button', 'swatch'); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Color ' + c); b.setAttribute('aria-pressed', String(c.toUpperCase() === String(cur).toUpperCase()));
      b.addEventListener('click', () => this.editProps('Color', p => { p.color = c; }, true)); sw.append(b);
    }
    const row = stEl('div', 'st-color'), pickWrap = stEl('label', 'cur-swatch'), pick = stEl('input'), hex = this.text(cur, 7);
    pick.type = 'color'; pick.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#9AA5B1'; pick.setAttribute('aria-label', 'Pick any color'); pickWrap.style.background = cur; pickWrap.append(pick);
    pick.addEventListener('input', () => { pickWrap.style.background = pick.value; });
    pick.addEventListener('change', () => this.editProps('Color', p => { p.color = pick.value.toUpperCase(); }, true));
    hex.setAttribute('aria-label', 'Color code'); hex.addEventListener('change', () => { const v = normHex(hex.value.trim()); if (!v) { hex.value = cur; return; } this.editProps('Color', p => { p.color = v; }, true); });
    row.append(pickWrap, hex); cf.append(sw, row);
    // Material, transparency, physics
    const mf = this.fld('Material'), ms = this.dropdown(ST_MATERIALS.map(m => [m, m[0].toUpperCase() + m.slice(1)]), ps[0].material);
    ms.addEventListener('change', () => this.editProps('Material', p => { p.material = ms.value; })); mf.append(ms);
    const tf = this.fld('See-through'), tr = stEl('input'); tr.type = 'range'; tr.min = '0'; tr.max = '1'; tr.step = '0.05'; tr.value = String(ps[0].transparency || 0); tr.setAttribute('aria-label', 'See-through');
    tr.addEventListener('change', () => this.editProps('See-through', p => { p.transparency = +tr.value; })); tf.append(tr);
    box.append(this.check('Anchored', 'Unanchored parts fall when the game starts', ps.every(p => p.anchored !== false), on => this.editProps(on ? 'Anchor' : 'Unanchor', p => { if (on) delete p.anchored; else p.anchored = false; })));
    box.append(this.check('Solid', 'Players bump into it and can stand on it', ps.every(p => p.canCollide !== false), on => this.editProps(on ? 'Make solid' : 'Make walk-through', p => { if (on) delete p.canCollide; else p.canCollide = false; })));
    // Behavior
    const bf = this.fld('What it does'), cb = ps.every(p => (p.behavior || 'none') === (ps[0].behavior || 'none')) ? ps[0].behavior || 'none' : '';
    const bs = this.dropdown([...(cb ? [] : [['', 'Mixed']]), ...Object.entries(BEHAVIOR_INFO).map(([k, v]) => [k, v.label])], cb);
    bs.addEventListener('change', () => { if (!bs.value) return; this.editProps('Behavior', p => this.setBehavior(p, bs.value), true); });
    bf.append(bs);
    const info = BEHAVIOR_INFO[cb];
    if (info && info.help) bf.append(stEl('p', 'help', info.help));
    if (one && one.behavior && info && info.params) for (const prm of info.params) this.paramField(one, prm);
    // Tag
    const gf = this.fld('Tag'), tg = this.text(ps.every(p => (p.tag || '') === (ps[0].tag || '')) ? ps[0].tag || '' : '', 24);
    tg.placeholder = 'hazard'; tg.setAttribute('aria-label', 'Tag');
    tg.addEventListener('change', () => { const v = tg.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24); this.editProps('Tag', p => { if (v) p.tag = v; else delete p.tag; }); });
    gf.append(tg, stEl('p', 'help', 'Rules can look for tags. "hazard" makes any part deadly, even moving ones.'));
    const acts = stEl('div', 'btn-row'), dup = stEl('button', 'btn btn-sm'), del = stEl('button', 'btn btn-sm btn-danger');
    dup.innerHTML = stIcon('copy') + 'Duplicate'; del.innerHTML = stIcon('trash') + 'Delete';
    dup.addEventListener('click', () => this.duplicate()); del.addEventListener('click', () => this.remove());
    acts.append(dup, del); box.append(acts);
  },
  setBehavior(p, b) {
    if (b === 'none') { delete p.behavior; delete p.bp; return; }
    p.behavior = b; const bp = {};
    for (const prm of (BEHAVIOR_INFO[b] || {}).params || []) bp[prm.k] = Array.isArray(prm.def) ? prm.def.slice() : prm.def;
    if (b === 'teleport') bp.to = [r3(p.pos[0]), r3(p.pos[1] + 4), r3(p.pos[2] - 16)];
    if (b === 'coin') { p.canCollide = false; }
    p.bp = bp;
  },
  paramField(p, prm) {
    const f = this.fld(prm.label), val = p.bp && p.bp[prm.k] !== undefined ? p.bp[prm.k] : prm.def;
    const set = v => this.editProps(prm.label, q => { q.bp = Object.assign({}, q.bp || {}, { [prm.k]: v }); });
    if (prm.opts) { const s = this.dropdown(prm.opts.map(o => [o, o.toUpperCase()]), val); s.addEventListener('change', () => set(s.value)); f.append(s); }
    else if (prm.vec) { const cur = finite3(val, prm.def); f.append(this.xyz(prm.label, cur, (k, v) => { const nv = cur.slice(); nv[k] = r3(v); set(nv); })); }
    else f.append(this.num(val, v => set(r3(clamp(v, prm.min, prm.max))), prm.label));
  },
  editProps(label, fn, rerender) {
    const ps = this.selParts(); if (!ps.length) return;
    this.edit(label, ps.map(p => p.id), () => { for (const p of ps) { fn(p); World.refreshPart(p); } });
    if (rerender) this.renderProps();
  },
  fld(label) { const f = stEl('div', 'st-f'); f.append(stEl('b', '', label)); this.el.props.append(f); return f; },
  text(v, max) { const i = stEl('input', 'text-input'); i.value = v || ''; i.maxLength = max; i.spellcheck = false; i.autocomplete = 'off'; return i; },
  num(v, onSet, label) {
    const i = stEl('input', 'text-input'); i.type = 'number'; i.step = 'any'; i.inputMode = 'decimal'; i.value = String(r3(Number(v) || 0)); if (label) i.setAttribute('aria-label', label);
    i.addEventListener('change', () => { const n = parseFloat(i.value); if (!Number.isFinite(n)) { i.value = String(r3(Number(v) || 0)); return; } onSet(n); });
    return i;
  },
  xyz(label, vals, onSet) {
    const g = stEl('div', 'st-xyz');
    ['X', 'Y', 'Z'].forEach((L, k) => { const lab = stEl('label'); lab.append(stEl('span', '', L), this.num(vals[k], v => onSet(k, v), `${label} ${L}`)); g.append(lab); });
    return g;
  },
  dropdown(opts, value) {
    const s = stEl('select', 'text-input');
    for (const [v, t] of opts) { const o = stEl('option', '', t); o.value = v; s.append(o); }
    s.value = value; return s;
  },
  check(title, help, on, onSet) {
    const row = stEl('label', 'set-row'), lbl = stEl('span', 'lbl'), sw = stEl('span', 'switch'), i = stEl('input');
    lbl.append(stEl('b', '', title), stEl('small', '', help)); i.type = 'checkbox'; i.setAttribute('role', 'switch'); i.checked = on;
    i.addEventListener('change', () => onSet(i.checked)); sw.append(i, stEl('span')); row.append(lbl, sw); return row;
  },

  // ---- game settings ----
  bindSettings() {
    const sky = $('#sg-sky');
    for (const k of ENV_KEYS) { const o = stEl('option', '', k[0].toUpperCase() + k.slice(1)); o.value = k; sky.append(o); }
    $('#sg-name').addEventListener('change', () => { this.setTitle($('#sg-name').value); $('#sg-name').value = this.doc.title; });
    $('#sg-desc').addEventListener('change', () => { if (!this.doc) return; this.doc.desc = WordFilter.clean($('#sg-desc').value.trim()).slice(0, GAME_LIMITS.desc); this.save(true); });
    sky.addEventListener('change', () => {
      if (!this.doc) return; const env = ENV[sky.value] || ENV.day; this.doc.env = { sky: sky.value };
      $('#sg-grav').value = String(env.gravity || 1); this.syncGrav();
      World.setEnv(Object.assign({}, ENV.day, env)); World.env = Object.assign({}, ENV.day, env); this.save(true);
    });
    $('#sg-grav').addEventListener('input', () => this.syncGrav());
    $('#sg-grav').addEventListener('change', () => {
      if (!this.doc) return; const g = +$('#sg-grav').value, base = (ENV[this.doc.env.sky] || {}).gravity || 1;
      if (Math.abs(g - base) < 0.001) delete this.doc.env.gravity; else this.doc.env.gravity = g;
      this.save(true);
    });
    $('#sg-mode').addEventListener('change', () => { if (!this.doc) return; this.doc.mode = $('#sg-mode').value; this.syncModeHelp(); this.save(true); });
    $('#sg-time').addEventListener('change', () => {
      if (!this.doc) return; const v = Math.round(clamp(parseFloat($('#sg-time').value) || 0, 0, 3600));
      if (v) this.doc.modeOpts.timeLimit = v; else delete this.doc.modeOpts.timeLimit; $('#sg-time').value = String(v); this.save(true);
    });
    $('#sg-kill').addEventListener('change', () => {
      if (!this.doc) return; const raw = parseFloat($('#sg-kill').value);
      if (Number.isFinite(raw)) this.doc.killY = Math.round(clamp(raw, -500, 100)); else delete this.doc.killY;
      $('#sg-kill').value = Number.isFinite(this.doc.killY) ? String(this.doc.killY) : ''; this.save(true);
    });
    $('#sg-download').addEventListener('click', () => this.download());
    $('#sg-delete').addEventListener('click', () => this.deleteGame());
  },
  syncGrav() { $('#sg-grav-v').textContent = Math.round(+$('#sg-grav').value * 100) + '%'; },
  syncModeHelp() {
    const m = this.doc.mode, info = STUDIO_MODES[m];
    $('#sg-mode-help').textContent = info ? info[1] : `Rules from the game you copied (${(Modes[m] && Modes[m].label) || m}). Its special parts keep working while their tags stay the same.`;
    $('#sg-time').disabled = m !== 'custom';
  },
  openSettings() {
    if (!this.doc) return; const d = this.doc;
    $('#sg-name').value = d.title || ''; $('#sg-desc').value = d.desc || '';
    $('#sg-sky').value = ENV[d.env.sky] ? d.env.sky : 'day';
    $('#sg-grav').value = String(Number(d.env.gravity) || (ENV[d.env.sky] || {}).gravity || 1); this.syncGrav();
    const ms = $('#sg-mode'); ms.textContent = '';
    const modes = Object.entries(STUDIO_MODES).map(([k, v]) => [k, v[0]]);
    if (!STUDIO_MODES[d.mode] && Modes[d.mode]) modes.push([d.mode, `${Modes[d.mode].label || d.mode} (from the original)`]);
    for (const [k, t] of modes) { const o = stEl('option', '', t); o.value = k; ms.append(o); }
    ms.value = Modes[d.mode] ? d.mode : 'custom'; this.syncModeHelp();
    $('#sg-time').value = String(Number(d.modeOpts.timeLimit) || 0);
    $('#sg-kill').value = Number.isFinite(d.killY) ? String(d.killY) : '';
    $('#sg-download').hidden = !Caps.downloads;
    Modals.open($('#st-game-modal'));
  },
  async download() {
    const dl = Caps.downloads; if (!dl || !this.doc) return;
    const d = this.doc, file = { v: 1, kind: 'playforge-game', title: d.title, desc: d.desc || '', mode: d.mode, modeOpts: d.modeOpts, env: d.env, killY: d.killY, spawnYaw: d.spawnYaw, parts: Library.compact(d.parts) };
    const name = (d.title || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';
    try { await dl.save({ filename: `${name}.playforge.json`, data: new Blob([JSON.stringify(file)], { type: 'application/json' }) }); toast('Game file downloaded'); }
    catch (err) { const code = err && err.code; if (code === 'declined') return; toast(code === 'rate_limited' ? 'A download is already waiting for your answer.' : 'Downloads are not available here.', true); }
  },
  async deleteGame() {
    if (!this.doc) return; const d = this.doc;
    const ok = await askChoice({ title: `Delete ${d.title}?`, body: d.publishedAt ? 'This removes it from this device and unpublishes it, so nobody can play it any more. This cannot be undone.' : 'This removes it from this device. This cannot be undone.', buttons: [{ label: 'Keep it', value: false }, { label: 'Delete', value: true, kind: 'danger' }] });
    if (!ok) return;
    Modals.close($('#st-game-modal'));
    if (d.publishedAt && Caps.db && Me.id) { try { await Library.unpublish(d.id); } catch (e) { toast("Couldn't unpublish it. It was still deleted from this device.", true); } }
    const id = d.id; this.doc = null; Library.deleteDraft(id);
    World.unload(); this.grid = null; this.sel = new Set(); for (const o of this.outlines.values()) this.gscene.remove(o); this.outlines.clear();
    showScreen('home'); Engine.setMode('home'); if (Home.onReturn) Home.onReturn(); toast('Game deleted');
  },

  // ---- test and publish ----
  test() {
    if (!this.doc) return;
    this.cancelDrag(); this.save(true);
    if (!this.doc.parts.some(p => p.shape === 'spawn')) toast('Tip: insert a Spawn so players start in the right place.');
    const def = Library.toDef(this.doc, Profile.displayName());
    this.closeDrawers(); World.unload(); this.grid = null;
    for (const o of this.outlines.values()) this.gscene.remove(o);
    this.outlines.clear();
    Game.enter(def, { test: true, onExit: () => { if (this.doc) this.show(); } });
  },
  async publish() {
    if (!this.doc) return;
    if (!Caps.db) { toast('Publishing is not available here.', true); return; }
    if (!Library.canPublish()) { toast(Me.id ? "Your account can't publish games here." : 'Sign in to claude.ai to publish games.', true); return; }
    const d = this.doc, again = !!d.publishedAt;
    const ok = await askChoice({
      title: again ? 'Update your game?' : 'Publish your game?',
      body: again ? `Everyone will get the latest version of ${d.title}.` : `${d.title} will show up for everyone on the PlayForge home screen under New. You can unpublish it any time from its game page.`,
      buttons: [{ label: 'Not yet', value: false }, { label: again ? 'Update' : 'Publish', value: true, kind: 'ember' }],
    });
    if (!ok || this.doc !== d) return;
    this.cancelDrag(); d.thumb = this.thumb(); this.save(true);
    const btn = $('#st-publish'); btn.disabled = true;
    try { await Library.publish(d, d.thumb); toast(again ? 'Updated! Players get the new version next time they join.' : 'Published! Find it under New on the home screen.'); Sfx.play('win'); this.save(true); }
    catch (e) {
      const m = e && e.message;
      toast(m === 'limit' ? `You can publish up to ${GAME_LIMITS.published} games. Unpublish one first.` : m === 'signin' ? 'Sign in to claude.ai to publish games.' : "Couldn't publish right now. Try again in a moment.", true);
    } finally { btn.disabled = false; }
  },
};
