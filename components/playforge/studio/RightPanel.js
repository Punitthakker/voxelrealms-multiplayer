'use client';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../Icon';
import { useStore } from '../useStore';
import Properties from './Properties';

// The Explorer (every part, groups folded in) above Properties. On desktop it is the right column; on phones a
// drawer that the dock opens at either half.
export default function RightPanel({ E, phone }) {
  const S = E.Studio;
  const drawer = useStore(E.studioStore, s => s.drawer);
  const pane = useStore(E.studioStore, s => s.pane);
  const seq = useStore(E.studioStore, s => s.drawerSeq);
  const count = useStore(E.studioStore, s => s.count);
  const open = drawer === 'st-right';
  const panel = useRef(null), head = useRef(null);
  useEffect(() => {
    if (!open || !panel.current) return;
    const t = setTimeout(() => {
      if (pane === 'props' && head.current) panel.current.scrollTop = Math.max(0, head.current.offsetTop - 1);
      else if (pane === 'explorer') panel.current.scrollTop = 0;
    }, 30);
    return () => clearTimeout(t);
  }, [open, pane, seq]);
  return (
    <aside className={'st-right st-panel' + (open ? ' open' : '')} id="st-right" aria-label="Explorer and properties" ref={panel} inert={phone && !open ? true : undefined}>
      <div className="st-ph">
        <h2>Explorer</h2>
        <span className="st-count" id="st-count">{count} / {E.GAME_LIMITS.parts} parts</span>
        <button type="button" className="icon-btn st-close" aria-label="Close panel" onClick={() => S.closeDrawers()}><Icon name="close" /></button>
      </div>
      <Actions E={E} />
      <ExplorerList E={E} />
      <div className="st-ph st-ph2" id="st-props-head" ref={head}>
        <h2>Properties</h2>
        <button type="button" className="icon-btn st-close" aria-label="Close panel" onClick={() => S.closeDrawers()}><Icon name="close" /></button>
      </div>
      <Properties E={E} />
    </aside>
  );
}

function Actions({ E }) {
  const S = E.Studio;
  const sel = useStore(E.studioStore, s => s.sel);
  useStore(E.studioStore, s => s.rev);
  const ps = S.doc ? S.selParts() : [], g = ps.length ? S.selGroup() : null;
  return (
    <div className="st-ex-acts">
      <button type="button" className="btn btn-sm" id="st-group" disabled={ps.length < 2 || !!g} onClick={() => S.group()} title="Group (Ctrl+G)"><Icon name="folder" />Group</button>
      <button type="button" className="btn btn-sm" id="st-ungroup" disabled={!ps.some(p => p.parent)} onClick={() => S.ungroup()} title="Ungroup (Ctrl+Shift+G)">Ungroup</button>
      <button type="button" className="btn btn-sm" id="st-dup2" disabled={!sel.length} onClick={() => S.duplicate()} title="Duplicate (Ctrl+D)"><Icon name="copy" />Duplicate</button>
      <button type="button" className="icon-btn" id="st-del2" aria-label="Delete selected" title="Delete" disabled={!sel.length} onClick={() => S.remove()}><Icon name="trash" /></button>
    </div>
  );
}

function ExplorerList({ E }) {
  const S = E.Studio;
  const rev = useStore(E.studioStore, s => s.rev);
  const sel = useStore(E.studioStore, s => s.sel);
  const on = useMemo(() => new Set(sel), [sel]);
  const rows = S.rows(), start = S.startSpawn();
  const pick = e => {
    const b = e.target.closest('.st-row'); if (!b) return;
    S.listSelect(b.dataset.id, e.shiftKey || e.ctrlKey || e.metaKey);
  };
  return (
    <div className="st-list" id="st-list" role="listbox" aria-label="Parts in your game" aria-multiselectable="true" onClick={pick} onDoubleClick={() => S.focusSel()}>
      {rows.map(r => {
        const picked = r.kind === 'grp' ? r.n > 0 && S.kids(r.p.id).every(k => on.has(k)) : on.has(r.p.id);
        return <Row key={r.p.id} p={r.p} kind={r.kind} n={r.n} on={picked} start={r.p === start} rev={rev} E={E} />;
      })}
      {rows.more && <div className="st-more">Showing the first {rows.max} rows. {E.IS_TOUCH ? 'Tap' : 'Click'} parts in the 3D view to pick the rest.</div>}
    </div>
  );
}

const Row = memo(function Row({ p, kind, n, on, start, E }) {
  const cls = 'st-row' + (kind ? ' ' + kind : '') + (on ? ' sel' : '');
  if (kind === 'grp') {
    return (
      <button type="button" className={cls} data-id={p.id} role="option" aria-selected={on}>
        <Icon name="folder" /><span className="nm">{p.name}</span><span className="tag">{n}</span>
      </button>
    );
  }
  const tag = start ? 'Start' : p.behavior ? (E.BEHAVIOR_INFO[p.behavior] || {}).short || p.behavior : p.tag || '';
  return (
    <button type="button" className={cls} data-id={p.id} role="option" aria-selected={on}>
      <span className="sw" style={{ background: p.color }} /><span className="nm">{p.name}</span>
      {tag && <span className={'tag' + (start ? ' start' : '')}>{tag}</span>}
      {p.locked && <span className="tag locked">Locked</span>}
    </button>
  );
});
