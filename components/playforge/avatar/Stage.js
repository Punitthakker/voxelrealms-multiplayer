'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// The 3D view (the editor handles its pointers: paint, drag to turn, pinch or wheel to zoom), the layer switch,
// the turn tool and the hint line.
export default function Stage({ E, viewRef }) {
  const Ed = E.Editor, st = E.editorStore;
  const layer = useStore(st, s => s.layer);
  const turn = useStore(st, s => s.turn);
  const hint = useStore(st, s => s.hint);
  return (
    <div className="av-stage">
      <div className="av-view" id="av-view" ref={viewRef} role="img" aria-label="Your avatar in 3D. Paint on it, or drag the background to turn it." />
      <div className="av-stage-ui">
        <div className="seg" role="group" aria-label="Layer to paint">
          <button type="button" id="layer-base" aria-pressed={layer === 'base'} title="Paint the base layer" onClick={() => Ed.setLayer('base')}>Base</button>
          <button type="button" id="layer-outer" aria-pressed={layer === 'outer'} title="Paint the outer layer (hats, hair, jackets)" onClick={() => Ed.setLayer('outer')}>Outer</button>
        </div>
        <div className="grow" />
        <button type="button" className="tool" id="tool-rotate" aria-pressed={turn} aria-label="Turn tool: drag anywhere to turn the avatar" title="Turn tool: drag anywhere to turn the avatar"
          onClick={() => { Ed.toggleTurn(); E.Sfx.play('click'); }}>
          <Icon name="hand" />
        </button>
      </div>
      <div className="stage-hint" id="stage-hint">{hint}</div>
    </div>
  );
}
