'use client';
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

// A sheet over a scrim (".modal > .sheet" from playforge.css). Escape and a scrim tap call onClose.
// Several can stack; Escape closes only the top one.
const stack = [];
export function Modal({ open, onClose, title, titleId, className = '', role = 'dialog', closeLabel = 'Close', children, hideClose }) {
  const ref = useRef(null), me = useRef({});
  useEffect(() => {
    if (!open) return;
    const entry = me.current; stack.push(entry);
    const onKey = e => { if (e.key === 'Escape' && stack[stack.length - 1] === entry) { e.preventDefault(); e.stopPropagation(); onClose && onClose(); } };
    window.addEventListener('keydown', onKey, true);
    const f = ref.current && ref.current.querySelector('[data-autofocus]');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return () => { window.removeEventListener('keydown', onKey, true); const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
  }, [open, onClose]);
  if (!open) return null;
  const id = titleId || (title ? 'm-' + String(title).replace(/\W+/g, '-').toLowerCase() : undefined);
  return (
    <div className="modal" onPointerDown={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`sheet ${className}`} role={role} aria-modal="true" aria-labelledby={id} ref={ref}>
        {(title || !hideClose) && (
          <div className="sheet-head">
            {title ? <h2 id={id}>{title}</h2> : <span style={{ flex: 1 }} />}
            {!hideClose && <button className="icon-btn" onClick={onClose} aria-label={closeLabel}><Icon name="close" /></button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
export const modalOpen = () => stack.length > 0;
