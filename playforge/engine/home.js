import { Caps, Me, Profile } from './core.js';
import { Engine } from './render.js';
import { World } from './world.js';
import { platformStore } from './stores.js';

/* ---------- 14. Home helpers: thumbnails and the player card's status line ----------
   The home screen itself is React (components/playforge/home). This module only renders level thumbnails with the
   shared WebGL renderer while no other screen uses it, and words the player card's status line. No DOM lookups. */

// One line under the player's name on the home screen. Depends on platformStore (ready, online) and Profile.where.
export function statusLine() {
  const p = platformStore.get();
  if (!p.ready && !Caps.ready) return 'Checking your PlayForge profile…';
  if (Caps.online && Me.id) {
    return Profile.where === 'cloud'
      ? 'Your skins and name are saved to your profile. Other players see them.'
      : 'Playing as a guest. Save a skin or a name so other players see it.';
  }
  return "Can't reach PlayForge, so you play solo. Your avatar is saved here.";
}

// Thumbnails are rendered one at a time while the home screen is idle (Engine.mode 'home'), then cached in memory
// for the visit (the cache outlives the home screen, so coming back shows them at once).
// The cache key is def.thumbKey when given (drafts add their updatedAt so an edited draft gets a fresh picture), else def.id.
export const Thumbs = {
  W: 400, H: 250, cache: new Map(), queue: [], busy: false, waiters: new Map(),
  key(def) { return def.thumbKey || def.id; },
  peek(def) { return this.cache.get(this.key(def)); },
  // get(def, cb(url), urgent): url is '' when the level could not be drawn. urgent = true jumps the queue
  // (the game page asks for its picture this way).
  get(def, cb, urgent) {
    const k = this.key(def);
    if (this.cache.has(k)) { cb(this.cache.get(k)); return; }
    if (!this.waiters.has(k)) { this.waiters.set(k, []); if (urgent) this.queue.unshift(def); else this.queue.push(def); }
    else if (urgent) { const i = this.queue.findIndex(d => this.key(d) === k); if (i > 0) this.queue.unshift(this.queue.splice(i, 1)[0]); }
    this.waiters.get(k).push(cb); this.pump();
  },
  // Drop a callback; when nobody waits for that picture any more it leaves the queue.
  cancel(def, cb) {
    const k = this.key(def), w = this.waiters.get(k); if (!w) return;
    const i = w.indexOf(cb); if (i >= 0) w.splice(i, 1);
    if (!w.length) { this.waiters.delete(k); const qi = this.queue.findIndex(d => this.key(d) === k); if (qi >= 0) this.queue.splice(qi, 1); }
  },
  store(k, url) {
    const m = /^draft:([^:]+):/.exec(k); // keep one picture per draft
    if (m) for (const old of [...this.cache.keys()]) if (old !== k && old.startsWith('draft:' + m[1] + ':')) this.cache.delete(old);
    this.cache.set(k, url);
  },
  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const run = () => {
      // Another screen (a game, Studio, the avatar editor) owns the renderer: try again later.
      if (Engine.mode !== 'home' || !Engine.renderer) { this.busy = false; if (this.queue.length) setTimeout(() => this.pump(), 800); return; }
      const def = this.queue.shift(); if (!def) { this.busy = false; return; }
      const k = this.key(def); let url = '';
      try {
        World.load(def, { edit: true });
        // Long courses sit far from the thumbnail camera: push the fog back so the level shows, not just haze.
        const tc = World.thumbCam && World.thumbCam(), fog = World.scene && World.scene.fog;
        if (tc && fog) {
          const d = Math.hypot(tc.pos[0] - tc.look[0], tc.pos[1] - tc.look[1], tc.pos[2] - tc.look[2]);
          fog.near = Math.max(fog.near, d * 0.85); fog.far = Math.max(fog.far, d * 2.6);
        }
        url = World.snapshot(this.W, this.H);
      } catch (e) { console.warn('PlayForge: thumbnail failed for', def.id, e); }
      try { World.unload(); } catch (e) { /* nothing loaded */ }
      this.store(k, url);
      const w = this.waiters.get(k) || []; this.waiters.delete(k);
      w.forEach(f => { try { f(url); } catch (e) { console.error(e); } });
      this.busy = false; if (this.queue.length) setTimeout(() => this.pump(), 30);
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 700 }); else setTimeout(run, 40);
  },
};

// TEMPORARY: studio.js and skin-editor.js (other workstreams) still import Home and call these. They do nothing now:
// the React home screen re-reads the Library and the profile whenever it shows. Remove once nothing imports it.
export const Home = { onReturn() {}, renderMe() {}, updateOnline() {} };
