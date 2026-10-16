'use client';
import { useEffect, useState } from 'react';

// Loads the engine (three.js, physics, games) in the browser only, starts it once, and connects the platform
// (session, server API, lobby room). Every PlayForge screen gets the engine module through useEngine().
let enginePromise = null;
export function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const E = await import('@/playforge/engine');
      E.startEngine();
      window.__PF = E; // handy in the browser console and in tests
      try { const P = await import('@/playforge/client/platform'); P.startPlatform(E); }
      catch (e) { console.warn('PlayForge: platform not available yet', e); }
      return E;
    })();
  }
  return enginePromise;
}
export function useEngine() {
  const [E, setE] = useState(null);
  useEffect(() => { let live = true; loadEngine().then(m => { if (live) setE(m); }); return () => { live = false; }; }, []);
  return E;
}
