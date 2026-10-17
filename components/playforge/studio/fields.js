'use client';
import { useEffect, useRef, useState } from 'react';

// Form controls for Studio's panels. Each one edits a stored value through a commit callback.
//
// Text and number inputs show the stored value, keep what you type while they have focus, and commit on Enter or
// when focus leaves (Escape puts the stored value back). The callback is taken when typing starts, so a value
// typed for one part is applied to that part even if a tap in the 3D view selected another one before the input
// lost focus. After a commit the input shows what was actually stored (a size of -3 shows 3).

export const fmtNum = v => String(Math.round((Number(v) || 0) * 1000) / 1000);

function useEditable(display, onCommit) {
  const [text, setText] = useState(null); // null while not editing
  const live = useRef(null);
  return {
    value: text !== null ? text : display,
    onFocus: () => { live.current = { start: display, text: display, commit: onCommit, skip: false }; setText(display); },
    onChange: e => { if (live.current) live.current.text = e.target.value; setText(e.target.value); },
    onBlur: () => {
      const l = live.current; live.current = null; setText(null);
      if (!l || l.skip || l.text === l.start || !l.commit) return;
      l.commit(l.text);
    },
    onKeyDown: e => {
      if (e.key === 'Enter' && e.currentTarget.tagName !== 'TEXTAREA') { e.preventDefault(); e.currentTarget.blur(); }
      else if (e.key === 'Escape' && live.current) { e.preventDefault(); e.stopPropagation(); live.current.skip = true; e.currentTarget.blur(); }
    },
  };
}

// value: string. onCommit(text).
export function TextInput({ value, onCommit, max, label, id, className = 'text-input', placeholder, multiline, rows }) {
  const ed = useEditable(String(value ?? ''), onCommit);
  const Tag = multiline ? 'textarea' : 'input';
  return <Tag className={className} id={id} maxLength={max} aria-label={label} placeholder={placeholder} rows={rows} spellCheck={false} autoComplete="off" {...ed} />;
}

// value: number. onCommit(number); text that isn't a number puts the stored value back.
// signed: the value can be negative (no decimal-only keypad on phones, which has no minus key).
export function NumInput({ value, onCommit, label, id, signed, min, max, step = 'any', disabled, placeholder, allowEmpty }) {
  const shown = allowEmpty && (value === null || value === undefined || value === '') ? '' : fmtNum(value);
  const ed = useEditable(shown, t => {
    if (allowEmpty && !String(t).trim()) { onCommit(null); return; }
    const n = parseFloat(t);
    if (Number.isFinite(n)) onCommit(n);
  });
  return (
    <input className="text-input" type="number" id={id} step={step} min={min} max={max} inputMode={signed ? undefined : 'decimal'} aria-label={label}
      disabled={disabled} placeholder={placeholder} autoComplete="off" {...ed} />
  );
}

// Three number inputs (X, Y, Z). onCommit(axisIndex, number).
export function Xyz({ label, vals, onCommit, signed }) {
  return (
    <div className="st-xyz">
      {['X', 'Y', 'Z'].map((L, k) => (
        <label key={L}><span>{L}</span><NumInput value={vals[k]} signed={signed} label={`${label} ${L}`} onCommit={v => onCommit(k, v)} /></label>
      ))}
    </div>
  );
}

// opts: [[value, label]]. Commits at once.
export function Select({ value, opts, onChange, label, id, disabled }) {
  return (
    <select className="text-input" id={id} aria-label={label} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </select>
  );
}

// An on/off row with a title and a line of help.
export function Switch({ title, help, on, onChange }) {
  return (
    <label className="set-row">
      <span className="lbl"><b>{title}</b>{help && <small>{help}</small>}</span>
      <span className="switch"><input type="checkbox" role="switch" checked={!!on} onChange={e => onChange(e.target.checked)} /><span /></span>
    </label>
  );
}

// A slider that shows its value while dragging and commits once when it is let go (the native change event).
export function Range({ value, onCommit, min, max, step, label, id, onLive }) {
  const [live, setLive] = useState(null);
  const el = useRef(null), commit = useRef(onCommit);
  useEffect(() => {
    const i = el.current; if (!i) return;
    const done = () => { const f = commit.current; setLive(null); if (f) f(+i.value); };
    i.addEventListener('change', done);
    return () => i.removeEventListener('change', done);
  }, []);
  const v = live !== null ? live : value;
  return (
    <input ref={el} type="range" id={id} min={min} max={max} step={step} aria-label={label} value={v}
      onPointerDown={() => { commit.current = onCommit; }} onFocus={() => { commit.current = onCommit; }}
      onChange={e => { setLive(+e.target.value); if (onLive) onLive(+e.target.value); }} />
  );
}

// The colour picker swatch: shows the colour while picking, commits once when the picker closes.
export function ColorPick({ value, onCommit }) {
  const [live, setLive] = useState(null);
  const el = useRef(null), commit = useRef(onCommit);
  useEffect(() => {
    const i = el.current; if (!i) return;
    const done = () => { const f = commit.current; setLive(null); if (f) f(i.value.toUpperCase()); };
    i.addEventListener('change', done);
    return () => i.removeEventListener('change', done);
  }, []);
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#9aa5b1';
  return (
    <label className="cur-swatch" style={{ background: live || value }}>
      <input ref={el} type="color" value={live || safe} aria-label="Pick any color" onClick={() => { commit.current = onCommit; }} onFocus={() => { commit.current = onCommit; }}
        onChange={e => setLive(e.target.value)} />
    </label>
  );
}

// A labelled block in the Properties panel.
export function Field({ label, children }) {
  return <div className="st-f"><b>{label}</b>{children}</div>;
}
