'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEngine } from '@/components/playforge/engine';
import { Mark } from '@/components/playforge/Icon';
import { useStore } from '@/components/playforge/useStore';
import GameScreen from '@/components/playforge/game/GameScreen';
import '@/playforge/web/game.css';

const COMMUNITY_ID = /^u-[a-z0-9]{8}$/;
const NOTICES = {
  missing: { title: 'Game not found', text: 'This game may have been removed, or the link has a typo. There are plenty more to play.' },
  offline: { title: "Can't reach PlayForge", text: "This game is on the PlayForge server, which isn't answering right now. It opens by itself when the connection is back." },
  failed: { title: "This game didn't load", text: 'Something went wrong getting it from the server. Try again in a moment.' },
};

// /g/<id>: plays a built-in game (E.gameById) or a published community game (E.Library.loadById).
export default function GamePage({ params }) {
  const { id } = use(params);
  const E = useEngine(), router = useRouter();
  // problem: null | 'missing' (no such game) | 'offline' (server unreachable) | 'failed' (the server answered with an error)
  const [found, setFound] = useState({ id: null, def: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const online = useStore(E ? E.platformStore : null, s => s.online);
  const goHome = useCallback(() => router.push('/'), [router]);

  useEffect(() => {
    if (!E) return;
    const builtin = E.gameById(id);
    if (builtin) { setFound({ id, def: builtin, problem: null }); return; }
    if (!COMMUNITY_ID.test(id)) { setFound({ id, def: null, problem: 'missing' }); return; }
    let live = true;
    setFound(f => (f.id === id && f.problem ? { id: null, def: null, problem: null } : f)); // loading card while retrying
    (async () => {
      let def = null, failed = '';
      try {
        // Community games come from the server: wait for the platform layer (session) to start first.
        for (let i = 0; i < 100 && !E.Caps.ready; i++) await new Promise(r => setTimeout(r, 100));
        if (E.Library && typeof E.Library.loadById === 'function') def = await E.Library.loadById(id);
      } catch (e) { failed = (e && e.message) || 'failed'; } // Library error codes: offline, failed, rate_limited...
      // Library.loadById returns null when offline, so "not found" is only trusted while the server answers.
      const problem = def ? null : !E.Caps.online || failed === 'offline' ? 'offline' : failed ? 'failed' : 'missing';
      if (live) setFound({ id, def: def || null, problem });
    })();
    return () => { live = false; };
  }, [E, id, attempt]);

  // A link opened while the server was away loads by itself once the platform comes online.
  const waiting = found.id === id && found.problem === 'offline', wasOnline = useRef(online);
  useEffect(() => {
    const was = wasOnline.current; wasOnline.current = online;
    if (online && !was && waiting) setAttempt(a => a + 1);
  }, [online, waiting]);

  const def = found.id === id ? found.def : null;
  useEffect(() => {
    if (!def) return;
    const before = document.title; document.title = `${def.title} · PlayForge`;
    return () => { document.title = before; };
  }, [def]);

  if (found.id === id && found.problem) {
    const copy = NOTICES[found.problem] || NOTICES.missing, retry = found.problem !== 'missing';
    return (
      <main className="screen g-notice">
        <div className="g-card" role="alert">
          <Mark />
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
          {retry && <button type="button" className="btn btn-ember" onClick={() => setAttempt(a => a + 1)}>Try again</button>}
          <Link href="/" className={'btn' + (retry ? '' : ' btn-ember')}>Go to PlayForge home</Link>
        </div>
      </main>
    );
  }
  // GameScreen shows its loading card until the game is found and built.
  return <GameScreen def={def} onExit={goHome} />;
}
