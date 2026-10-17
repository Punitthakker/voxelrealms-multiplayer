'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// Pencil, eraser, fill bucket, eyedropper; mirror and brush sizes; grid and randomize.
export default function Tools({ E }) {
  const Ed = E.Editor, st = E.editorStore;
  const tool = useStore(st, s => s.tool);
  const size = useStore(st, s => s.size);
  const mirror = useStore(st, s => s.mirror);
  const grid = useStore(st, s => s.grid);
  const ready = useStore(st, s => s.ready);
  const key = k => (E.IS_TOUCH ? '' : ` (${k})`);
  const click = fn => () => { fn(); E.Sfx.play('click'); };
  return (
    <div className="av-tools" role="toolbar" aria-label="Paint tools">
      {E.EDITOR_TOOLS.map(t => (
        <button key={t.id} type="button" className="tool" data-tool={t.id} aria-pressed={tool === t.id} aria-label={t.label} title={t.label + key(t.key)} onClick={click(() => Ed.setTool(t.id))}>
          <Icon name={t.icon} />
        </button>
      ))}
      <span className="tool-sep av-sep-tools" aria-hidden="true" />
      <span className="av-tools-break" aria-hidden="true" />
      <button type="button" className="tool" id="opt-mirror" aria-pressed={mirror} aria-label="Mirror left and right" title={'Mirror left and right' + key('M')} onClick={click(() => Ed.toggleMirror())}>
        <Icon name="mirror" />
      </button>
      {E.EDITOR_SIZES.map(n => (
        <button key={n} type="button" className="tool size-btn" data-size={n} aria-pressed={size === n} aria-label={`Brush size ${n} pixel${n > 1 ? 's' : ''}`} title={`Brush size ${n}` + key(n)} onClick={click(() => Ed.setSize(n))}>
          {n}
        </button>
      ))}
      <span className="tool-sep" aria-hidden="true" />
      <button type="button" className="tool" id="opt-grid" aria-pressed={grid} aria-label="Show pixel grid" title="Show pixel grid on the map" onClick={click(() => Ed.toggleGrid())}>
        <Icon name="grid" />
      </button>
      <button type="button" className="tool" id="opt-random" aria-label="Randomize skin" title="Randomize skin" disabled={!ready} onClick={() => Ed.randomize()}>
        <Icon name="dice" />
      </button>
    </div>
  );
}
