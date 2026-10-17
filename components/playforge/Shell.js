'use client';
import { useEffect, useRef } from 'react';
import { IconSprite } from './Icon';
import { Modal } from './Modal';
import { useEngine } from './engine';
import { useStore } from './useStore';

// Wraps every PlayForge screen: the icon sprite, the engine start-up, toasts and confirm dialogs.
export default function Shell({ children }) {
  const E = useEngine();
  useEffect(() => {
    if (!E) return;
    if (E.IS_TOUCH) document.body.classList.add('touch');
    const unlock = () => E.Sfx.unlock();
    const noGesture = e => e.preventDefault();
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('gesturestart', noGesture);
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('gesturestart', noGesture); };
  }, [E]);
  return (
    <>
      <IconSprite />
      {children}
      {E && <Toast store={E.uiStore} />}
      {E && <Choice store={E.uiStore} />}
    </>
  );
}

function Toast({ store }) {
  const t = useStore(store, s => s.toast);
  const last = useRef(null); if (t) last.current = t; // the message stays while the toast fades out
  const m = t || last.current;
  return <div id="toast" role="status" aria-live="polite" className={(t ? 'show' : '') + (m && m.warn ? ' warn' : '')}>{m ? m.msg : ''}</div>;
}

function Choice({ store }) {
  const c = useStore(store, s => s.choice);
  return (
    <Modal open={!!c} onClose={() => c && c.resolve('cancel')} title={c ? c.title : ''} role="alertdialog" hideClose>
      {c && <p id="ch-body">{c.body}</p>}
      {c && (
        <div className="choice-btns">
          {c.buttons.map((b, i) => (
            <button key={i} className={'btn' + (b.kind === 'ember' ? ' btn-ember' : b.kind === 'danger' ? ' btn-danger' : '')} onClick={() => c.resolve(b.value)} data-autofocus={b.kind === 'ember' || undefined}>{b.label}</button>
          ))}
        </div>
      )}
    </Modal>
  );
}
