/* ---------- 14. Home (interim catalogue; replaced by the full home module) ---------- */
function statusLine() {
  if (!Caps.ready) return 'Checking your PlayForge profile…';
  if (Me.id && Caps.db) return Profile.where === 'cloud' ? 'Your skins and name are saved to your profile, so other players see them.' : 'Signed in. Save a skin to store it in your profile.';
  if (Me.id) return 'Signed in. Saving works on this device only for now.';
  return 'Playing as a guest. Your avatar is saved on this device.';
}
// Thumbnails are rendered one at a time while the home screen is idle, then cached for the visit.
const Thumbs = {
  cache: new Map(), queue: [], busy: false, waiters: new Map(),
  get(def, cb) {
    if (this.cache.has(def.id)) { cb(this.cache.get(def.id)); return; }
    if (!this.waiters.has(def.id)) { this.waiters.set(def.id, []); this.queue.push(def); }
    this.waiters.get(def.id).push(cb); this.pump();
  },
  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const run = () => {
      if (Engine.mode !== 'home') { this.busy = false; setTimeout(() => this.pump(), 800); return; }
      const def = this.queue.shift(); let url = '';
      try { World.load(def, { edit: true }); url = World.snapshot(320, 200); } catch (e) { console.warn('PlayForge: thumbnail failed for', def.id, e); }
      World.unload();
      this.cache.set(def.id, url);
      (this.waiters.get(def.id) || []).forEach(f => f(url)); this.waiters.delete(def.id);
      this.busy = false; if (this.queue.length) setTimeout(() => this.pump(), 30);
    };
    (window.requestIdleCallback || (f => setTimeout(f, 40)))(run);
  },
};
const Home = {
  init() {
    $('#home-me').addEventListener('click', () => Editor.enter());
    $('#pc-edit').addEventListener('click', () => Editor.enter());
    $('#pc-play').addEventListener('click', () => Game.enter(gameById('forge-park')));
    $('#home-settings').addEventListener('click', () => openSettings());
    $('#tile-plus').addEventListener('click', () => { Sfx.play('click'); if (typeof Studio !== 'undefined') Studio.newGame(); else toast('Studio is on the way.'); });
    $('#gp-play').addEventListener('click', () => { Modals.close($('#gamepage-modal')); if (this.pageDef) Game.enter(this.pageDef); });
    this.renderTiles();
  },
  tile(d) {
    const t = document.createElement('button'); t.className = 'tile'; t.dataset.game = d.id;
    t.setAttribute('aria-label', `${d.title} by ${d.creator}`);
    t.innerHTML = '<div class="thumb"><img alt=""></div><div class="t-title"></div><div class="t-meta"><span class="t-by"></span><span><span class="dot-online"></span><span class="t-online">Solo</span></span></div>';
    t.querySelector('.t-title').textContent = d.title; t.querySelector('.t-by').textContent = 'by ' + d.creator;
    Thumbs.get(d, url => { if (url) t.querySelector('img').src = url; });
    t.addEventListener('click', () => this.openGamePage(d));
    return t;
  },
  renderTiles() {
    const row = $('#row-mine'); row.querySelectorAll('.tile, .empty-card').forEach(n => n.remove());
    for (const d of GAMES) row.appendChild(this.tile(d));
    this.updateOnline();
  },
  updateOnline() {
    for (const el of $$('#home .tile[data-game]')) {
      const n = Net.lobby ? Net.onlineCount(el.dataset.game) : null, o = el.querySelector('.t-online');
      if (o) o.textContent = n === null ? 'Solo' : `${n} online`;
    }
    if (this.pageDef) { const n = Net.lobby ? Net.onlineCount(this.pageDef.id) : null; $('#gp-online').textContent = n === null ? 'Solo' : n === 1 ? '1 player here now' : `${n} players here now`; }
  },
  openGamePage(d) {
    this.pageDef = d;
    $('#gp-title').textContent = d.title; $('#gp-img').removeAttribute('src'); Thumbs.get(d, url => { if (url && this.pageDef === d) $('#gp-img').src = url; });
    $('#gp-creator').textContent = 'by ' + d.creator; $('#gp-desc').textContent = d.desc || '';
    this.updateOnline(); Modals.open($('#gamepage-modal'));
  },
  renderMe() {
    const name = Profile.displayName();
    $('#home-me-name').textContent = name; $('#pc-name').textContent = name;
    drawHead($('#home-me-head'), Skins.worn); drawFigure($('#home-fig'), Skins.worn);
    $('#pc-status').textContent = statusLine();
  },
  onReturn() { Thumbs.pump(); },
};
