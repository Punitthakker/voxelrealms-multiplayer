'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../useStore';

// The display name on your nametag (checked by the word filter). Empty goes back to your guest name.
export default function NameTab({ E, hidden }) {
  const Ed = E.Editor, st = E.editorStore;
  const nick = useStore(st, s => s.nick);
  const nickDefault = useStore(st, s => s.nickDefault);
  const help = useStore(st, s => s.nickHelp);
  const error = useStore(st, s => s.nickError);
  const clearLabel = useStore(st, s => s.nickClear);
  const seq = useStore(st, s => s.nickSeq);
  const [val, setVal] = useState(nick);
  const [busy, setBusy] = useState(false);
  const field = useRef(null);
  // The saved name (after a save, or a change from elsewhere) replaces the field unless you are typing in it.
  useEffect(() => { if (document.activeElement !== field.current) setVal(nick); }, [nick, seq]);
  const save = async text => {
    if (busy) return;
    // saveNick checks and applies the name at once (the field shows it tidied up), then saves it to the server.
    const job = Ed.saveNick(text);
    if (!E.editorStore.get().nickError) setVal(E.Profile.nick);
    setBusy(true);
    try { await job; } finally { setBusy(false); }
  };
  return (
    <div className="tab-panel" id="tab-name" role="tabpanel" aria-labelledby="tab-btn-name" hidden={hidden}>
      <form className="av-name-form" onSubmit={e => { e.preventDefault(); save(val); }} noValidate>
        <div className="field">
          <label htmlFor="av-nick"><b>Display name</b></label>
          <input className="text-input" id="av-nick" ref={field} maxLength={20} autoComplete="off" spellCheck={false} autoCapitalize="off" enterKeyHint="done"
            placeholder={nickDefault} value={val} aria-describedby="nick-help" aria-invalid={error || undefined}
            onChange={e => { setVal(e.target.value); Ed.clearNickError(); }} />
          <p className={'help' + (error ? ' av-error' : '')} id="nick-help" role={error ? 'alert' : undefined}>{help}</p>
        </div>
        <div className="btn-row">
          <button type="submit" className="btn btn-ember" id="av-nick-save" disabled={busy}>Save name</button>
          <button type="button" className="btn btn-quiet" id="av-nick-clear" disabled={busy || (!nick && !val)} onClick={() => { setVal(''); save(''); }}>{clearLabel}</button>
        </div>
      </form>
    </div>
  );
}
