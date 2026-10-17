'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

// Lazy thumbnails. A picture is drawn only when its tile comes near the screen:
//  - the home screen scrolls vertically inside #home, so one observer with root #home (280 px margin) tells which
//    rows and grid tiles are near;
//  - each row scrolls sideways and clips its tiles, so a row has its own observer (root = the row, 60% margin)
//    for the tiles near its visible part. A row tile wants its picture when both say yes.
// Without IntersectionObserver every picture loads.
const HAS_IO = typeof window !== 'undefined' && 'IntersectionObserver' in window;

export function makeWatcher(root, rootMargin) {
  if (!HAS_IO) return { watch(el, cb) { cb(true); return () => {}; }, disconnect() {} };
  const cbs = new Map();
  const io = new IntersectionObserver(entries => {
    for (const en of entries) { const cb = cbs.get(en.target); if (cb) cb(en.isIntersecting); }
  }, { root, rootMargin });
  return {
    watch(el, cb) { cbs.set(el, cb); io.observe(el); return () => { cbs.delete(el); io.unobserve(el); }; },
    disconnect() { io.disconnect(); cbs.clear(); },
  };
}

// {watch(el, cb(near)) -> unwatch, gate: false while the whole row is far away}. null: not ready yet.
export const LazyCtx = createContext(null);

// true while the element is near the screen (per the nearest LazyCtx).
export function useNear(ref) {
  const ctx = useContext(LazyCtx);
  const [near, setNear] = useState(!HAS_IO);
  useEffect(() => {
    const el = ref.current; if (!ctx || !el) return;
    return ctx.watch(el, setNear);
  }, [ctx, ref]);
  return near && (!ctx || ctx.gate !== false);
}

// The picture for a thumbSrc() source: {url, loading}. want: start loading (the tile is near); urgent: the game page.
// Rendered pictures come from E.Thumbs (one at a time, cached for the visit); stored jpegs show as they are.
export function useThumb(E, src, want, urgent) {
  const key = src ? src.key : '';
  const srcRef = useRef(src); srcRef.current = src;
  const [st, setSt] = useState({ key: '', url: '', loading: false });
  const cached = src && src.def ? E.Thumbs.cache.get(key) : undefined;
  useEffect(() => {
    const s = srcRef.current;
    if (!s || !want) { setSt(p => (p.key === key ? (p.loading ? { key, url: p.url, loading: false } : p) : { key, url: '', loading: false })); return; }
    if (s.url) { setSt({ key, url: s.url, loading: false }); return; }
    const def = s.def();
    const c = E.Thumbs.peek(def);
    if (c !== undefined) { setSt({ key, url: c, loading: false }); return; }
    let live = true;
    const cb = url => { if (live) setSt({ key, url, loading: false }); };
    setSt({ key, url: '', loading: true });
    E.Thumbs.get(def, cb, !!urgent);
    return () => { live = false; E.Thumbs.cancel(def, cb); };
  }, [E, key, want, urgent]);
  if (st.key === key && st.url) return st;
  if (cached !== undefined) return { key, url: cached, loading: false };
  return st.key === key ? st : { key, url: '', loading: false };
}
