'use client';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { LazyCtx, makeWatcher } from './lazy';
import { Hero, PlusTile, Tile } from './Tiles';

const HAS_IO = typeof window !== 'undefined' && 'IntersectionObserver' in window;

// One shelf: heading, See all, scroll arrows (mouse) and a sideways row of tiles (or Featured heroes).
// items: entries; shown: how many tiles to draw (Popular and New are capped); empty: [title, text] when there are none.
export function Row({ E, def, items, likes, online, onOpen, onPlay, onMake, onSeeAll, empty }) {
  const home = useContext(LazyCtx);
  const sec = useRef(null), row = useRef(null);
  const [rowNear, setRowNear] = useState(!HAS_IO);
  const [side, setSide] = useState(null);
  const [arrows, setArrows] = useState({ prev: true, next: true, scrolls: false });

  // Is this row near the screen (vertically)? Its tiles only load pictures while it is.
  useEffect(() => (home && sec.current ? home.watch(sec.current, setRowNear) : undefined), [home]);
  // Which tiles are near the visible part of the row (sideways)?
  useEffect(() => { const w = makeWatcher(row.current, '0px 60%'); setSide(w); return () => w.disconnect(); }, []);
  const ctx = useMemo(() => (side ? { watch: side.watch, gate: rowNear } : null), [side, rowNear]);

  const update = useCallback(() => {
    const r = row.current; if (!r) return;
    const max = r.scrollWidth - r.clientWidth - 2;
    const next = { prev: r.scrollLeft <= 2, next: r.scrollLeft >= max, scrolls: max > 2 };
    setArrows(a => (a.prev === next.prev && a.next === next.next && a.scrolls === next.scrolls ? a : next));
  }, []);
  useEffect(() => {
    const r = row.current; let raf = 0, t = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    const onResize = () => { clearTimeout(t); t = setTimeout(update, 150); };
    r.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => { r.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); clearTimeout(t); };
  }, [update]);
  const shown = def.limit ? items.slice(0, def.limit) : items;
  useEffect(update, [update, shown.length]);

  const scrollBy = dir => { const r = row.current; r.scrollBy({ left: dir * r.clientWidth * 0.85, behavior: 'smooth' }); };
  const hid = 'sh-' + def.id;
  return (
    <section ref={sec} className={'shelf' + (def.hero ? ' shelf-hero' : '') + (arrows.scrolls ? ' scrolls' : '')} data-row={def.id} data-near={rowNear ? '' : undefined} aria-labelledby={hid} onPointerEnter={update}>
      <div className="shelf-head">
        <div className="sh-text"><h2 id={hid}>{def.title}</h2><small>{def.sub}</small></div>
        <div className="sh-acts">
          {!def.hero && items.length >= 5 ? (
            <button type="button" className="sh-all" aria-label={`See all ${items.length} games in ${def.title}`} onClick={() => onSeeAll(def.id)}>See all {items.length}</button>
          ) : null}
          <button type="button" className="icon-btn sh-arrow" aria-label={`Scroll ${def.title} back`} disabled={arrows.prev} onClick={() => scrollBy(-1)}><Icon name="back" /></button>
          <button type="button" className="icon-btn sh-arrow sh-next" aria-label={`Scroll ${def.title} forward`} disabled={arrows.next} onClick={() => scrollBy(1)}><Icon name="back" /></button>
        </div>
      </div>
      <div ref={row} className={'tile-row' + (def.hero ? ' hero-row' : '')}>
        <LazyCtx.Provider value={ctx}>
          {def.plus ? <PlusTile onClick={onMake} /> : null}
          {shown.map(e => (def.hero
            ? <Hero key={e.key} E={E} entry={e} online={online(e)} onOpen={onOpen} onPlay={onPlay} />
            : <Tile key={e.key} E={E} entry={e} likes={likes(e)} online={online(e)} onOpen={onOpen} />))}
          {!shown.length && empty ? (
            <div className={'empty-card ' + (def.plus ? 'empty-side' : 'empty-row')}><strong>{empty[0]}</strong><span>{empty[1]}</span></div>
          ) : null}
        </LazyCtx.Provider>
      </div>
    </section>
  );
}
