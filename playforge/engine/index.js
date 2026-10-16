// PlayForge engine entry point. Browser only: load it with `await import('@/playforge/engine')` (or through
// components/playforge/useEngine.js) after the page mounts, never at module top level of a server-rendered file.
import { Profile, Settings } from './core.js';
import { Engine } from './render.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { Skins } from './skins.js';
import { gameStore } from './stores.js';
// Rule sets and built-in games register themselves on import (Forge Park first).
import './modes-base.js';
import './games/arena.js';
import './games/nights.js';
import './games/obby.js';
import './games/party.js';

export * from './core.js';
export { createStore, uiStore, hudStore, gameStore } from './stores.js';
export { Engine, partMaterial, buildPartMesh } from './render.js';
export { Input, isTyping } from './input.js';
export { Hud, HUD_ICONS, hudIcon, fmtTime, fmtClock } from './hud.js';
export { Game, GAMES, Modes, gameById, registerGames, getBest, saveBest } from './game.js';
export { World, ENV, ENV_KEYS, BEHAVIORS, mkPart, normPart, finite3 } from './world.js';
export { Phys } from './physics.js';
export { Bots } from './bots.js';
export { Fx } from './fx.js';
export { Skins, STARTER_CANVASES, PALETTE } from './skins.js';
export { createAvatar, makeSkinTexture } from './avatar.js';

/* ---------- Loop ---------- */
export const Loop = { last: 0, n: 0, acc: 0, fps: 60, errs: 0, running: false };
function frame(ts) {
  requestAnimationFrame(frame);
  const now = ts / 1000, dt = Math.min(0.1, Math.max(0, now - (Loop.last || now))); Loop.last = now;
  if (document.hidden || Engine.mode === 'home') return;
  try { const v = Engine.views[Engine.mode]; if (v && v.frame) v.frame(dt); }
  catch (err) { if (Loop.errs++ < 5) console.error(err); }
  Loop.n++; Loop.acc += dt;
  if (Loop.acc >= 1) { Loop.fps = Loop.n / Loop.acc; Loop.n = 0; Loop.acc = 0; onSecond(); }
}
function onSecond() {
  if (Engine.mode !== 'game') return;
  if (Settings.dynamicRes) {
    const s = Engine.dynScale;
    if (Loop.fps < 28 && s > 0.55) Engine.dynScale = Math.max(0.55, s - 0.1);
    else if (Loop.fps > 50 && s < 1) Engine.dynScale = Math.min(1, s + 0.05);
    if (Engine.dynScale !== s) Engine.applyPixelRatio();
  }
  gameStore.set({ fps: Settings.showFps ? `${Math.round(Loop.fps)} fps · ${Engine.renderer.getPixelRatio().toFixed(2)}×` : '' });
}

/* ---------- Start-up ---------- */
// Idempotent. Creates the renderer, the worn skin, the in-game avatar and the input listeners, then starts the loop.
// Screens attach the renderer's canvas to their own host element with Engine.attach(el).
let started = false;
export function startEngine() {
  if (started) return; started = true;
  Profile.loadLocal();
  Engine.init();
  Skins.init();
  Hud.init(); Game.init(); Input.init();
  Skins.refreshWorn();
  if (!Loop.running) { Loop.running = true; requestAnimationFrame(frame); }
}
