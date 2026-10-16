// Small observable stores shared by the engine (writers) and the React UI (readers).
// React reads them with useStore(store) (see components/playforge/useStore.js), which uses useSyncExternalStore.
// A store's state object is replaced on every change, so React sees a new snapshot; writers only call set()
// when a value really changed, because some writers run every frame.

export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    // set(patch) merges a partial object; set(fn) receives the current state and returns a patch.
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      if (!p) return;
      let changed = false;
      for (const k in p) if (state[k] !== p[k]) { changed = true; break; }
      if (!changed) return;
      state = Object.assign({}, state, p);
      subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } });
    },
    replace(next) { state = next; subs.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// Toasts and confirm dialogs. The React shell renders uiStore.toast and uiStore.choice.
export const uiStore = createStore({ toast: null, choice: null });
let toastSeq = 0, toastTimer = 0;
export function toast(msg, warn) {
  uiStore.set({ toast: { id: ++toastSeq, msg: String(msg), warn: !!warn } });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => uiStore.set({ toast: null }), 2800);
}
// askChoice({title, body, buttons: [{label, value, kind: 'ember' | 'danger'}]}) -> Promise<value | 'cancel'>
export function askChoice({ title, body, buttons }) {
  return new Promise(resolve => {
    const prev = uiStore.get().choice; if (prev) prev.resolve('cancel');
    let done = false;
    const choice = {
      title: String(title || ''), body: String(body || ''), buttons: buttons || [],
      resolve(v) { if (done) return; done = true; if (uiStore.get().choice === choice) uiStore.set({ choice: null }); resolve(v); },
    };
    uiStore.set({ choice });
  });
}

// In-game HUD. Hud (hud.js) writes it; components/playforge/game/Hud.js renders it.
//   stats: [{key, value, icon, label, warn}] in insertion order
//   actions: [{id, label, icon, keyLabel, primary, disabled, held}]
//   panel: {title, text, options: [{id, title, blurb, key, on}], buttons: [{id, label, kind}], onPick(id), onButton(id)} | null
//   end: {title, sub, stats: [[label, value]], win, againLabel, leaveLabel, canAgain} | null
export const hudStore = createStore({
  objective: '', stats: [], hp: null, board: null, flash: null, prompt: '', crosshair: false, hurt: 0,
  actions: [], panel: null, end: null,
});

// Game screen chrome: loading card, title, hint, test-mode Stop button, menu state, fps readout.
export const gameStore = createStore({
  active: false, loading: false, loadingTitle: '', title: '', test: false, hint: '', hintVisible: false,
  menuOpen: false, fps: '', mp: false, chatOpen: false,
});

// PlayForge server status, written by playforge/client/platform.js: ready = start-up finished (online or not),
// online = the server answered (sessions, publishing, likes), connected = the live socket is up (rooms),
// user = {id, name, nick} | null. Published games and likes are in libraryStore (library.js).
export const platformStore = createStore({ ready: false, online: false, connected: false, user: null });
