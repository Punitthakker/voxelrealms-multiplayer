'use client';
import { useEffect, useState } from 'react';

// Loads the engine (three.js, physics, games) in the browser only, starts it once, and connects the platform
// (session, server API, lobby room). Every PlayForge screen gets the engine module through useEngine().
let enginePromise = null, engineReady = null; // engineReady: the module once loaded (null during the first page load and hydration)
export function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const E = await import('@/playforge/engine');
      E.startEngine();
      window.__PF = E; // handy in the browser console and in tests
      try { const P = await import('@/playforge/client/platform'); P.startPlatform(E); }
      catch (e) { console.warn('PlayForge: platform not available yet', e); }
      engineReady = E;
      return E;
    })();
  }
  return enginePromise;
}
export function useEngine() {
  // After the first page load the engine is already there: screens a client-side navigation mounts get it at once.
  const [E, setE] = useState(engineReady);
  useEffect(() => { let live = true; loadEngine().then(m => { if (live) setE(m); }); return () => { live = false; }; }, []);
  return E;
}
