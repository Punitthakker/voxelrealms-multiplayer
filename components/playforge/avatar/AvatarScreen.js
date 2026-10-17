'use client';
import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Icon } from '../Icon';
import { modalOpen } from '../Modal';
import TopBar from './TopBar';
import Stage from './Stage';
import Tools from './Tools';
import Panel from './Panel';
import '@/playforge/web/avatar.css';

// The avatar and skin editor (E.Editor, playforge/engine/skin-editor.js). While mounted the editor owns the shared
// renderer (Engine mode 'avatar'). Back (or Escape) asks first when there are unsaved changes, then calls onHome().
// Leaving any other way (browser Back, a link, reload) keeps the unsaved skin for the next visit.
export default function AvatarScreen({ E, onHome }) {
  const view = useRef(null), leaving = useRef(false);
  const back = useCallback(async () => {
    if (leaving.current) return;
    if (await E.Editor.confirmLeave()) { leaving.current = true; onHome(); }
  }, [E, onHome]);
  const backRef = useRef(back); backRef.current = back;

  useEffect(() => {
    const Ed = E.Editor;
    const detach = Ed.attach(view.current, { blocked: () => modalOpen(), onBack: () => backRef.current() });
    Ed.enter();
    return () => { Ed.exit(); detach(); };
  }, [E]);

  return (
    <section id="avatar" className="screen" aria-label="Avatar editor">
      <TopBar E={E} onBack={back} />
      <div className="av-body">
        <Stage E={E} viewRef={view} />
        <Tools E={E} />
        <Panel E={E} />
      </div>
    </section>
  );
}

// Shown for the moment before the engine has loaded (the first visit to this page).
export function AvatarLoading() {
  return (
    <section id="avatar" className="screen" aria-label="Avatar editor" aria-busy="true">
      <header className="ed-bar">
        <Link href="/" scroll={false} className="icon-btn" aria-label="Back to home"><Icon name="back" /></Link>
        <h1 className="ed-title">Avatar</h1>
        <span className="ed-status" role="status">Loading…</span>
      </header>
      <div className="av-body">
        <div className="av-stage" />
        <div className="av-tools" />
        <div className="av-panel" />
      </div>
    </section>
  );
}
