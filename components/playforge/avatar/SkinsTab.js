'use client';
import { useEffect, useRef } from 'react';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// Your five skin slots (the one you edit, the one you wear), the starter skins, randomize, PNG import and download.
export default function SkinsTab({ E, hidden }) {
  const Ed = E.Editor, st = E.editorStore;
  const slots = useStore(st, s => s.slots);
  const slot = useStore(st, s => s.slot);
  const worn = useStore(st, s => s.worn);
  const ready = useStore(st, s => s.ready);
  const canDownload = useStore(st, s => s.canDownload);
  const file = useRef(null);
  return (
    <div className="tab-panel" id="tab-skins" role="tabpanel" aria-labelledby="tab-btn-skins" hidden={hidden}>
      <h3 className="sub-h" id="av-slots-h">Your skin slots</h3>
      <div className="slots" id="av-slots" role="group" aria-labelledby="av-slots-h">
        {slots.map((png, i) => <Slot key={i} E={E} i={i} png={png} editing={i === slot} wearing={i === worn && !!png} />)}
      </div>
      <p className="help" id="slots-help">{E.IS_TOUCH ? 'Tap' : 'Choose'} a slot to edit it. Save puts your changes in that slot, and you wear it.</p>
      <h3 className="sub-h" id="av-starters-h">Starter skins</h3>
      <div className="starters" id="av-starters" role="group" aria-labelledby="av-starters-h">
        {E.STARTERS.map((s, i) => <Starter key={i} E={E} i={i} name={s.name} disabled={!ready} />)}
      </div>
      <div className="btn-row">
        <button type="button" className="btn" id="av-random2" disabled={!ready} onClick={() => Ed.randomize()}><Icon name="dice" />Randomize</button>
        <button type="button" className="btn" id="av-import-btn" disabled={!ready} onClick={() => file.current && file.current.click()}><Icon name="upload" />Import PNG</button>
        <input type="file" id="av-import" ref={file} accept="image/png" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) Ed.importFile(f); }} />
        {canDownload && <button type="button" className="btn" id="av-export" disabled={!ready} onClick={() => Ed.download()}><Icon name="download" />Download PNG</button>}
      </div>
      <p className="help">Import takes a 64 × 64 PNG.{canDownload ? ' Download a skin to see where each part goes.' : ''}</p>
    </div>
  );
}

// The slot being edited shows the skin as you paint it; the others draw their saved PNG.
function Slot({ E, i, png, editing, wearing }) {
  const ref = useRef(null);
  const filled = !!png, pic = filled || editing;
  useEffect(() => {
    const c = ref.current; if (!c) return;
    if (editing) return E.Editor.bindThumb(c);
    let live = true; const tmp = E.newSkinCanvas();
    E.drawPngTo(tmp, png).then(ok => { if (ok && live) E.drawFigure(c, tmp); });
    return () => { live = false; };
  }, [E, editing, png, pic]);
  const label = `Slot ${i + 1}${filled ? '' : ', empty'}${wearing ? ', worn' : ''}${editing ? ', editing' : ''}`;
  return (
    <button type="button" className={'slot' + (editing ? ' editing' : '') + (wearing ? ' wearing' : '')} data-slot={i} aria-pressed={editing} aria-label={label} title={label}
      onClick={() => E.Editor.selectSlot(i)}>
      {pic ? <canvas ref={ref} className="px" width="16" height="32" /> : <span className="empty"><Icon name="plus" /></span>}
      <span className="slot-n">{i + 1}</span>
    </button>
  );
}

function Starter({ E, i, name, disabled }) {
  const ref = useRef(null);
  useEffect(() => { const c = E.STARTER_CANVASES[i]; if (c && ref.current) E.drawFigure(ref.current, c); }, [E, i]);
  return (
    <button type="button" className="starter" data-starter={i} disabled={disabled} aria-label={`Use the ${name} starter skin`} onClick={() => E.Editor.applyStarter(i)}>
      <canvas ref={ref} className="px" width="16" height="32" />
      <span>{name}</span>
    </button>
  );
}
