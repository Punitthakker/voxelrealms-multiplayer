'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// The 3D view (Studio handles its pointer input), the tool bar, the selection bar, the hint line and, on phones,
// the dock that opens the drawers.
export default function Stage({ E, viewRef }) {
  const S = E.Studio, st = E.studioStore;
  const tool = useStore(st, s => s.tool);
  const snapOn = useStore(st, s => s.snapOn);
  const snapStep = useStore(st, s => s.snapStep);
  const canUndo = useStore(st, s => s.canUndo);
  const canRedo = useStore(st, s => s.canRedo);
  const hint = useStore(st, s => s.hint);
  const drawer = useStore(st, s => s.drawer);
  const pane = useStore(st, s => s.pane);
  return (
    <div className="st-stage">
      <div className="st-view" id="st-view" ref={viewRef} role="region" aria-label="3D view of your game" />
      <div className="st-tools" role="toolbar" aria-label="Tools">
        {E.STUDIO_TOOLS.map(([t, label, icon], i) => (
          <button key={t} type="button" className="tool" data-tool={t} aria-pressed={tool === t} aria-label={`${label} (${i + 1})`} title={`${label} (${i + 1})`} onClick={() => S.setTool(t)}>
            <Icon name={icon} />
          </button>
        ))}
        <span className="tool-sep" aria-hidden="true" />
        <button type="button" className="tool st-snap" id="st-snap" aria-pressed={snapOn} aria-label={snapOn ? `Snap to grid: ${snapStep}` : 'Snap to grid: off'} title="Snap to grid (G)" onClick={() => S.cycleSnap()}>
          <Icon name="grid" /><span id="st-snap-v">{snapOn ? String(snapStep) : 'Off'}</span>
        </button>
        <span className="tool-sep st-hist-tools" aria-hidden="true" />
        <button type="button" className="tool st-hist-tools" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => S.undo()}><Icon name="undo" /></button>
        <button type="button" className="tool st-hist-tools" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => S.redo()}><Icon name="redo" /></button>
      </div>
      <SelBar E={E} />
      <div className="stage-hint st-hint" id="st-hint">{hint}</div>
      <nav className="st-dock" aria-label="Studio panels">
        <button type="button" className="btn" data-drawer="st-left" aria-expanded={drawer === 'st-left'} onClick={() => S.toggleDrawer('st-left')}><Icon name="plus" />Insert</button>
        <button type="button" className="btn" data-drawer="st-right" data-pane="explorer" aria-expanded={drawer === 'st-right' && pane === 'explorer'} onClick={() => S.toggleDrawer('st-right', 'explorer')}><Icon name="layers" />Explorer</button>
        <button type="button" className="btn" data-drawer="st-right" data-pane="props" aria-expanded={drawer === 'st-right' && pane === 'props'} onClick={() => S.toggleDrawer('st-right', 'props')}><Icon name="sliders" />Properties</button>
        <button type="button" className="btn st-hist-dock" aria-label="Undo" disabled={!canUndo} onClick={() => S.undo()}><Icon name="undo" /></button>
        <button type="button" className="btn st-hist-dock" aria-label="Redo" disabled={!canRedo} onClick={() => S.redo()}><Icon name="redo" /></button>
      </nav>
    </div>
  );
}

function SelBar({ E }) {
  const S = E.Studio;
  const sel = useStore(E.studioStore, s => s.sel);
  useStore(E.studioStore, s => s.rev);
  if (!sel.length) return <div className="st-sel-bar" id="st-sel-bar" hidden />;
  return (
    <div className="st-sel-bar" id="st-sel-bar" role="group" aria-label="Selection">
      <span id="st-sel-name">{S.selLabel()}</span>
      <button type="button" className="btn btn-sm" id="st-dup" onClick={() => S.duplicate()}><Icon name="copy" />Duplicate</button>
      <button type="button" className="btn btn-sm btn-danger" id="st-del" onClick={() => S.remove()}><Icon name="trash" />Delete</button>
    </div>
  );
}
