'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useEngine } from '../engine';
import { useStore } from '../useStore';
import { Icon, Mark } from '../Icon';
import { modalOpen } from '../Modal';
import SettingsModal from '../settings/SettingsModal';
import { LazyCtx, makeWatcher } from './lazy';
import { Row } from './Row';
import { Tile } from './Tiles';
import GamePage from './GamePage';
import TextSheet from './TextSheet';
import { ROWS, buildRows, likeKey, makeCatalog, plural, search } from './catalog';
import '@/playforge/web/home.css';

// The PlayForge home screen (/): header with search, your player card, rows of games, search and See all results,
// and the game page sheet. Data comes from the engine's stores: libraryStore (drafts, published games, likes),
// lobbyStore (players in each game now), platformStore (server status), plus Profile changes (name and skin).
// Search (?q=) and See all (?row=) are in the address, so Back and reloading keep them.

// Survives client-side navigation: coming back from a game, the rows are where you left them.
const memo = { rowsScroll: 0 };
const ROW_IDS = new Set(ROWS.map(r => r.id));
const EMPTY_MINE = ['Your games show up here', 'Start from a blank baseplate, or open any game and tap Edit a copy.'];

export default function Home() {
  const E = useEngine();
  if (!E) return <Boot />;
  return <HomeScreen E={E} />;
}

function Boot() {
  return (
    <div id="boot" className="pf-boot" role="status" aria-live="polite">
      <div className="boot-inner">
        <Mark className="mark" />
        <div className="wordmark">Play<b>Forge</b></div>
        <p id="boot-msg">Warming up the forge…</p>
      </div>
    </div>
  );
}

const urlWith = (key, value) => {
  const u = new URL(window.location.href); u.search = '';
  if (value) u.searchParams.set(key, value);
  return u.pathname + u.search;
};
const sameUrl = url => window.location.pathname + window.location.search === url;
function replaceUrl(url) { if (!sameUrl(url)) { try { window.history.replaceState(null, '', url); } catch (e) { /* not allowed */ } } }

