'use client';
import { useRef } from 'react';
import { useStore } from '../useStore';
import PaintTab from './PaintTab';
import SkinsTab from './SkinsTab';
import NameTab from './NameTab';

const TABS = [['paint', 'Paint'], ['skins', 'Skins'], ['name', 'Name']];

// The side panel (under the stage on phones): Paint, Skins and Name tabs. Every tab stays mounted (hidden when not
// chosen) so the flat map keeps its place and the name field keeps what you typed.
export default function Panel({ E }) {
  const tab = useStore(E.editorStore, s => s.tab);
  const list = useRef(null);
  const choose = (t, focus) => {
    if (t !== tab) { E.Editor.setTab(t); E.Sfx.play('click'); }
    if (focus && list.current) { const b = list.current.querySelector(`#tab-btn-${t}`); if (b) b.focus(); }
  };
  const onKey = e => {
    const i = TABS.findIndex(([id]) => id === tab); let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') j = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = TABS.length - 1;
    if (j < 0) return;
    e.preventDefault(); choose(TABS[j][0], true);
  };
  return (
    <div className="av-panel">
      <div className="tabs" role="tablist" aria-label="Avatar panels" ref={list} onKeyDown={onKey}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-btn-${id}`} aria-selected={tab === id} aria-controls={`tab-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => choose(id)}>
            {label}
          </button>
        ))}
      </div>
      <PaintTab E={E} hidden={tab !== 'paint'} />
      <SkinsTab E={E} hidden={tab !== 'skins'} />
      <NameTab E={E} hidden={tab !== 'name'} />
    </div>
  );
}
