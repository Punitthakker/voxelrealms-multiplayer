'use client';
import { memo, useMemo, useRef, useState } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { Icon } from '../Icon';
import { useNear, useThumb } from './lazy';
import { ago, badge, catLabel, fmtCount, isLight, thumbSrc } from './catalog';

// A game picture: the designed placeholder (accent colour and icon) with the level thumbnail fading in over it.
// want: start loading (the tile is near the screen); urgent: jump the thumbnail queue (the game page).
export function Thumb({ E, entry, className = '', want, urgent, children }) {
  const src = useMemo(() => thumbSrc(E, entry), [E, entry]);
  const { url, loading } = useThumb(E, src, want, urgent);
  const [shown, setShown] = useState('');
  const accent = entry.accent;
  const cls = 'thumb' + (className ? ' ' + className : '') + (isLight(E, accent) ? ' light' : '') + (loading ? ' loading' : '') + (url && shown === url ? ' ready' : '');
  return (
    <span className={cls} style={{ '--accent': accent, '--accent-2': E.shade(accent, -0.45) }}>
      <span className="ph" aria-hidden="true">
        <Icon name={entry.icon} className="ph-big" />
        <span className="ph-icon"><Icon name={entry.icon} /></span>
      </span>
      {url ? <img src={url} alt="" decoding="async" draggable={false} onLoad={() => setShown(url)} /> : null}
      {children}
    </span>
  );
}

// "N online" (or "Solo" while the lobby isn't connected). n: players now, or null.
export function OnlineTag({ n }) {
  return (
    <span className={'t-on' + (n ? ' live' : '')}>
      <i className="dot-online" />
      <span className="t-online">{n == null ? 'Solo' : `${n} online`}</span>
    </span>
  );
}

// The label inside a Play link: "Loading…" while Next fetches the game route.
export function PlayLabel({ className = 'lbl', id }) {
  const { pending } = useLinkStatus();
  return <span className={className} id={id}>{pending ? 'Loading…' : 'Play'}</span>;
}

export function tileLabel(entry, likes, online) {
  const b = badge(entry), solo = entry.kind === 'draft' && !entry.published;
  return `${entry.title}, by ${entry.creator}` + (b ? `, ${b.toLowerCase()}` : '') + (likes ? `, ${likes} ${likes === 1 ? 'like' : 'likes'}` : '')
    + (solo ? '' : '. ' + (online == null ? 'Solo play' : `${online} online`));
}

// A game tile in a row or in the results grid. Opens the game page.
export const Tile = memo(function Tile({ E, entry, likes, online, onOpen }) {
  const ref = useRef(null);
  const near = useNear(ref);
  const b = badge(entry), solo = entry.kind === 'draft' && !entry.published;
  return (
    <button ref={ref} type="button" className="tile" data-key={entry.key} data-near={near ? '' : undefined} aria-label={tileLabel(entry, likes, online)} onClick={() => onOpen(entry, ref.current)}>
      <Thumb E={E} entry={entry} want={near}>
        {b ? <span className={'badge badge-' + b.toLowerCase()}>{b}</span> : null}
        {likes > 0 ? <span className="likes"><Icon name="heart" fill /><span>{fmtCount(likes)}</span></span> : null}
      </Thumb>
      <span className="t-title">{entry.title}</span>
      <span className="t-meta">
        <span className="t-by">by {entry.creator}</span>
        {solo ? <span className="t-on">{ago(entry.updatedAt).replace('Edited ', '')}</span> : <OnlineTag n={online} />}
      </span>
    </button>
  );
});

// A big Featured card: picture, kind, title, description, Play and the online count. The card opens the game page.
export const Hero = memo(function Hero({ E, entry, online, onOpen, onPlay }) {
  const ref = useRef(null), open = useRef(null);
  const near = useNear(ref);
  return (
    <article ref={ref} className="hero" data-key={entry.key} style={{ '--accent': entry.accent }}>
      <Thumb E={E} entry={entry} className="hero-art" want={near} />
      <span className="hero-shade" />
      <button ref={open} type="button" className="hero-open" aria-label={`${entry.title}, by ${entry.creator}. Open game page`}
        onClick={() => onOpen(entry, open.current)} onContextMenu={ev => { ev.preventDefault(); onOpen(entry, open.current); }} />
      <div className="hero-body">
        <span className="hero-kicker">{catLabel(entry) || 'Featured'}</span>
        <h3 className="hero-title">{entry.title}</h3>
        <p className="hero-desc">{entry.desc}</p>
        <div className="hero-cta">
          <Link href={`/g/${entry.id}`} scroll={false} className="btn btn-ember hero-play" aria-label={'Play ' + entry.title} onClick={onPlay}>
            <Icon name="play" fill /><PlayLabel />
          </Link>
          <OnlineTag n={online} />
        </div>
      </div>
    </article>
  );
});

// The first tile of Your games: a new game from a baseplate.
export function PlusTile({ onClick }) {
  return (
    <Link href="/studio/new" scroll={false} className="tile tile-plus" aria-label="Make a new game" onClick={onClick}>
      <span className="thumb plus-art"><span className="plus"><Icon name="plus" /></span></span>
      <span className="t-title">New game</span>
      <span className="t-meta">Start from a baseplate</span>
    </Link>
  );
}
