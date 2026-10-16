'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../Icon';
import { modalOpen } from '../Modal';
import { useEngine } from '../engine';
import { useStore } from '../useStore';
import SettingsModal from '../settings/SettingsModal';
import Hud from './Hud';
import GameMenu from './GameMenu';
import { ChatButton, ChatPanel } from './Chat';
import '@/playforge/web/game.css';

// The in-game screen: the 3D view, touch controls, HUD, chat and the game menu. It plays `def` while mounted:
// E.Game.enter(def, {host, test, onExit}) on mount, E.Game.leave(true) on unmount. onExit runs after the player
// leaves (Leave game, Stop test, the end card). Studio renders it in place with test = true.
export default function GameScreen({ def, test = false, onExit }) {
  const E = useEngine();
  const host = useRef(null), layer = useRef(null), joyBase = useRef(null), joyKnob = useRef(null), jump = useRef(null);
  const exit = useRef(onExit); exit.current = onExit;
  const [started, setStarted] = useState(false);
  const mp = useStore(E ? E.netStore : null, s => s.inRoom);

  useEffect(() => {
    if (!E || !def) return;
    const detach = E.Input.attach({ layer: layer.current, joyBase: joyBase.current, joyKnob: joyKnob.current, jump: jump.current });
    E.Game.enter(def, { host: host.current, test: !!test, onExit: () => { if (exit.current) exit.current(); } });
    setStarted(true);
    return () => {
      setStarted(false);
      E.Game.leave(true);
      detach();
      if (E.Engine.mode === 'game') E.Engine.setMode('home');
    };
  }, [E, def, test]);

  // Escape opens the menu; Enter or / opens the chat; number keys pick in a choice panel.
  // Capture phase, so a panel's number key is used up before game rules see it.
  useEffect(() => {
    if (!E) return;
    const onKey = e => {
      if (e.defaultPrevented || !E.Game.active || modalOpen()) return;
      const typing = E.isTyping(e);
      if (e.key === 'Escape') { if (!typing) { e.preventDefault(); E.Game.openMenu(); } return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const panel = E.hudStore.get().panel;
      if (panel && /^Digit[1-9]$/.test(e.code)) {
        const o = panel.options.find(x => x.key === e.code.slice(5));
        if (o) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) E.Hud.panelPick(o.id); return; }
      }
      if ((e.key === 'Enter' || e.key === '/') && E.netStore.get().inRoom && !E.hudStore.get().end && !isControl(document.activeElement)) {
        e.preventDefault(); E.Net.focusChat();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [E]);

  const title = def ? def.title : '';
  return (
    <section id="game" className={'screen' + (mp ? ' mp' : '') + (test ? ' testing' : '')} aria-label={title ? `Game: ${title}` : 'Game'} onDoubleClick={e => e.preventDefault()}>
      <div className="gl-host" id="game-host" ref={host} />
      <div id="touch-layer" ref={layer} aria-hidden="true">
        <div id="joy-base" className="touch-only idle" ref={joyBase}><div id="joy-knob" ref={joyKnob} /></div>
      </div>
      {E && <Chrome E={E} title={title} test={!!test} jump={jump} />}
      <Loading E={started ? E : null} title={title} />
    </section>
  );
}

const isControl = el => !!el && el !== document.body && /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

// Everything over the 3D view once the engine is loaded.
function Chrome({ E, title, test, jump }) {
  const hint = useStore(E.gameStore, s => s.hint);
  const hintVisible = useStore(E.gameStore, s => s.hintVisible);
  const fps = useStore(E.gameStore, s => s.fps);
  const showFps = useStore(E.settingsStore, s => s.showFps);
  return (
    <>
      <button type="button" className="hud-round" id="hud-menu" aria-label="Open game menu" onClick={() => E.Game.openMenu()}>
        <Mark />
      </button>
      <ChatButton E={E} />
      <ChatPanel E={E} />
      <div className="hud-chip" id="hud-title">{title}</div>
      <div className="hud-chip" id="hud-fps" hidden={!showFps}>{fps || '-- fps'}</div>
      <div className="hud-chip desk-only" id="hud-hint" style={{ opacity: hintVisible ? 1 : 0 }} aria-hidden={!hintVisible}>{hint}</div>
      <button type="button" className="hud-round touch-only" id="hud-jump" ref={jump} aria-label="Jump"><Icon name="jump" /></button>
      <Hud E={E} test={test} />
      <GameMenu E={E} title={title} test={test} />
      <SettingsModal />
    </>
  );
}

// "Loading <game>" until the level is built, then it fades out. E is null until this screen has entered the game.
function Loading({ E, title }) {
  const loading = useStore(E ? E.gameStore : null, s => s.loading);
  const ready = useStore(E ? E.gameStore : null, s => !!s.hint);
  const label = useStore(E ? E.gameStore : null, s => s.loadingTitle);
  if (E && !loading) return null;
  return (
    <div id="loading" style={{ opacity: E && ready ? 0 : 1 }} role="status">
      <div className="ld"><Mark /><b id="loading-title">{label || (title ? 'Loading ' + title : 'Loading')}</b><div className="bar"><i /></div></div>
    </div>
  );
}
