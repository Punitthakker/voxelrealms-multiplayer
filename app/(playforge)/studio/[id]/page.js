'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEngine } from '@/components/playforge/engine';
import { Mark } from '@/components/playforge/Icon';
import { useStore } from '@/components/playforge/useStore';
import StudioScreen from '@/components/playforge/studio/StudioScreen';
import '@/playforge/web/game.css';
import '@/playforge/web/studio.css';

const COMMUNITY_ID = /^u-[a-z0-9]{8}$/;
const NOTICES = {
  draft: { title: 'Not on this device', text: "Drafts are saved on the device where they were made. This one isn't here, or it was deleted." },
  missing: { title: 'Game not found', text: 'This game may have been removed, or the link has a typo, so there is nothing to copy.' },
  offline: { title: "Can't reach PlayForge", text: "Copying this game needs the PlayForge server, which isn't answering right now. It opens by itself when the connection is back." },
  failed: { title: "This game didn't load", text: 'Something went wrong getting it from the server. Try again in a moment.' },
  full: { title: 'This device is full', text: "There's no room for another draft. Delete a game you don't need, then try again." },
};

// /studio/new                 a new blank game (the URL becomes /studio/<id> once the draft exists)
// /studio/new?remix=<gameId>  an editable copy of a built-in or community game
// /studio/<draftId>           a draft saved on this device
export default function StudioPage({ params, searchParams }) {
  const { id } = use(params);
  const sp = use(searchParams);
  const remix = typeof sp.remix === 'string' ? sp.remix : '';
  const E = useEngine(), router = useRouter();
  const [found, setFound] = useState({ key: null, doc: null, problem: null });
  const [attempt, setAttempt] = useState(0);
  const online = useStore(E ? E.platformStore : null, s => s.online);
  const goHome = useCallback(() => router.push('/', { scroll: false }), [router]);
  const key = id === 'new' ? 'new?' + remix : id;
  const made = useRef(null); // the draft this page made for /studio/new (made once, even if the effect runs again)

  useEffect(() => {
    if (!E) return;
    if (id !== 'new') {
      const d = E.Library.getDraft(id);
      setFound(f => (f.doc && f.doc.id === id ? f : { key: id, doc: d, problem: d ? null : 'draft' }));
      return;
    }
    if (made.current) return;
    let live = true;
    setFound(f => (f.key === key && f.problem ? { key: null, doc: null, problem: null } : f)); // loading card while retrying
    (async () => {
      let doc = null, def = null, failed = '';
      if (remix) {
        def = E.gameById(remix);
        if (!def && COMMUNITY_ID.test(remix)) {
          try {
            // Community games come from the server: wait for the platform layer (session) first.
            for (let i = 0; i < 100 && !E.Caps.ready; i++) await new Promise(r => setTimeout(r, 100));
            def = await E.Library.loadById(remix);
          } catch (e) { failed = (e && e.message) || 'failed'; }
        }
        if (!live) return;
        if (!def) {
          const problem = !COMMUNITY_ID.test(remix) || (E.Caps.online && !failed) ? 'missing' : !E.Caps.online || failed === 'offline' ? 'offline' : 'failed';
          setFound({ key, doc: null, problem }); return;
        }
        doc = E.Studio.remixDraft(def);
        if (doc) E.toast(`You're editing your own copy of ${def.title}.`);
      } else {
        doc = E.Studio.createDraft();
        if (doc) E.toast('New game! Add parts from Insert, then press Test.');
      }
      if (!live) return;
      if (!doc) { setFound({ key, doc: null, problem: 'full' }); return; }
      made.current = doc;
      // The address names the draft from now on: reload, Back and Forward reopen it instead of making another one.
      router.replace('/studio/' + doc.id, { scroll: false });
    })();
    return () => { live = false; };
  }, [E, id, key, remix, attempt, router]);

  // A remix link opened while the server was away loads by itself once the platform comes online.
  const waiting = found.key === key && found.problem === 'offline', wasOnline = useRef(online);
  useEffect(() => {
    const was = wasOnline.current; wasOnline.current = online;
    if (online && !was && waiting) setAttempt(a => a + 1);
  }, [online, waiting]);

  if (E && found.doc) return <StudioScreen key={found.doc.id} E={E} doc={found.doc} onHome={goHome} />;
  if (found.key === key && found.problem) {
    const copy = NOTICES[found.problem] || NOTICES.missing, retry = found.problem === 'offline' || found.problem === 'failed';
    return (
      <main className="screen g-notice st-notice">
        <div className="g-card" role="alert">
          <Mark />
          <h1>{copy.title}</h1>
          <p>{copy.text}</p>
          {retry && <button type="button" className="btn btn-ember" onClick={() => setAttempt(a => a + 1)}>Try again</button>}
          {found.problem === 'draft' && <Link href="/studio/new" scroll={false} className="btn btn-ember">Make a new game</Link>}
          <Link href="/" scroll={false} className="btn">Go to PlayForge home</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="screen g-notice st-notice" aria-busy="true">
      <div className="g-card" role="status">
        <Mark />
        <h1>{id === 'new' ? (remix ? 'Making your copy' : 'Making a new game') : 'Opening Studio'}</h1>
      </div>
    </main>
  );
}
