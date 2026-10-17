'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';

// A small sheet for one line of text (Rename game), or for showing a link to copy (readOnly).
// ask: {id, title, label, value, max, ok, help, readOnly, resolve(text | null)} | null. onDone() clears it.
export default function TextSheet({ E, ask, onDone }) {
  return ask ? <Sheet key={ask.id} E={E} ask={ask} onDone={onDone} /> : null;
}

function Sheet({ E, ask, onDone }) {
  const max = ask.max || 40;
  const [value, setValue] = useState(() => String(ask.value || '').slice(0, max));
  const [bad, setBad] = useState(false);
  const input = useRef(null), done = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { try { input.current && input.current.select(); } catch (e) { /* not focusable yet */ } }, 60);
    return () => clearTimeout(t);
  }, []);
  const finish = useCallback(v => { if (done.current) return; done.current = true; onDone(); ask.resolve(v); }, [ask, onDone]);
  const close = useCallback(() => finish(null), [finish]);
  const submit = ev => {
    ev.preventDefault();
    if (ask.readOnly) { finish(value); return; }
    if (!value.trim()) { setBad(true); E.Sfx.play('error'); if (input.current) input.current.focus(); return; }
    finish(value);
  };
  return (
    <Modal open onClose={close} id="text-modal" title={ask.title} titleId="tx-title" closeLabel="Close">
      <form id="tx-form" onSubmit={submit} autoComplete="off">
        <div className="field">
          <label htmlFor="tx-input"><b id="tx-label">{ask.label}</b></label>
          <input ref={input} className="text-input" id="tx-input" maxLength={max} spellCheck={false} enterKeyHint="done" data-autofocus
            readOnly={!!ask.readOnly} value={value} aria-describedby="tx-help"
            onChange={ev => { setValue(ev.target.value); if (bad && ev.target.value.trim()) setBad(false); }} />
          <p className="help tx-help">
            <span id="tx-help" className={bad ? 'bad' : ''} aria-live="polite">{bad ? 'Type a name first.' : ask.help || ''}</span>
            {ask.readOnly ? null : <span className="tx-count" id="tx-count" aria-hidden="true">{`${value.length}/${max}`}</span>}
          </p>
        </div>
        <div className="choice-btns">
          {ask.readOnly ? null : <button type="button" className="btn" onClick={close}>Cancel</button>}
          <button type="submit" className="btn btn-ember" id="tx-ok">{ask.ok || 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
