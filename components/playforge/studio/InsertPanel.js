'use client';
import { useState } from 'react';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// The Insert catalogue: parts, gameplay pieces and scenery. New parts drop where the middle of the view points.
// The left column on desktop, a drawer on phones.
export default function InsertPanel({ E, phone }) {
  const [cat, setCat] = useState('parts');
  const open = useStore(E.studioStore, s => s.drawer === 'st-left');
  const S = E.Studio;
  return (
    <aside className={'st-left st-panel' + (open ? ' open' : '')} id="st-left" aria-label="Insert" inert={phone && !open ? true : undefined}>
      <div className="st-ph">
        <h2>Insert</h2>
        <button type="button" className="icon-btn st-close" aria-label="Close Insert" onClick={() => S.closeDrawers()}><Icon name="close" /></button>
      </div>
      <div className="tabs st-tabs" role="tablist" aria-label="Insert categories">
        {E.INSERT_CATS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={'st-tab-' + k} aria-selected={cat === k} aria-controls="st-insert" data-cat={k} onClick={() => setCat(k)}>{label}</button>
        ))}
      </div>
      <div className="st-insert" id="st-insert" role="tabpanel" aria-labelledby={'st-tab-' + cat}>
        {E.ST_INSERT[cat].map(it => (
          <button key={it.label} type="button" className="st-item" aria-label={'Insert ' + it.label} onClick={() => S.insert(it)}>
            <span className="ic" style={{ background: it.color }}><Icon name={it.icon} /></span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <p className="help st-tip">New parts drop where the middle of the view points. Tip: select a part and press Duplicate to copy it.</p>
    </aside>
  );
}
