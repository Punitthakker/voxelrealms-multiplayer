'use client';
import { Fragment, useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// The in-game HUD, drawn from hudStore (written by the engine's Hud and Game). Layout and class names follow the
// original #hud markup so playforge.css styles it: objective and stat chips on top, leaderboard on the right,
// the flash message, crosshair, hurt vignette, health bar, prompt, action buttons, choice panel and end card.
export default function Hud({ E, test }) {
  const root = useRef(null), top = useRef(null);
  // Phones stack the leaderboard under the objective and stat chips, however tall they are (game.css).
  useEffect(() => {
    const el = top.current, hud = root.current; if (!el || !hud || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => hud.style.setProperty('--hud-top-b', (el.offsetTop + el.offsetHeight) + 'px'));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <div className="hud" id="hud" ref={root}>
      <Top E={E} innerRef={top} />
      <Board E={E} />
      <Flash E={E} />
      <Cross E={E} />
      <Vignette E={E} />
      <Health E={E} />
      <Prompt E={E} />
      <Actions E={E} />
      {test && (
        <button type="button" className="hud-stop" id="hud-stop" onClick={() => E.Game.leave()}>
          <Icon name="stop" fill />Stop test
        </button>
      )}
      <Panel E={E} />
      <EndCard E={E} />
    </div>
  );
}

function Top({ E, innerRef }) {
  const objective = useStore(E.hudStore, s => s.objective);
  const stats = useStore(E.hudStore, s => s.stats);
  return (
    <div className="hud-top" ref={innerRef}>
      <div className="hud-obj" id="hud-obj" role="status" hidden={!objective}>{objective}</div>
      <div className="hud-stats" id="hud-stats">
        {stats.map(s => (
          <div key={s.key} className={'hud-stat' + (s.warn ? ' warn' : '')} title={s.label || undefined}>
            <Icon name={s.icon} />
            {s.label && <span className="sr-only">{s.label}: </span>}
            <span className="v">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Board({ E }) {
  const b = useStore(E.hudStore, s => s.board);
  if (!b) return null;
  return (
    <div className="hud-board" id="hud-board">
      <div className="hb-title">{b.title}</div>
      {b.rows.map((r, i) => (
        <div key={i} className={'hb-row' + (r.me ? ' me' : '')}><span>{r.name}</span><b>{r.value}</b></div>
      ))}
    </div>
  );
}

// Keeps the last message on screen while it fades out.
function Flash({ E }) {
  const f = useStore(E.hudStore, s => s.flash);
  const last = useRef(null);
  if (f) last.current = f;
  const shown = f || last.current;
  return (
    <div className={'hud-flash' + (f ? ' show' : '') + (shown ? ' ' + shown.kind : '')} id="hud-flash" role="status" aria-live="assertive">
      {shown ? shown.text : ''}
    </div>
  );
}

function Cross({ E }) {
  const on = useStore(E.hudStore, s => s.crosshair);
  return <div className="hud-cross" id="hud-cross" hidden={!on} />;
}

// A new element per hit restarts the red flash animation.
function Vignette({ E }) {
  const hurt = useStore(E.hudStore, s => s.hurt);
  return <div key={hurt} className={'hud-vig' + (hurt ? ' hit' : '')} id="hud-vig" />;
}

function Health({ E }) {
  const hp = useStore(E.hudStore, s => s.hp);
  if (!hp) return null;
  return (
    <div className="hud-hp" id="hud-hp" role="meter" aria-label="Health" aria-valuemin={0} aria-valuemax={hp.max} aria-valuenow={hp.cur}>
      <div className="bar"><i className={hp.k < 0.3 ? 'low' : undefined} style={{ width: (hp.k * 100).toFixed(1) + '%' }} /></div>
      <span>{hp.cur} / {hp.max}</span>
    </div>
  );
}

function Prompt({ E }) {
  const p = useStore(E.hudStore, s => s.prompt);
  return <div className="hud-prompt" id="hud-prompt" hidden={!p}>{p}</div>;
}

function Actions({ E }) {
  const actions = useStore(E.hudStore, s => s.actions);
  return (
    <div className="hud-actions" id="hud-actions">
      {actions.map(a => <ActionButton key={a.id} E={E} a={a} />)}
    </div>
  );
}

// Held while the pointer is down (fire, sprint...). Keyboard users get a short press from Enter or Space.
function ActionButton({ E, a }) {
  const down = e => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    E.Input.downId(a.id);
  };
  const up = () => E.Input.upId(a.id);
  const click = e => {
    if (e.detail !== 0) return; // pointer presses are handled on down/up
    E.Input.downId(a.id); setTimeout(() => E.Input.upId(a.id), 120);
  };
  return (
    <button
      type="button" className={'hud-act' + (a.primary ? ' primary' : '') + (a.held ? ' down' : '')} aria-label={a.label || a.id}
      disabled={a.disabled} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onClick={click}
      onContextMenu={e => e.preventDefault()}
    >
      <Icon name={a.icon} />
      <span className="lbl" aria-hidden="true">{a.label}</span>
      {a.keyLabel && <span className="key" aria-hidden="true">{a.keyLabel}</span>}
    </button>
  );
}

// A choice in the middle of the screen (blaster picker, "continue your run"). Number keys pick options too
// (GameScreen handles them).
function Panel({ E }) {
  const p = useStore(E.hudStore, s => s.panel);
  const open = !!p;
  useEffect(() => { if (open) E.Input.unlock(); }, [E, open]); // free the mouse so the options can be clicked
  if (!p) return null;
  return (
    <div className="ar-pick" id="ar-pick" role="dialog" aria-labelledby="ar-pick-h">
      <h3 id="ar-pick-h">{p.title}</h3>
      <div className="ar-row">
        {p.options.map(o => (
          <button key={o.id} type="button" className={'ar-w' + (o.on ? ' on' : '')} aria-pressed={!!o.on} onClick={() => E.Hud.panelPick(o.id)}>
            {o.key && <span className="ar-k" aria-hidden="true">{o.key}</span>}
            <b>{o.title}</b>
            {o.blurb && <small>{o.blurb}</small>}
          </button>
        ))}
      </div>
      {p.text && <p id="ar-pick-t">{p.text}</p>}
      {p.buttons.map(b => (
        <button key={b.id} type="button" className={'btn' + (b.kind === 'ember' ? ' btn-ember' : b.kind === 'danger' ? ' btn-danger' : '')} onClick={() => E.Hud.panelButton(b.id)}>
          {b.label}
        </button>
      ))}
    </div>
  );
}

function EndCard({ E }) {
  const end = useStore(E.hudStore, s => s.end);
  const again = useRef(null), leave = useRef(null);
  useEffect(() => {
    if (!end) return;
    const t = setTimeout(() => { const b = end.canAgain ? again.current : leave.current; if (b) b.focus({ preventScroll: true }); }, 60);
    return () => clearTimeout(t);
  }, [end]);
  if (!end) return null;
  return (
    <div className={'hud-end' + (end.win ? '' : ' lose')} id="hud-end">
      <div className="end-card" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title">{end.title}</h2>
        {end.sub && <p id="end-sub">{end.sub}</p>}
        {end.stats.length > 0 && (
          <dl id="end-stats">
            {end.stats.map(([k, v], i) => <Fragment key={i}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        )}
        <div className="end-btns">
          {end.canAgain && <button ref={again} type="button" className="btn btn-ember" id="end-again" onClick={() => E.Hud.endAction('again')}>{end.againLabel}</button>}
          <button ref={leave} type="button" className="btn" id="end-leave" onClick={() => E.Hud.endAction('leave')}>{end.leaveLabel}</button>
        </div>
      </div>
    </div>
  );
}
