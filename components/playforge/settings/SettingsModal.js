'use client';
import { useCallback, useEffect, useRef } from 'react';
import { Modal } from '../Modal';
import { useEngine } from '../engine';
import { useStore } from '../useStore';

const PRESET_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

// The settings sheet: graphics preset, dynamic resolution, FPS counter, volume, look sensitivity, chat bubbles,
// invert look. Every change applies at once through the engine (applySetting) and is saved on this device.
// Without props it follows the engine's settingsStore, so E.openSettings() opens it from anywhere it is rendered;
// pass {open, onClose} to control it yourself.
export default function SettingsModal({ open: openProp, onClose: onCloseProp }) {
  const E = useEngine();
  const s = useStore(E ? E.settingsStore : null);
  const controlled = openProp !== undefined;
  const open = !!(controlled ? openProp : s && s.open);
  const onClose = useCallback(() => { if (onCloseProp) onCloseProp(); if (!controlled && E) E.closeSettings(); }, [E, onCloseProp, controlled]);
  const vol = useRef(null);
  useEffect(() => { if (open && E) E.Sfx.play('open'); }, [E, open]);
  // A click at the new volume when the slider is let go.
  useEffect(() => {
    const el = vol.current; if (!el || !E) return;
    const done = () => E.Sfx.play('click');
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [E, open]);
  if (!E || !s) return null;
  const set = (k, v) => E.applySetting(k, v);
  return (
    <Modal open={open} onClose={onClose} title="Settings" titleId="set-title" closeLabel="Close settings">
      <div className="field">
        <b id="set-preset-label">Graphics</b>
        <div className="seg" role="group" aria-labelledby="set-preset-label" id="set-preset">
          {E.PRESET_KEYS.map(k => (
            <button key={k} type="button" aria-pressed={s.preset === k} data-autofocus={s.preset === k || undefined} onClick={() => set('preset', k)}>{PRESET_LABEL[k] || k}</button>
          ))}
        </div>
        <small className="help" id="preset-help">{E.presetHelp(s.preset)}</small>
      </div>
      <Toggle id="set-dynres" label="Dynamic resolution" help="Renders fewer pixels when the frame rate drops" on={s.dynamicRes} onChange={v => set('dynamicRes', v)} />
      <Toggle id="set-fps" label="Show FPS" help="Frame rate counter in games" on={s.showFps} onChange={v => set('showFps', v)} />
      <hr />
      <div className="field">
        <div className="set-row"><b><label htmlFor="set-vol">Volume</label></b><span className="set-val" id="set-vol-v">{s.volume}</span></div>
        <input ref={vol} type="range" id="set-vol" min="0" max="100" step="5" value={s.volume} onChange={e => set('volume', +e.target.value)} />
      </div>
      <div className="field">
        <div className="set-row"><b><label htmlFor="set-sens">Camera sensitivity</label></b><span className="set-val" id="set-sens-v">{s.sensitivity.toFixed(1)}×</span></div>
        <input type="range" id="set-sens" min="0.2" max="2" step="0.1" value={s.sensitivity} onChange={e => set('sensitivity', +e.target.value)} />
      </div>
      <Toggle id="set-bubbles" label="Chat bubbles" help="Show new messages above players' heads" on={s.bubbles} onChange={v => set('bubbles', v)} />
      <Toggle id="set-invert" label="Invert vertical look" help="Drag up to look down" on={s.invertY} onChange={v => set('invertY', v)} />
    </Modal>
  );
}

function Toggle({ id, label, help, on, onChange }) {
  return (
    <div className="set-row">
      <div className="lbl"><b id={id + '-l'}>{label}</b><small id={id + '-h'}>{help}</small></div>
      <label className="switch">
        <input type="checkbox" id={id} role="switch" checked={on} aria-labelledby={id + '-l'} aria-describedby={id + '-h'} onChange={e => onChange(e.target.checked)} />
        <span />
      </label>
    </div>
  );
}