function HomeScreen({ E }) {
  const lib = useStore(E.libraryStore);
  const lobby = useStore(E.lobbyStore);
  const plat = useStore(E.platformStore);
  const [profileRev, setProfileRev] = useState(0);
  const homeRef = useRef(null), qRef = useRef(null), headRef = useRef(null), figRef = useRef(null);

  // ---- engine hooks ----
  // Name and skin changes redraw the card and the creator names on your drafts.
  useEffect(() => {
    const bump = () => setProfileRev(r => r + 1);
    const off = E.Profile.onChange(bump);
    E.Skins.refreshWorn().then(bump, () => {});
    return () => {
      if (typeof off === 'function') off();
      else { const i = E.Profile.listeners.indexOf(bump); if (i >= 0) E.Profile.listeners.splice(i, 1); }
    };
  }, [E]);
  // While home shows, the renderer is free for thumbnails.
  useEffect(() => { if (E.Engine.mode !== 'home') E.Engine.setMode('home'); E.Thumbs.pump(); }, [E]);
  useEffect(() => {
    if (headRef.current) E.drawHead(headRef.current, E.Skins.worn);
    if (figRef.current) E.drawFigure(figRef.current, E.Skins.worn);
  }, [E, profileRev, plat]);

  // ---- data ----
  const name = E.Profile.displayName();
  const userId = plat.user ? plat.user.id : null;
  const drafts = useMemo(() => (lib.rev ? lib.drafts : E.Library.drafts()), [E, lib]);
  const cat = useMemo(() => makeCatalog(E, drafts, lib.published, name), [E, drafts, lib.published, name, userId]);
  const lobbyRef = useRef(lobby); lobbyRef.current = lobby;
  // Popular sorts by likes, then by players now (a snapshot, so tiles don't reshuffle while you look).
  const rows = useMemo(() => buildRows(cat, k => lib.likeCounts.get(k) || 0, id => { const l = lobbyRef.current; return l.live ? l.counts[id] || 0 : 0; }), [cat, lib.likeCounts]);
  const likesOf = useCallback(e => { const k = likeKey(e); return k ? lib.likeCounts.get(k) || 0 : 0; }, [lib.likeCounts]);
  const onlineOf = useCallback(e => (lobby.live ? lobby.counts[e.id] || 0 : null), [lobby]);

  // ---- search and See all ----
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [allRow, setAllRow] = useState(null);
  const view = query.trim() ? 'search' : allRow && ROW_IDS.has(allRow) ? 'all' : 'rows';
  const searchT = useRef(0), pushed = useRef(false), allRef = useRef(allRow), queryRef = useRef(query);
  allRef.current = allRow; queryRef.current = query;

  const readUrl = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    const qq = (p.get('q') || '').slice(0, 60), row = p.get('row');
    clearTimeout(searchT.current);
    setQ(qq); setQuery(qq.trim() ? qq : ''); setAllRow(!qq.trim() && row && ROW_IDS.has(row) ? row : null);
  }, []);
  useLayoutEffect(() => {
    readUrl();
    const onPop = () => { pushed.current = false; readUrl(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readUrl]);
  const applySearch = useCallback(v => {
    clearTimeout(searchT.current);
    const t = v.trim() ? v : '';
    setQuery(t);
    if (t) { setAllRow(null); replaceUrl(urlWith('q', t.trim())); }
    else replaceUrl(allRef.current ? urlWith('row', allRef.current) : urlWith());
  }, []);
  const onSearchInput = ev => {
    const v = ev.target.value; setQ(v);
    clearTimeout(searchT.current); searchT.current = setTimeout(() => applySearch(v), 90);
  };
  useEffect(() => () => clearTimeout(searchT.current), []);
  const leaveResults = useCallback(() => {
    clearTimeout(searchT.current);
    const wasAll = !queryRef.current.trim() && allRef.current;
    setQ(''); setQuery('');
    if (wasAll && pushed.current) { pushed.current = false; window.history.back(); return; } // popstate shows the rows
    setAllRow(null); replaceUrl(urlWith());
  }, []);
  const showAll = useCallback(id => {
    E.Sfx.play('click');
    clearTimeout(searchT.current);
    setQ(''); setQuery(''); setAllRow(id);
    const url = urlWith('row', id);
    if (!sameUrl(url)) { try { window.history.pushState(null, '', url); pushed.current = true; } catch (e) { /* not allowed */ } }
  }, [E]);

  // ---- scrolling ----
  const [scrolled, setScrolled] = useState(false);
  const viewRef = useRef(view);
  const onScroll = useCallback(() => {
    const el = homeRef.current; if (!el) return;
    setScrolled(el.scrollTop > 4);
    if (viewRef.current === 'rows') memo.rowsScroll = el.scrollTop;
  }, []);
  useLayoutEffect(() => { // coming back to home: the rows where you left them
    const el = homeRef.current;
    if (el && viewRef.current === 'rows' && memo.rowsScroll) el.scrollTop = memo.rowsScroll;
  }, []);
  useLayoutEffect(() => { // results start at the top; the rows come back where they were
    const el = homeRef.current, was = viewRef.current; viewRef.current = view;
    if (!el || was === view) return;
    if (was === 'rows') el.scrollTop = 0;
    else if (view === 'rows') el.scrollTop = memo.rowsScroll;
  }, [view]);

  // ---- lazy thumbnails: which rows and grid tiles are near the screen (the #home scroll area) ----
  const [homeWatch, setHomeWatch] = useState(null);
  useEffect(() => { const w = makeWatcher(homeRef.current, '280px 0px'); setHomeWatch(w); return () => w.disconnect(); }, []);
  const homeCtx = useMemo(() => (homeWatch ? { watch: homeWatch.watch } : null), [homeWatch]);

  // ---- game page ----
  const [page, setPage] = useState(null); // {key, snap}: the open game page
  const [likeOv, setLikeOv] = useState(null); // {key, liked, n}: your like before the server confirms it
  const pageRef = useRef(page), likeOvRef = useRef(likeOv), opener = useRef(null), restore = useRef(null), liking = useRef(false);
  pageRef.current = page; likeOvRef.current = likeOv;

  const openEntry = useCallback((e, el) => {
    if (e.kind === 'community' && e.mine && e.local) e = e.local; // your own game: the draft's page, with its owner actions
    E.Sfx.play('click');
    if (!pageRef.current) {
      const from = el || document.activeElement, sec = from && from.closest ? from.closest('[data-row]') : null;
      opener.current = { el: from, row: sec ? sec.dataset.row : null };
      E.Sfx.play('open');
    }
    setLikeOv(null); setPage({ key: e.key, snap: e });
  }, [E]);
  const closePage = useCallback(() => {
    if (!pageRef.current) return;
    restore.current = opener.current; opener.current = null;
    setPage(null); setLikeOv(null);
  }, []);
  // Keyboard users land back on the tile they opened (or the first tile of its row when it is gone).
  useEffect(() => {
    if (page || !restore.current) return;
    const { el, row } = restore.current; restore.current = null;
    if (modalOpen()) return;
    let t = el && el.isConnected ? el : null;
    if (!t && row && homeRef.current) t = homeRef.current.querySelector(`[data-row="${row}"] .tile, [data-row="${row}"] .hero-open`);
    if (t) { try { t.focus({ preventScroll: true }); } catch (err) { /* gone */ } }
  }, [page]);

  let pageEntry = null, gone = false;
  if (page) {
    const k = page.key[0], list = k === 'b' ? cat.builtin : k === 'd' ? cat.drafts : cat.community;
    pageEntry = list.find(x => x.key === page.key) || null;
    // A community game that left the list (unpublished): its page stays, without Play.
    if (!pageEntry && k === 'c') { pageEntry = page.snap; gone = !!(lib.ready && lib.online); }
  }
  const missing = !!page && !pageEntry; // a draft deleted meanwhile (here or in another tab)
  useEffect(() => { if (missing) closePage(); }, [missing, closePage]);

  const likeView = key => {
    if (!key) return null;
    let liked = lib.myLikes.has(key), n = lib.likeCounts.get(key) || 0;
    if (likeOv && likeOv.key === key && likeOv.liked !== liked) { liked = likeOv.liked; n = Math.max(0, likeOv.n); }
    return { liked, n };
  };

  // ---- one-line text sheet ----
  const [ask, setAsk] = useState(null);
  const askSeq = useRef(0);
  const askText = useCallback(o => new Promise(resolve => setAsk(Object.assign({}, o, { id: ++askSeq.current, resolve }))), []);
  const askDone = useCallback(() => setAsk(null), []);

  // ---- game page actions ----
  const shareLabel = useMemo(() => (typeof navigator !== 'undefined' && navigator.share && E.IS_TOUCH ? 'Share' : 'Copy link'), [E]);
  const act = useMemo(() => {
    const L = E.Library;
    const canPub = () => L.canPublish();
    return {
      close: closePage,
      navigate: () => { E.Sfx.play('click'); opener.current = null; },
      async like(e) {
        const key = likeKey(e);
        if (!key || !canPub() || liking.current) return;
        liking.current = true;
        const ov = likeOvRef.current && likeOvRef.current.key === key ? likeOvRef.current : null;
        const was = ov ? ov.liked : L.liked(key), base = ov ? ov.n : L.likes(key);
        setLikeOv({ key, liked: !was, n: base + (was ? -1 : 1) });
        E.Sfx.play(was ? 'click' : 'pop');
        try { await L.toggleLike(key); }
        catch (err) { setLikeOv(null); E.toast("Couldn't save your like. Try again.", true); }
        liking.current = false;
        setTimeout(() => setLikeOv(o => (o && o.key === key ? null : o)), 4000);
      },
      async rename(e) {
        const d = L.getDraft(e.id), current = d ? d.title || '' : e.title;
        const max = E.GAME_LIMITS.title;
        const v = await askText({ title: 'Rename game', label: 'Game name', value: current, max, ok: 'Save name', help: 'Shown on the tile and the game page.' });
        if (v == null) return;
        const title = E.WordFilter.clean(v.replace(/\s+/g, ' ').trim().slice(0, max));
        if (!title || title === current) return;
        const pub = d ? !!d.publishedAt : true;
        try {
          await L.rename(e.id, title); E.Sfx.play('save');
          E.toast(pub && !canPub() ? 'Renamed on this device. The published game keeps its old name until you publish again.' : 'Renamed to ' + title);
        } catch (err) {
          E.toast(d ? "Renamed here, but the published copy didn't update. Try again later." : "Couldn't rename it right now. Try again.", true);
        }
      },
      async unpublish(e) {
        const d = L.getDraft(e.id);
        const v = await E.askChoice({
          title: 'Unpublish this game?',
          body: d ? `“${e.title}” leaves Popular and New, and nobody else can play it. Your draft stays on this device.`
            : `“${e.title}” leaves Popular and New, and nobody else can play it. Its draft isn't on this device, so choose Edit a copy first if you want to keep it.`,
          buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Unpublish', value: 'go', kind: 'danger' }],
        });
        if (v !== 'go') return;
        try {
          await L.unpublish(e.id);
          E.toast(d ? 'Unpublished. Your draft is still here.' : 'Unpublished.');
          if (!d) closePage();
        } catch (err) {
          E.toast(err && err.message === 'offline' ? "Couldn't unpublish: PlayForge can't be reached right now." : "Couldn't unpublish right now. Try again.", true);
        }
      },
      async remove(e) {
        const d = L.getDraft(e.id); if (!d) return;
        const pub = !!d.publishedAt;
        // A published game can only be deleted once it is unpublished, or it would stay public with no way to remove it.
        if (pub && !canPub()) { E.Sfx.play('error'); E.toast('This game is still published. Delete it when PlayForge can be reached, so it is unpublished first.', true); return; }
        const v = await E.askChoice({
          title: 'Delete this game?',
          body: pub ? `“${e.title}” is removed from this device and unpublished, so nobody can play it. This can't be undone.` : `“${e.title}” is removed from this device. This can't be undone.`,
          buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Delete game', value: 'delete', kind: 'danger' }],
        });
        if (v !== 'delete') return;
        if (pub) {
          try { await L.unpublish(e.id); }
          catch (err) { E.toast("Couldn't unpublish it, so it wasn't deleted. Try again.", true); return; }
        }
        L.deleteDraft(e.id);
        closePage();
        E.Sfx.play('break'); E.toast('Game deleted.');
      },
      async share(e) {
        const url = window.location.origin + '/g/' + e.id;
        if (shareLabel === 'Share') {
          try { await navigator.share({ title: e.title + ' on PlayForge', url }); return; }
          catch (err) { if (err && err.name === 'AbortError') return; }
        }
        if (await copyText(url)) { E.Sfx.play('pick'); E.toast('Link copied. Anyone with it can play ' + e.title + '.'); return; }
        await askText({ title: 'Link to this game', label: 'Link', value: url, max: 300, ok: 'Done', readOnly: true, help: 'Copy this link and send it to a friend.' });
      },
    };
  }, [E, closePage, askText, shareLabel]);

  // ---- keys: / searches, Escape leaves the results ----
  useEffect(() => {
    const onKey = e => {
      if (e.defaultPrevented || modalOpen()) return;
      const q0 = qRef.current;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !E.isTyping(e)) { e.preventDefault(); if (q0) { q0.focus(); q0.select(); } return; }
      if (e.key === 'Escape') {
        if (viewRef.current !== 'rows') { e.preventDefault(); leaveResults(); }
        else if (q0 && document.activeElement === q0) q0.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [E, leaveResults]);

  // ---- render ----
  const status = E.statusLine();
  const click = useCallback(() => E.Sfx.play('click'), [E]);
  const results = useMemo(() => (view === 'search' ? search(E, cat, query) : view === 'all' ? rows[allRow] || [] : []), [E, view, cat, query, rows, allRow]);
  const allDef = view === 'all' ? ROWS.find(r => r.id === allRow) : null;
  const emptyNew = !lib.ready ? ['Looking for new games', 'Games people publish from Studio land here, newest first.']
    : !lib.online ? ["Can't reach PlayForge", 'Games other players publish show up here when the connection is back.']
      : ['Nothing new yet', 'Games people publish from Studio land here, newest first. Make one and be the first.'];
  const pageState = pageEntry ? { canPublish: !!lib.canPublish, online: onlineOf(pageEntry), like: likeView(likeKey(pageEntry)), gone, shareLabel } : null;

  return (
    <>
      <section id="home" ref={homeRef} className={'screen' + (scrolled ? ' scrolled' : '')} aria-label="PlayForge home" onScroll={onScroll}>
        <div className="home-inner">
          <header className="home-head">
            <div className="brand" aria-label="PlayForge"><Mark /><span className="wordmark">Play<b>Forge</b></span></div>
            <form className="home-search" id="home-search" role="search" autoComplete="off"
              onSubmit={ev => { ev.preventDefault(); applySearch(q); if (E.IS_TOUCH && qRef.current) qRef.current.blur(); }}>
              <Icon name="search" />
              <input ref={qRef} type="search" id="home-q" placeholder="Search games, creators, kinds" aria-label="Search games" enterKeyHint="search"
                spellCheck={false} autoCapitalize="off" autoCorrect="off" maxLength={60} value={q} onChange={onSearchInput} />
              {q ? (
                <button type="button" className="hs-clear" id="home-q-clear" aria-label="Clear search" onClick={() => { leaveResults(); if (qRef.current) qRef.current.focus(); }}>
                  <Icon name="close" />
                </button>
              ) : null}
            </form>
            <Link href="/avatar" scroll={false} className="me-chip" id="home-me" aria-label={`Edit your avatar, ${name}`} onClick={click}>
              <canvas ref={headRef} id="home-me-head" className="px" width="8" height="8" />
              <span id="home-me-name">{name}</span>
            </Link>
            <button type="button" className="icon-btn" id="home-settings" aria-label="Settings" onClick={() => E.openSettings()}><Icon name="sliders" /></button>
          </header>

          <section className="player-card" id="home-card" aria-labelledby="pc-name" hidden={view !== 'rows'}>
            <span className="pc-fig" aria-hidden="true"><canvas ref={figRef} id="home-fig" className="px fig" width="16" height="32" /></span>
            <div className="pc-info">
              <h1 id="pc-name">{name}</h1>
              <p id="pc-status">{status}</p>
            </div>
            <div className="pc-acts">
              <Link href="/avatar" scroll={false} className="btn" id="pc-edit" onClick={click}><Icon name="pencil" />Edit avatar</Link>
              <Link href="/studio/new" scroll={false} className="btn btn-ember" id="pc-make" onClick={click}><Icon name="plus" />Make a game</Link>
            </div>
          </section>

          <LazyCtx.Provider value={homeCtx}>
            <div className="home-rows" id="home-rows" hidden={view !== 'rows'}>
              {ROWS.map(def => (
                <Row key={def.id} E={E} def={def} items={rows[def.id]} likes={likesOf} online={onlineOf} onOpen={openEntry} onPlay={click} onMake={click}
                  onSeeAll={showAll} empty={def.id === 'mine' ? EMPTY_MINE : def.id === 'new' ? emptyNew : null} />
              ))}
            </div>

            {view !== 'rows' ? (
              <section className="home-results" id="home-results" aria-labelledby="hr-title">
                <div className="hr-head">
                  <button type="button" className="icon-btn" id="hr-back" aria-label={view === 'search' ? 'Clear search' : 'Back to all games'} onClick={leaveResults}><Icon name="back" /></button>
                  <div className="hr-text">
                    <h2 id="hr-title">{view === 'search' ? 'Search results' : allDef.title}</h2>
                    <small id="hr-count" aria-live="polite">{plural(results.length, 'game', 'games')}</small>
                  </div>
                </div>
                {results.length ? (
                  <div className="tile-grid" id="hr-grid">
                    {results.map(e => <Tile key={e.key} E={E} entry={e} likes={likesOf(e)} online={onlineOf(e)} onOpen={openEntry} />)}
                  </div>
                ) : (
                  <div className="hr-empty" id="hr-empty">
                    <span className="hr-empty-ic"><Icon name="search" /></span>
                    <strong id="hr-empty-title">{view === 'search' ? `No games match “${query.trim()}”` : 'Nothing here yet'}</strong>
                    <p>Check the spelling or try a shorter word. Or make the game yourself.</p>
                    <Link href="/studio/new" scroll={false} className="btn btn-ember" id="hr-make" onClick={click}><Icon name="plus" />Make a game</Link>
                  </div>
                )}
              </section>
            ) : null}
          </LazyCtx.Provider>

          <p className="home-foot">PlayForge · {E.GAMES.length} games, Studio and multiplayer</p>
        </div>
      </section>
      <GamePage E={E} entry={pageEntry} state={pageState} act={act} />
      <TextSheet E={E} ask={ask} onDone={askDone} />
      <SettingsModal />
    </>
  );
}

// Copies text to the clipboard: the async API on secure pages, the old selection trick elsewhere (plain http).
async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* try the old way */ }
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove();
    return !!ok;
  } catch (e) { return false; }
}
