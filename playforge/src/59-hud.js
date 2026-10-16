/* ---------- 11b. HUD for games ---------- */
// Icons available to stat chips and action buttons (ids from the SVG sprite, without "i-").
const HUD_ICONS = ['clock', 'coin', 'skull', 'flag', 'star', 'moon', 'sun', 'log', 'fire', 'target', 'trophy', 'axe', 'bolt', 'blaster', 'shield', 'key', 'gem', 'drop', 'heart', 'users', 'hand', 'jump', 'play', 'berry', 'eye'];
const iconSvg = name => `<svg class="i" aria-hidden="true"><use href="#i-${HUD_ICONS.includes(name) ? name : 'star'}"/></svg>`;
function fmtTime(s) {
  s = Math.max(0, s); const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
}
function fmtClock(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
const Hud = {
  stats: new Map(), flashT: 0, el: {},
  init() {
    this.el = {
      obj: $('#hud-obj'), stats: $('#hud-stats'), hp: $('#hud-hp'), hpFill: $('#hud-hp-fill'), hpText: $('#hud-hp-text'), board: $('#hud-board'),
      flash: $('#hud-flash'), prompt: $('#hud-prompt'), cross: $('#hud-cross'), vig: $('#hud-vig'), end: $('#hud-end'),
    };
  },
  reset() {
    this.objective(null); this.stats.clear(); this.el.stats.textContent = ''; this.hideHp(); this.board(null);
    this.el.flash.className = 'hud-flash'; this.el.flash.textContent = ''; this.prompt(null); this.crosshair(false); this.hideEnd();
  },
  objective(text) { const o = this.el.obj; o.hidden = !text; o.textContent = text || ''; },
  // A small chip in the top stats row: Hud.stat('time', '1:02.4', {icon: 'clock', label: 'Time'}).
  stat(key, value, opt = {}) {
    let s = this.stats.get(key);
    if (!s) {
      const el = document.createElement('div'); el.className = 'hud-stat';
      el.innerHTML = iconSvg(opt.icon || 'star') + '<span class="v"></span>';
      if (opt.label) el.setAttribute('aria-label', opt.label);
      this.el.stats.appendChild(el); s = { el, v: el.querySelector('.v'), last: null }; this.stats.set(key, s);
    }
    const str = String(value); if (str !== s.last) { s.v.textContent = str; s.last = str; }
    s.el.classList.toggle('warn', !!opt.warn);
  },
  removeStat(key) { const s = this.stats.get(key); if (s) { s.el.remove(); this.stats.delete(key); } },
  hp(cur, max = 100) {
    if (this.el.hp.hidden) { const hint = $('#hud-hint'); if (hint) hint.style.opacity = '0'; }
    this.el.hp.hidden = false; const k = clamp(cur / max, 0, 1);
    this.el.hpFill.style.width = (k * 100).toFixed(1) + '%'; this.el.hpFill.classList.toggle('low', k < 0.3);
    this.el.hpText.textContent = Math.ceil(Math.max(0, cur)) + ' / ' + max;
  },
  hideHp() { this.el.hp.hidden = true; },
  // Big message in the middle of the screen. kind: info, good, bad.
  flash(text, kind = 'info', ms = 1700) {
    const f = this.el.flash; f.textContent = text; f.className = 'hud-flash show ' + kind;
    clearTimeout(this.flashT); this.flashT = setTimeout(() => { f.className = 'hud-flash'; }, ms);
  },
  // Leaderboard rows: [{name, value, me}], or null to hide.
  board(rows, title = 'Scores') {
    const b = this.el.board;
    if (!rows || !rows.length) { b.hidden = true; return; }
    b.hidden = false; b.textContent = '';
    const h = document.createElement('div'); h.className = 'hb-title'; h.textContent = title; b.appendChild(h);
    rows.slice(0, 6).forEach(r => {
      const row = document.createElement('div'); row.className = 'hb-row' + (r.me ? ' me' : '');
      const n = document.createElement('span'); n.textContent = r.name; const v = document.createElement('b'); v.textContent = String(r.value);
      row.append(n, v); b.appendChild(row);
    });
  },
  prompt(text) { const p = this.el.prompt; p.hidden = !text; if (text) p.textContent = text; },
  crosshair(on) { this.el.cross.hidden = !on; },
  hurt() { const v = this.el.vig; v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); },
  showEnd({ title, sub = '', stats = [], win = true, againLabel = 'Play again', leaveLabel = 'Leave game', onAgain, onLeave }) {
    const e = this.el.end; e.hidden = false; e.classList.toggle('lose', !win);
    $('#end-title').textContent = title; $('#end-sub').textContent = sub; $('#end-sub').hidden = !sub;
    const dl = $('#end-stats'); dl.textContent = '';
    for (const [k, v] of stats) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = String(v); dl.append(dt, dd); }
    const again = $('#end-again'), leave = $('#end-leave');
    again.textContent = againLabel; again.hidden = !onAgain; leave.textContent = leaveLabel;
    again.onclick = () => { this.hideEnd(); if (onAgain) onAgain(); };
    leave.onclick = () => { this.hideEnd(); if (onLeave) onLeave(); };
    setTimeout(() => (onAgain ? again : leave).focus({ preventScroll: true }), 60);
  },
  hideEnd() { this.el.end.hidden = true; },
};
