'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../useStore';

// The flat 64 x 64 skin map (painted by the editor), the current color with a picker and a hex field, the palette
// and your recent custom colors.
export default function PaintTab({ E, hidden }) {
  const Ed = E.Editor, st = E.editorStore;
  const panel = useRef(null), map = useRef(null);
  const caption = useStore(st, s => s.caption);
  const color = useStore(st, s => s.color);
  const recent = useStore(st, s => s.recent);

  useEffect(() => Ed.attachMap(map.current, panel.current), [Ed]);

  return (
    <div className="tab-panel" id="tab-paint" role="tabpanel" aria-labelledby="tab-btn-paint" hidden={hidden} ref={panel}>
      <div className="map-wrap"><canvas id="av-map" ref={map} aria-label="Flat skin map, 64 by 64 pixels" /></div>
      <div className="map-caption" id="av-caption" aria-hidden="true">{caption}</div>
      <ColorRow E={E} color={color} />
      <h3 className="sub-h" id="av-palette-h">Palette</h3>
      <div className="swatches" id="av-palette" role="group" aria-labelledby="av-palette-h">
        {E.PALETTE.map(c => <Swatch key={c} E={E} c={c} on={c === color} />)}
      </div>
      <h3 className="sub-h" id="av-recent-h">Recent colors</h3>
      <div className="swatches" id="av-recent" role="group" aria-labelledby="av-recent-h">
        {recent.length ? recent.map(c => <Swatch key={c} E={E} c={c} on={c === color} />)
          : <p className="help av-recent-empty">Custom colors you use show up here.</p>}
      </div>
    </div>
  );
}

function Swatch({ E, c, on }) {
  return (
    <button type="button" className="swatch" style={{ background: c }} data-c={c} aria-label={'Color ' + c} aria-pressed={on} title={c}
      onClick={() => { E.Editor.setColor(c); E.Sfx.play('click'); }} />
  );
}

// The swatch opens the system color picker (live while you drag; the color you settle on joins Recent colors).
// The hex field takes #RGB or #RRGGBB on Enter or when it loses focus.
function ColorRow({ E, color }) {
  const Ed = E.Editor;
  const picker = useRef(null), field = useRef(null);
  const [hex, setHex] = useState(color);
  useEffect(() => { if (document.activeElement !== field.current) setHex(color); }, [color]);
  useEffect(() => {
    const el = picker.current; if (!el) return;
    const done = () => Ed.setColor(el.value, true); // the native change event: the picker closed on this color
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [Ed]);
  const commit = () => {
    const v = hex.trim();
    if (!v || v.toUpperCase() === color) { setHex(color); return; }
    if (!Ed.commitHex(v)) setHex(color);
  };
  return (
    <div className="color-row">
      <label className="cur-swatch" id="cur-swatch" title="Pick a custom color" style={{ background: color }}>
        <input type="color" id="av-color" ref={picker} value={color.toLowerCase()} aria-label="Custom color" onChange={e => Ed.setColor(e.target.value)} />
      </label>
      <input className="text-input hex-input" id="av-hex" ref={field} value={hex} maxLength={7} aria-label="Hex color" spellCheck={false} autoComplete="off" autoCapitalize="characters" enterKeyHint="done"
        onChange={e => setHex(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setHex(color); setTimeout(() => field.current && field.current.blur(), 0); }
        }} />
    </div>
  );
}
