import { $, Caps, IS_TOUCH, Me, Modals, Profile, Settings, Sfx, showScreen, useCap } from './core.js';
import { Engine } from './render.js';
import { Input, isTyping } from './input.js';
import { Hud } from './hud.js';
import { Game, gameById } from './game.js';
import { Editor } from './skin-editor.js';
import { Skins } from './skins.js';
import { bindSettings } from './settings-ui.js';
import { Home } from './home.js';
import { Library } from './library.js';
import { Net } from './net.js';
import { Studio } from './studio.js';

/* ---------- 15. Loop and boot ---------- */
export const Loop = { last: 0, n: 0, acc: 0, fps: 60, errs: 0 };
export function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000, dt = Math.min(0.1, Math.max(0, now - (Loop.last || now))); Loop.last = now;
  if (document.hidden || Engine.mode === 'home') return;
  try { const v = Engine.views[Engine.mode]; if (v && v.frame) v.frame(dt); }
  catch (err) { if (Loop.errs++ < 5) console.error(err); }
  Loop.n++; Loop.acc += dt;
  if (Loop.acc >= 1) { Loop.fps = Loop.n / Loop.acc; Loop.n = 0; Loop.acc = 0; onSecond(); }
}
export function onSecond() {
  if (Engine.mode !== 'game') return;
  if (Settings.dynamicRes) {
    const s = Engine.dynScale;
    if (Loop.fps < 28 && s > 0.55) Engine.dynScale = Math.max(0.55, s - 0.1);
    else if (Loop.fps > 50 && s < 1) Engine.dynScale = Math.min(1, s + 0.05);
    if (Engine.dynScale !== s) Engine.applyPixelRatio();
  }
  if (Settings.showFps) $('#hud-fps').textContent = `${Math.round(Loop.fps)} fps · ${Engine.renderer.getPixelRatio().toFixed(2)}×`;
}
export async function initCaps() {
  const wait = name => Promise.race([useCap(name), new Promise(r => setTimeout(() => r(null), 12000))]);
  Caps.roomP = wait('room');
  Caps.roomP.then(room => { Caps.room = room; Net.initLobby(room); Home.updateOnline(); });
  const [user, db, downloads] = await Promise.all([wait('user'), wait('db'), wait('downloads')]);
  Caps.user = user; Caps.db = db; Caps.downloads = downloads;
  if (user) {
    try { const me = await user.me(); Me.id = me.id || null; Me.accountName = (me.name || '').slice(0, 40); if (me.color) Me.color = me.color; }
    catch (e) { /* stay a guest */ }
    try { Caps.canWrite = await user.can('data.write'); } catch (e) { Caps.canWrite = null; }
  }
  $('#av-export').hidden = !downloads;
  await Profile.attachCloud();
  Caps.ready = true;
  Library.init();
  await Skins.refreshWorn();
  Profile.emit();
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const top = Modals.top();
    if (top) { e.preventDefault(); Modals.close(top); return; }
    if (Engine.mode === 'game') { Game.openMenu(); return; }
    if (Engine.mode === 'avatar') { Editor.back(); return; }
    const v = Engine.views[Engine.mode]; if (v && v.onEscape) { v.onEscape(e); return; }
  }
  if (Engine.mode === 'avatar' && !isTyping(e) && !Modals.top()) Editor.onKey(e);
  else if (Engine.mode !== 'game' && !isTyping(e) && !Modals.top()) { const v = Engine.views[Engine.mode]; if (v && v.onKey) v.onKey(e); }
  if (Engine.mode === 'game' && Net.room && !isTyping(e) && !Modals.top() && (e.key === 'Enter' || e.key === '/')) { e.preventDefault(); Net.focusChat(); }
});
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('pointerdown', () => Sfx.unlock(), { passive: true });

export let started = false;
export function start(hot) {
  if (started) return; started = true; hot = hot || {};
  const boot = $('#boot');
  if (!window.THREE) { $('#boot-msg').textContent = "The 3D engine didn't load. Check your connection, then reload this page."; return; }
  try {
    if (IS_TOUCH) document.body.classList.add('touch');
    Profile.loadLocal();
    Engine.init();
    Skins.init();
    Hud.init(); Game.init(); Editor.init(); Home.init(); bindSettings(); Input.init(); Net.init();
    if (typeof Studio !== 'undefined') Studio.init();
    Profile.onChange(() => { Home.renderMe(); Editor.onProfileChanged(); Game.avatar.setName(Profile.displayName()); Net.updateIdentity(); });
    Home.renderMe();
    Skins.refreshWorn().then(() => Home.renderMe());
    showScreen('home');
    boot.style.opacity = '0'; setTimeout(() => boot.remove(), 340);
    requestAnimationFrame(frame);
    initCaps();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Game.avatar.redrawTag(); Editor.avatar.redrawTag(); });
    if (hot.mode === 'avatar') Editor.enter({ skin: hot.skin, slot: hot.slot, dirty: hot.dirty });
    else if (hot.mode === 'game' && gameById(hot.game)) Game.enter(gameById(hot.game));
  } catch (err) {
    console.error(err);
    $('#boot-msg').textContent = 'PlayForge hit a problem while starting. Reload the page to try again.';
  }
}
export const HOT = window.claude && window.claude.hot;
if (HOT && typeof HOT.snapshot === 'function') {
  try { HOT.snapshot(() => ({ mode: Engine.mode, game: Game.def && Game.def.id, slot: Editor.slot, dirty: Editor.dirty, skin: Engine.mode === 'avatar' && Editor.work ? Editor.work.toDataURL('image/png') : null })); } catch (e) { /* optional */ }
}
if (HOT && typeof HOT.ready === 'function') {
  try { HOT.ready(start); } catch (e) { start({}); }
  setTimeout(() => start((HOT && HOT.data) || {}), 3000);
} else start((HOT && HOT.data) || {});
