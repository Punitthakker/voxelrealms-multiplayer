'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { modalOpen } from '../Modal';
import { useStore } from '../useStore';
import GameScreen from '../game/GameScreen';
import TopBar from './TopBar';
import InsertPanel from './InsertPanel';
import Stage from './Stage';
import RightPanel from './RightPanel';
import GameSettings from './GameSettings';
import '@/playforge/web/studio.css';

function useMedia(q) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(q), f = () => setOn(m.matches); f();
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, [q]);
  return on;
}

async function copyText(text) {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall back */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}

// Studio, the game maker, for one draft doc (E.Library draft). It opens the doc in the engine while mounted and
// saves it (with a thumbnail) when it unmounts. Test plays the game in place with the game screen; Stop brings
// the editor back with the same camera. onHome() leaves for the home screen.
export default function StudioScreen({ E, doc, onHome }) {
  const view = useRef(null);
  const [testDef, setTestDef] = useState(null);
  const [settings, setSettings] = useState(false);
  const phone = useMedia('(max-width: 999px)');
  const title = useStore(E.studioStore, s => s.title);

  useEffect(() => {
    const S = E.Studio;
    const detach = S.attach(view.current, { blocked: () => modalOpen() });
    S.open(doc);
    return () => { S.close(); detach(); };
  }, [E, doc]);

  // After a test the game screen has unmounted (its clean-up runs first); the editor comes back.
  const testing = !!testDef, wasTesting = useRef(false);
  useEffect(() => {
    if (testing) { wasTesting.current = true; return; }
    if (wasTesting.current) { wasTesting.current = false; E.Studio.resume(); }
  }, [E, testing]);

  useEffect(() => {
    if (!title) return;
    const before = document.title; document.title = `${title} · Studio · PlayForge`;
    return () => { document.title = before; };
  }, [title]);

  const onTest = useCallback(() => { setSettings(false); const def = E.Studio.test(); if (def) setTestDef(def); }, [E]);
  const onStop = useCallback(() => setTestDef(null), []);
  const onBack = useCallback(() => { E.Studio.leave(); onHome(); }, [E, onHome]);
  const closeSettings = useCallback(() => setSettings(false), []);
  const onPublish = useCallback(async () => {
    const r = await E.Studio.publish(); if (!r) return;
    const url = `${window.location.origin}/g/${r.id}`;
    const v = await E.askChoice({
      title: r.again ? 'Updated' : 'Published',
      body: r.again ? `Players get the new version of ${r.title} next time they join. Its link: ${url}` : `${r.title} is on the home screen under New. Anyone with this link can play it: ${url}`,
      buttons: [{ label: 'Done', value: 'done' }, { label: 'Copy link', value: 'copy', kind: 'ember' }],
    });
    if (v === 'copy') E.toast((await copyText(url)) ? 'Link copied' : `Copy this link: ${url}`, false);
  }, [E]);

  return (
    <>
      <section id="studio" className="screen" aria-label="PlayForge Studio" hidden={testing}>
        <TopBar E={E} onBack={onBack} onSettings={() => setSettings(true)} onTest={onTest} onPublish={onPublish} />
        <div className="st-body" id="st-body">
          <InsertPanel E={E} phone={phone} />
          <Stage E={E} viewRef={view} />
          <RightPanel E={E} phone={phone} />
        </div>
      </section>
      <GameSettings E={E} open={settings && !testing} onClose={closeSettings} onDeleted={onHome} />
      {testDef && <GameScreen def={testDef} test onExit={onStop} />}
    </>
  );
}
