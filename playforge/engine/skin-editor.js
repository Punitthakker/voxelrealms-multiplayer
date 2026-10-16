import * as THREE from 'three';
import { $, $$, BLANK, Caps, FACES, FACE_LABEL, LS, Me, PART, PARTS, PIX, Profile, SK, STARTERS, Sfx, WordFilter, askChoice, clamp, cssVar, ctx2d, defaultStarterIndex, drawFigure, drawPngTo, faceRects, hexToRgb, mirrorPixel, newSkinCanvas, normHex, paintSkin, randomOutfit, rgbToHex, rng, showScreen, toast } from './core.js';
import { Engine } from './render.js';
import { createAvatar, makeSkinTexture } from './avatar.js';
import { Skins, STARTER_CANVASES, PALETTE } from './skins.js';
import { Game } from './game.js';
import { Home } from './home.js';
import { Net } from './net.js';


/* ---------- 13. Skins in use + the avatar editor ---------- */
export const Editor = {
  work: null, g: null, tex: null, scene: null, cam: null, avatar: null, ray: null, ndc: null,
  tool: 'pencil', lastPaintTool: 'pencil', size: 1, mirror: false, grid: true, layer: 'base', rotateTool: false,
  color: '#FF6A2B', recent: [], undo: [], redo: [], dirty: false, slot: 0, editThumb: null, thumbDirty: false,
  yaw: 0.55, pitch: 0.1, dist: 5, drag: null, pts: new Map(), pinchD: 0, stroke: null, mapDirty: true, t: 0, hover: null,
  mapBg: null, colors: {}, lastSfx: 0, busy: false, el: {},
  init() {
    this.work = newSkinCanvas(); this.g = ctx2d(this.work); this.tex = makeSkinTexture(this.work);
    this.el = { map: $('#av-map'), paint: $('#tab-paint'), skins: $('#tab-skins'), status: $('#av-status'), view: $('#av-view'), caption: $('#av-caption') };
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
    this.recent = (LS.get('pf.v1.recent', []) || []).map(normHex).filter(Boolean).slice(0, 10);
    this.applyTheme(); this.bindUI(); this.bindView(); this.bindMap(); this.buildPalette(); this.buildStarters(); this.setColor('#FF6A2B');
    const mq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) mq.addEventListener('change', () => this.applyTheme());
    new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  },
  applyTheme() {
    this.colors = { surface: cssVar('--surface'), surface2: cssVar('--surface-2'), bg: cssVar('--bg'), line: cssVar('--line'), ink2: cssVar('--ink-2'), cobalt: cssVar('--cobalt'), ember: cssVar('--ember') };
    this.scene.background = new THREE.Color(this.colors.surface2);
    this.mapBg = null; this.mapDirty = true;
  },
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.sizeMap(); },

  async enter(opts = {}) {
    if (this.busy) return; this.busy = true;
    try {
      this.slot = Profile.active;
      if (opts.skin && await drawPngTo(this.work, opts.skin)) this.slot = clamp(opts.slot | 0, 0, 4);
      else await this.loadSlot(this.slot);
      this.undo = []; this.redo = []; this.updateUndoUI(); this.setDirty(!!opts.dirty); this.afterChange();
      this.avatar.setName(Profile.displayName());
      showScreen('avatar'); Engine.setMode('avatar'); Engine.attach(this.el.view);
      this.sizeMap(); this.renderSlots(); this.syncNameTab(); Sfx.play('open');
    } finally { this.busy = false; }
  },
  async loadSlot(i) {
    const src = Profile.slots[i];
    if (src && await drawPngTo(this.work, src)) return true;
    this.g.clearRect(0, 0, SK, SK); this.g.drawImage(Skins.worn, 0, 0); // an empty slot starts from what you wear
    return false;
  },
  async back() {
    if (this.busy || Engine.mode !== 'avatar') return;
    this.endStroke();
    if (this.dirty) {
      const c = await askChoice({ title: 'Save your skin?', body: `Slot ${this.slot + 1} has changes that are not saved yet.`,
        buttons: [{ label: 'Keep editing', value: 'cancel' }, { label: 'Discard', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'ember' }] });
      if (c === 'cancel') return;
      if (c === 'save') await this.save(); else this.setDirty(false);
    }
    Engine.setMode('home'); showScreen('home'); Home.renderMe(); Sfx.play('click');
  },
  async save() {
    this.endStroke();
    const png = this.work.toDataURL('image/png');
    Profile.slots[this.slot] = png; Profile.active = this.slot; Skins.setFrom(this.work);
    this.setDirty(false); this.el.status.textContent = 'Saving…';
    this.renderSlots(); Home.renderMe(); Sfx.play('save');
    const where = await Profile.persist();
    this.setDirty(this.dirty);
    toast(where === 'cloud' ? `Saved to slot ${this.slot + 1}. Other players will see this skin.` : `Saved to slot ${this.slot + 1} on this device.`);
  },
  setDirty(d) {
    this.dirty = d;
    const s = this.el.status; s.classList.toggle('dirty', d);
    s.textContent = d ? 'Unsaved changes' : Profile.where === 'cloud' ? 'Saved' : 'Saved on this device';
  },
  onProfileChanged() {
    this.syncNameTab(); this.avatar.setName(Profile.displayName());
    if (Engine.mode === 'avatar' && !this.dirty && !this.stroke) {
      this.slot = Profile.active;
      this.loadSlot(this.slot).then(() => { this.undo = []; this.redo = []; this.updateUndoUI(); this.afterChange(); this.renderSlots(); this.setDirty(false); });
    } else this.renderSlots();
  },

  // ---- painting ----
  afterChange() { this.tex.needsUpdate = true; this.mapDirty = true; this.thumbDirty = true; },
  snap() { return this.g.getImageData(0, 0, SK, SK); },
  pushUndo(s) { this.undo.push(s); if (this.undo.length > 60) this.undo.shift(); this.redo.length = 0; this.updateUndoUI(); },
  updateUndoUI() { $('#av-undo').disabled = !this.undo.length; $('#av-redo').disabled = !this.redo.length; },
  doUndo() { this.endStroke(); if (!this.undo.length) return; this.redo.push(this.snap()); this.g.putImageData(this.undo.pop(), 0, 0); this.afterChange(); this.setDirty(true); this.updateUndoUI(); Sfx.play('click'); },
  doRedo() { this.endStroke(); if (!this.redo.length) return; this.undo.push(this.snap()); this.g.putImageData(this.redo.pop(), 0, 0); this.afterChange(); this.setDirty(true); this.updateUndoUI(); Sfx.play('click'); },
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
    this.endStroke(); const before = this.snap();
    this.g.clearRect(0, 0, SK, SK); this.g.drawImage(src, 0, 0);
    this.pushUndo(before); this.afterChange(); this.setDirty(true); Sfx.play('fill'); if (msg) toast(msg);
  },
  randomize() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    this.applyWhole(paintSkin(newSkinCanvas(), randomOutfit(rng(seed)), seed + 1));
  },

  // ---- tools and colors ----
  setTool(t) {
    this.tool = t; if (t !== 'picker') this.lastPaintTool = t;
    $$('.av-tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    this.mapDirty = true;
  },
  setSize(n) { this.size = n; $$('.av-tools [data-size]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.size === n))); this.mapDirty = true; },
  toggleMirror() { this.mirror = !this.mirror; $('#opt-mirror').setAttribute('aria-pressed', String(this.mirror)); toast(this.mirror ? 'Mirror on: paint once, both sides change' : 'Mirror off'); },
  setLayer(l, quiet) {
    this.layer = l; $('#layer-base').setAttribute('aria-pressed', String(l === 'base')); $('#layer-outer').setAttribute('aria-pressed', String(l === 'outer'));
    this.avatar.setOuterVisible(l === 'outer'); this.mapDirty = true; if (!quiet) Sfx.play('click');
  },
  setColor(hex, remember) {
    this.color = hex; $('#cur-swatch').style.background = hex; $('#av-color').value = hex.toLowerCase(); $('#av-hex').value = hex;
    $$('.swatch').forEach(s => s.setAttribute('aria-pressed', String(s.dataset.c === hex)));
    if (this.tool === 'eraser') this.setTool('pencil');
    if (remember) this.remember(hex);
  },
  remember(hex) {
    if (PALETTE.includes(hex)) return;
    this.recent = [hex, ...this.recent.filter(c => c !== hex)].slice(0, 10); LS.set('pf.v1.recent', this.recent); this.buildRecent();
  },
  makeSwatch(hex) {
    const b = document.createElement('button'); b.className = 'swatch'; b.style.background = hex; b.dataset.c = hex;
    b.setAttribute('aria-label', 'Color ' + hex); b.setAttribute('aria-pressed', String(hex === this.color));
    b.addEventListener('click', () => { this.setColor(hex); Sfx.play('click'); });
    return b;
  },
  buildPalette() { const box = $('#av-palette'); box.textContent = ''; PALETTE.forEach(c => box.appendChild(this.makeSwatch(c))); this.buildRecent(); },
  buildRecent() {
    const box = $('#av-recent'); box.textContent = '';
    if (!this.recent.length) { const p = document.createElement('p'); p.className = 'help'; p.style.gridColumn = '1 / -1'; p.textContent = 'Custom colors you use show up here.'; box.appendChild(p); return; }
    this.recent.forEach(c => box.appendChild(this.makeSwatch(c)));
  },
  buildStarters() {
    const box = $('#av-starters'); box.textContent = '';
    STARTERS.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'starter';
      const c = document.createElement('canvas'); c.width = 16; c.height = 32; c.className = 'px'; drawFigure(c, STARTER_CANVASES[i]);
      const t = document.createElement('span'); t.textContent = s.name;
      b.append(c, t); b.addEventListener('click', () => this.applyWhole(STARTER_CANVASES[i], `${s.name} loaded. Save to keep it.`));
      box.appendChild(b);
    });
  },
  renderSlots() {
    const box = $('#av-slots'); box.textContent = ''; this.editThumb = null;
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button'), filled = !!Profile.slots[i];
      b.className = 'slot' + (i === this.slot ? ' editing' : '') + (i === Profile.active && filled ? ' wearing' : '');
      b.setAttribute('aria-pressed', String(i === this.slot));
      b.setAttribute('aria-label', `Slot ${i + 1}${filled ? '' : ', empty'}${i === Profile.active && filled ? ', worn' : ''}${i === this.slot ? ', editing' : ''}`);
      if (filled || i === this.slot) {
        const c = document.createElement('canvas'); c.width = 16; c.height = 32; c.className = 'px'; b.appendChild(c);
        if (i === this.slot) { drawFigure(c, this.work); this.editThumb = c; }
        else { const tmp = newSkinCanvas(); drawPngTo(tmp, Profile.slots[i]).then(ok => { if (ok) drawFigure(c, tmp); }); }
      } else { const e = document.createElement('span'); e.className = 'empty'; e.innerHTML = '<svg class="i"><use href="#i-plus"/></svg>'; b.appendChild(e); }
      const n = document.createElement('span'); n.className = 'slot-n'; n.textContent = String(i + 1); b.appendChild(n);
      b.addEventListener('click', () => this.selectSlot(i));
      box.appendChild(b);
    }
  },
  async selectSlot(i) {
    if (i === this.slot || this.busy) return;
    this.endStroke();
    if (this.dirty) {
      const c = await askChoice({ title: 'Save before switching?', body: `Your changes to slot ${this.slot + 1} are not saved yet.`,
        buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Discard', value: 'discard', kind: 'danger' }, { label: 'Save', value: 'save', kind: 'ember' }] });
      if (c === 'cancel') return;
      if (c === 'save') await this.save();
    }
    this.slot = i;
    const had = await this.loadSlot(i);
    this.undo = []; this.redo = []; this.updateUndoUI(); this.afterChange();
    if (had) {
      Profile.active = i; Skins.setFrom(this.work); this.setDirty(false); Home.renderMe();
      Profile.persist().then(() => this.setDirty(this.dirty));
      toast(`Wearing slot ${i + 1}`);
    } else { this.setDirty(true); toast(`Slot ${i + 1} is empty. It starts as a copy of your current skin. Save to keep it.`); }
    this.renderSlots(); Sfx.play('click');
  },
  syncNameTab() {
    const inp = $('#av-nick'); if (document.activeElement !== inp) inp.value = Profile.nick;
    inp.placeholder = Me.accountName || Me.guestName;
    $('#av-nick-clear').textContent = Me.accountName ? 'Use my account name' : 'Use my guest name';
  },
  async saveNick() {
    const v = $('#av-nick').value.trim().replace(/\s+/g, ' '), help = $('#nick-help');
    const fail = msg => { help.textContent = msg; help.style.color = 'var(--danger)'; Sfx.play('error'); };
    if (v && (v.length < 3 || !/^[A-Za-z0-9 _.-]+$/.test(v))) return fail('Use 3 to 20 letters, numbers, spaces, dots, dashes or underscores.');
    if (WordFilter.hasBad(v)) return fail("That name isn't allowed. Try a different one.");
    help.style.color = ''; help.textContent = 'Shown on the nametag above your head. 3 to 20 letters, numbers, spaces, dots, dashes or underscores.';
    Profile.nick = v; this.syncNameTab(); this.avatar.setName(Profile.displayName()); Game.avatar.setName(Profile.displayName()); Home.renderMe(); Net.updateIdentity();
    Sfx.play('save');
    const where = await Profile.persist();
    toast((v ? `Name saved: ${v}` : `Using your ${Me.accountName ? 'account' : 'guest'} name`) + (where === 'cloud' ? '' : ' (this device)'));
  },
  onKey(e) {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.doRedo(); return; }
    if (mod && k === 's') { e.preventDefault(); this.save(); return; }
    if (mod || e.altKey) return;
    const tools = { b: 'pencil', p: 'pencil', e: 'eraser', g: 'bucket', f: 'bucket', i: 'picker' };
    if (tools[k]) this.setTool(tools[k]);
    else if (k === 'm') this.toggleMirror();
    else if (k === '1' || k === '2' || k === '3') this.setSize(+k);
  },

  // ---- UI wiring ----
  bindUI() {
    $('#av-back').addEventListener('click', () => this.back());
    $('#av-save').addEventListener('click', () => this.save());
    $('#av-undo').addEventListener('click', () => this.doUndo());
    $('#av-redo').addEventListener('click', () => this.doRedo());
    $$('.av-tools [data-tool]').forEach(b => b.addEventListener('click', () => { this.setTool(b.dataset.tool); Sfx.play('click'); }));
    $$('.av-tools [data-size]').forEach(b => b.addEventListener('click', () => { this.setSize(+b.dataset.size); Sfx.play('click'); }));
    $('#opt-mirror').addEventListener('click', () => { this.toggleMirror(); Sfx.play('click'); });
    $('#opt-grid').addEventListener('click', () => { this.grid = !this.grid; $('#opt-grid').setAttribute('aria-pressed', String(this.grid)); this.mapDirty = true; Sfx.play('click'); });
    $('#opt-random').addEventListener('click', () => this.randomize());
    $('#av-random2').addEventListener('click', () => this.randomize());
    $('#layer-base').addEventListener('click', () => this.setLayer('base'));
    $('#layer-outer').addEventListener('click', () => this.setLayer('outer'));
    $('#tool-rotate').addEventListener('click', () => {
      this.rotateTool = !this.rotateTool; $('#tool-rotate').setAttribute('aria-pressed', String(this.rotateTool));
      $('#stage-hint').textContent = this.rotateTool ? 'Turn mode: drag anywhere to turn the avatar' : 'Paint on the avatar · drag the background to turn it';
      Sfx.play('click');
    });
    const hex = $('#av-hex'), col = $('#av-color');
    col.addEventListener('input', () => { const h = normHex(col.value); if (h) this.setColor(h); });
    col.addEventListener('change', () => { const h = normHex(col.value); if (h) this.setColor(h, true); });
    hex.addEventListener('change', () => { const h = normHex(hex.value); if (h) this.setColor(h, true); else { hex.value = this.color; toast('Use a hex color like #FF6A2B.'); } });
    hex.addEventListener('keydown', e => { if (e.key === 'Enter') hex.blur(); });
    const tabs = [['tab-btn-paint', 'tab-paint'], ['tab-btn-skins', 'tab-skins'], ['tab-btn-name', 'tab-name']];
    tabs.forEach(([b, p]) => $('#' + b).addEventListener('click', () => {
      tabs.forEach(([b2, p2]) => { $('#' + b2).setAttribute('aria-selected', String(b2 === b)); $('#' + p2).hidden = p2 !== p; });
      if (p === 'tab-paint') this.sizeMap();
      if (p === 'tab-skins') this.renderSlots();
      Sfx.play('click');
    }));
    $('#av-import').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      const url = URL.createObjectURL(f), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        if (img.width !== SK || img.height !== SK) { toast('Skins must be 64 × 64 pixels.', true); Sfx.play('error'); return; }
        const c = newSkinCanvas(); ctx2d(c).drawImage(img, 0, 0); this.applyWhole(c, 'Skin imported. Save to keep it.');
      };
      img.onerror = () => { URL.revokeObjectURL(url); toast("That file isn't a PNG image PlayForge can read.", true); };
      img.src = url;
    });
    $('#av-export').addEventListener('click', () => {
      const dl = Caps.downloads; if (!dl) return;
      this.work.toBlob(async blob => {
        if (!blob) return;
        try { await dl.save({ filename: `playforge-skin-${this.slot + 1}.png`, data: blob }); toast('Skin downloaded'); }
        catch (err) {
          const code = err && err.code;
          if (code === 'declined') return;
          toast(code === 'rate_limited' ? 'A download is already waiting for your answer.' : 'Downloads are not available here.', true);
        }
      }, 'image/png');
    });
    $('#av-nick-save').addEventListener('click', () => this.saveNick());
    $('#av-nick').addEventListener('keydown', e => { if (e.key === 'Enter') this.saveNick(); });
    $('#av-nick-clear').addEventListener('click', () => { $('#av-nick').value = ''; this.saveNick(); });
  },
  bindView() {
    const view = this.el.view, pts = this.pts;
    const d2 = () => { const p = [...pts.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); };
    view.addEventListener('pointerdown', e => {
      e.preventDefault(); try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) { this.endStroke(); this.drag = 'pinch'; this.pinchD = d2(); return; }
      if (e.button === 1 || e.button === 2 || this.rotateTool) { this.drag = 'rotate'; return; }
      const hit = this.pick3D(e.clientX, e.clientY);
      if (hit) { this.drag = 'paint'; this.act(hit.x, hit.y, hit.rect); this.setHover([hit.x, hit.y]); } else this.drag = 'rotate';
    });
    view.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') { const h = this.pick3D(e.clientX, e.clientY); this.setHover(h ? [h.x, h.y] : null); } return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (this.drag === 'rotate') { this.yaw -= dx * 0.011; this.pitch = clamp(this.pitch + dy * 0.008, -0.6, 1.0); }
      else if (this.drag === 'pinch' && pts.size >= 2) { const d = d2(); if (this.pinchD > 0 && d > 0) this.dist = clamp(this.dist * this.pinchD / d, 2.2, 9); this.pinchD = d; this.yaw -= dx * 0.005; }
      else if (this.drag === 'paint' && this.stroke) { const h = this.pick3D(e.clientX, e.clientY); if (h) { this.strokeTo(h.x, h.y, h.rect); this.setHover([h.x, h.y]); } }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (this.drag === 'paint') this.endStroke();
      if (!pts.size) this.drag = null; else if (this.drag === 'pinch') this.drag = 'rotate';
    };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !pts.size) this.setHover(null); });
    view.addEventListener('contextmenu', e => e.preventDefault());
    view.addEventListener('wheel', e => { e.preventDefault(); this.dist = clamp(this.dist * Math.pow(1.0015, e.deltaY), 2.2, 9); }, { passive: false });
    view.addEventListener('dblclick', e => e.preventDefault());
  },
  pick3D(cx, cy) {
    const r = this.el.view.getBoundingClientRect(); if (!r.width) return null;
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    const hits = this.ray.intersectObjects(this.layer === 'outer' ? this.avatar.outer : this.avatar.base, false);
    if (!hits.length || !hits[0].uv) return null;
    const h = hits[0], ud = h.object.userData, rect = faceRects(PART[ud.part], ud.layer)[FACES[Math.floor(h.faceIndex / 2)]];
    const x = clamp(Math.floor(h.uv.x * SK), rect.x, rect.x + rect.w - 1), y = clamp(Math.floor((1 - h.uv.y) * SK), rect.y, rect.y + rect.h - 1);
    const info = PIX[y * SK + x]; if (!info) return null;
    return { x, y, rect: info.rect };
  },
  bindMap() {
    const map = this.el.map;
    map.addEventListener('pointerdown', e => {
      e.preventDefault(); const p = this.mapPixel(e); if (!p) return;
      try { map.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const info = PIX[p[1] * SK + p[0]]; if (info && info.layer !== this.layer) this.setLayer(info.layer, true);
      this.act(p[0], p[1], null); this.setHover(p);
    });
    map.addEventListener('pointermove', e => { const p = this.mapPixel(e); this.setHover(p); if (p && this.stroke) this.strokeTo(p[0], p[1], null); });
    const up = () => this.endStroke();
    map.addEventListener('pointerup', up); map.addEventListener('pointercancel', up);
    map.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.setHover(null); });
  },
  mapPixel(e) {
    const r = this.el.map.getBoundingClientRect(); if (!r.width) return null;
    const x = Math.floor((e.clientX - r.left) / r.width * SK), y = Math.floor((e.clientY - r.top) / r.height * SK);
    return x < 0 || y < 0 || x >= SK || y >= SK ? null : [x, y];
  },
  setHover(p) {
    const same = p && this.hover && p[0] === this.hover[0] && p[1] === this.hover[1];
    if (same || (!p && !this.hover)) return;
    this.hover = p; this.mapDirty = true;
    if (!p) { this.el.caption.textContent = 'Skin map · 64 × 64'; return; }
    const info = PIX[p[1] * SK + p[0]];
    this.el.caption.textContent = (info ? `${PART[info.part].label} · ${FACE_LABEL[info.face]}${info.layer === 'outer' ? ' · outer layer' : ''}` : 'Unused area') + ` · ${p[0]}, ${p[1]}`;
  },
  sizeMap() {
    const panel = this.el.paint; if (panel.hidden) return;
    const avail = panel.clientWidth - 32; if (avail <= 0) return;
    const z = clamp(Math.floor(avail / SK), 3, 7), css = SK * z, dpr = Math.min(2, window.devicePixelRatio || 1), c = this.el.map;
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
    const c = this.el.map, g = c.getContext('2d'), W = c.width, S = W / SK, C = this.colors;
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
  frame(dt) {
    this.t += dt;
    this.avatar.body.position.y = Math.sin(this.t * 2) * 0.008;
    if (this.mapDirty && !this.el.paint.hidden) this.drawMap();
    if (this.thumbDirty && this.editThumb && !this.el.skins.hidden) { drawFigure(this.editThumb, this.work); this.thumbDirty = false; }
    const cp = Math.cos(this.pitch);
    this.cam.position.set(Math.sin(this.yaw) * cp * this.dist, 1.05 + Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(0, 1.05, 0);
    Engine.renderer.render(this.scene, this.cam);
  },
};
