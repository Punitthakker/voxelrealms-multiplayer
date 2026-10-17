'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// Back, the save line, undo, redo and Save.
export default function TopBar({ E, onBack }) {
  const Ed = E.Editor, st = E.editorStore;
  const ready = useStore(st, s => s.ready);
  const status = useStore(st, s => s.status);
  const dirty = useStore(st, s => s.dirty);
  const saving = useStore(st, s => s.saving);
  const canUndo = useStore(st, s => s.canUndo);
  const canRedo = useStore(st, s => s.canRedo);
  const mod = E.IS_TOUCH ? '' : /Mac|iPhone|iPad/.test(navigator.platform || '') ? 'Cmd' : 'Ctrl';
  const keys = k => (mod ? ` (${mod}+${k})` : '');
  return (
    <header className="ed-bar">
      <button type="button" className="icon-btn" id="av-back" aria-label="Back to home" title="Back to home" onClick={onBack}><Icon name="back" /></button>
      <h1 className="ed-title">Avatar</h1>
      <span className={'ed-status' + (dirty ? ' dirty' : '')} id="av-status" role="status">{ready ? status : 'Loading…'}</span>
      <div className="grow" />
      <button type="button" className="icon-btn" id="av-undo" aria-label="Undo" title={'Undo' + keys('Z')} disabled={!canUndo} onClick={() => Ed.doUndo()}><Icon name="undo" /></button>
      <button type="button" className="icon-btn" id="av-redo" aria-label="Redo" title={'Redo' + keys('Y')} disabled={!canRedo} onClick={() => Ed.doRedo()}><Icon name="redo" /></button>
      <button type="button" className="btn btn-ember" id="av-save" title={'Save and wear this skin' + keys('S')} disabled={!ready} aria-busy={saving || undefined} onClick={() => Ed.save()}>
        <Icon name="check" />Save
      </button>
    </header>
  );
}
