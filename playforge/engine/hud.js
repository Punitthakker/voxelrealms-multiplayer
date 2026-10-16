import { clamp } from './core.js';
import { hudStore, gameStore } from './stores.js';

/* ---------- HUD for games ---------- */
// Game modes call Hud.*; the values land in hudStore and components/playforge/game/Hud.js draws them.
// Writers may call these every frame: nothing is published unless a value changed.
// Icons available to stat chips and action buttons (sprite ids without "i-").
export const HUD_ICONS = ['clock', 'coin', 'skull', 'flag', 'star', 'moon', 'sun', 'log', 'fire', 'target', 'trophy', 'axe', 'bolt', 'blaster', 'shield', 'key', 'gem', 'drop', 'heart', 'users', 'hand', 'jump', 'play', 'berry', 'eye'];
export const hudIcon = name => (HUD_ICONS.includes(name) ? name : 'star');
export function fmtTime(s) {
  s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}
export function fmtClock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
let flashSeq = 0, hurtSeq = 0;
export const Hud = {
  flashT: 0,
  init() {},
  reset() {
    clearTimeout(this.flashT);
    hudStore.set({ objective: '', stats: [], hp: null, board: null, flash: null, prompt: '', crosshair: false, panel: null, end: null });
  },
  objective(text) { hudStore.set({ objective: text ? String(text) : '' }); },
  // A chip in the top stats row: Hud.stat('time', '1:02.4', {icon: 'clock', label: 'Time', warn}).
  stat(key, value, opt = {}) {
    const list = hudStore.get().stats, i = list.findIndex(s => s.key === key), str = String(value), warn = !!opt.warn;
    if (i < 0) { hudStore.set({ stats: list.concat([{ key, value: str, icon: hudIcon(opt.icon), label: opt.label || '', warn }]) }); return; }
    const s = list[i], icon = opt.icon ? hudIcon(opt.icon) : s.icon;
    if (s.value === str && s.warn === warn && s.icon === icon) return;
    const next = list.slice(); next[i] = Object.assign({}, s, { value: str, warn, icon }); hudStore.set({ stats: next });
  },
  removeStat(key) { const list = hudStore.get().stats; if (list.some(s => s.key === key)) hudStore.set({ stats: list.filter(s => s.key !== key) }); },
  hp(cur, max = 100) {
    const prev = hudStore.get().hp;
    if (!prev) gameStore.set({ hintVisible: false }); // the controls hint sits where the health bar goes
    const c = Math.ceil(Math.max(0, cur)), k = clamp(cur / max, 0, 1);
    if (prev && prev.cur === c && prev.max === max && Math.abs(prev.k - k) < 0.002) return;
    hudStore.set({ hp: { cur: c, max, k } });
  },
  hideHp() { if (hudStore.get().hp) hudStore.set({ hp: null }); },
  // Big message in the middle of the screen. kind: info, good, bad.
  flash(text, kind = 'info', ms = 1700) {
    const id = ++flashSeq; hudStore.set({ flash: { id, text: String(text), kind } });
    clearTimeout(this.flashT); this.flashT = setTimeout(() => { const f = hudStore.get().flash; if (f && f.id === id) hudStore.set({ flash: null }); }, ms);
  },
  // Leaderboard rows: [{name, value, me}], or null to hide. Shows the first 6.
  board(rows, title = 'Scores') {
    if (!rows || !rows.length) { if (hudStore.get().board) hudStore.set({ board: null }); return; }
    const b = { title, rows: rows.slice(0, 6).map(r => ({ name: String(r.name), value: String(r.value), me: !!r.me })) };
    const prev = hudStore.get().board;
    if (prev && prev.title === b.title && JSON.stringify(prev.rows) === JSON.stringify(b.rows)) return;
    hudStore.set({ board: b });
  },
  prompt(text) { hudStore.set({ prompt: text ? String(text) : '' }); },
  crosshair(on) { hudStore.set({ crosshair: !!on }); },
  hurt() { hudStore.set({ hurt: ++hurtSeq }); },
  // Result card. onAgain/onLeave are kept here (not in the store) and run by Hud.endAction().
  showEnd({ title, sub = '', stats = [], win = true, againLabel = 'Play again', leaveLabel = 'Leave game', onAgain, onLeave }) {
    this._end = { onAgain, onLeave };
    hudStore.set({ end: { title: String(title), sub: String(sub || ''), stats: stats.map(([k, v]) => [String(k), String(v)]), win: !!win, againLabel, leaveLabel, canAgain: !!onAgain } });
  },
  hideEnd() { if (hudStore.get().end) hudStore.set({ end: null }); },
  endAction(which) {
    const cb = this._end && (which === 'again' ? this._end.onAgain : this._end.onLeave);
    this.hideEnd(); if (cb) cb();
  },
  // A centred choice panel (blaster picker, "continue your run"...).
  //   o: {title, text, options: [{id, title, blurb, key, on}], buttons: [{id, label, kind}], onPick(id), onButton(id)}
  panel(o) { this._panel = o; hudStore.set({ panel: { title: o.title || '', text: o.text || '', options: o.options || [], buttons: o.buttons || [] } }); },
  updatePanel(patch) { const p = hudStore.get().panel; if (!p) return; if (this._panel) Object.assign(this._panel, patch); hudStore.set({ panel: Object.assign({}, p, patch) }); },
  closePanel() { this._panel = null; if (hudStore.get().panel) hudStore.set({ panel: null }); },
  panelPick(id) { const o = this._panel; if (o && o.onPick) o.onPick(id); },
  panelButton(id) { const o = this._panel; if (o && o.onButton) o.onButton(id); },
};
