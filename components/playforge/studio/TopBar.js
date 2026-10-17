'use client';
import { Icon } from '../Icon';
import { useStore } from '../useStore';
import { TextInput } from './fields';

// Back, the game's name, the save line, undo and redo, Game settings, Publish (only while the server answers)
// and Test.
export default function TopBar({ E, onBack, onSettings, onTest, onPublish }) {
  const S = E.Studio, st = E.studioStore;
  const title = useStore(st, s => s.title);
  const status = useStore(st, s => s.status);
  const canUndo = useStore(st, s => s.canUndo);
  const canRedo = useStore(st, s => s.canRedo);
  const publishing = useStore(st, s => s.publishing);
  const published = useStore(st, s => s.published);
  const canPublish = useStore(E.libraryStore, s => s.canPublish);
  return (
    <header className="ed-bar st-bar">
      <button type="button" className="icon-btn" id="st-back" aria-label="Back to home" title="Back to home" onClick={onBack}><Icon name="back" /></button>
      <TextInput className="st-title" id="st-title" value={title} max={40} label="Game name" onCommit={v => S.setTitle(v)} />
      <span className="ed-status" id="st-status" role="status">{status}</span>
      <div className="grow" />
      <button type="button" className="icon-btn st-hist-top" id="st-undo" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => S.undo()}><Icon name="undo" /></button>
      <button type="button" className="icon-btn st-hist-top" id="st-redo" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => S.redo()}><Icon name="redo" /></button>
      <button type="button" className="btn st-wide" id="st-game" aria-label="Game settings" title="Game settings" onClick={onSettings}><Icon name="sliders" /><span>Game</span></button>
      {canPublish && (
        <button type="button" className="btn st-wide" id="st-publish" aria-label={published ? 'Publish the latest version' : 'Publish'} title={published ? 'Publish the latest version' : 'Publish'} disabled={publishing} aria-busy={publishing || undefined} onClick={onPublish}>
          <Icon name="upload" /><span>{publishing ? 'Publishing…' : 'Publish'}</span>
        </button>
      )}
      <button type="button" className="btn btn-ember" id="st-test" aria-label="Test your game" title="Test your game" onClick={onTest}><Icon name="play" fill /><span>Test</span></button>
    </header>
  );
}
