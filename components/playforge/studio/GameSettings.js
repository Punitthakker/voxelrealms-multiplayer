'use client';
import { useCallback, useState } from 'react';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { useStore } from '../useStore';
import { NumInput, Range, Select, TextInput } from './fields';

const cap = s => s[0].toUpperCase() + s.slice(1);

// The Game settings sheet: name, description, sky, gravity, rules, time limit, fall height, download, unpublish
// and delete. Every change is saved at once.
export default function GameSettings({ E, open, onClose, onDeleted }) {
  const S = E.Studio;
  useStore(E.studioStore, s => s.metaRev);
  const published = useStore(E.studioStore, s => s.published);
  const canPublish = useStore(E.libraryStore, s => s.canPublish);
  const close = useCallback(() => onClose(), [onClose]);
  const [liveGrav, setLiveGrav] = useState(null);
  const d = S.doc;
  if (!open || !d) return null;
  const sky = E.ENV[d.env.sky] ? d.env.sky : 'day', mode = E.Modes[d.mode] ? d.mode : 'custom';
  const grav = S.gravity();
  const del = async () => {
    const offlinePub = d.publishedAt && !E.Library.canPublish();
    const ok = await E.askChoice({
      title: `Delete ${d.title}?`,
      body: d.publishedAt
        ? offlinePub ? "This removes it from this device. PlayForge can't be reached right now, so it stays published until you unpublish it from its game page." : 'This removes it from this device and unpublishes it, so nobody can play it any more. This cannot be undone.'
        : 'This removes it from this device. This cannot be undone.',
      buttons: [{ label: 'Keep it', value: false }, { label: 'Delete', value: true, kind: 'danger' }],
    });
    if (ok !== true) return;
    onClose();
    if (await S.deleteGame()) onDeleted();
  };
  const unpublish = async () => {
    const ok = await E.askChoice({
      title: `Unpublish ${d.title}?`, body: 'It leaves the home screen and its link stops working. Your draft stays on this device, and you can publish it again later.',
      buttons: [{ label: 'Keep it published', value: false }, { label: 'Unpublish', value: true, kind: 'danger' }],
    });
    if (ok === true) await S.unpublish();
  };
  return (
    <Modal open onClose={close} id="st-game-modal" title="Game settings" titleId="sg-title" className="st-settings" closeLabel="Close game settings">
      <div className="field"><label htmlFor="sg-name"><b>Name</b></label>
        <TextInput id="sg-name" value={d.title || ''} max={40} onCommit={v => S.setTitle(v)} />
      </div>
      <div className="field"><label htmlFor="sg-desc"><b>Description</b> <span className="help">Shown on your game&apos;s page</span></label>
        <TextInput id="sg-desc" multiline rows={3} value={d.desc || ''} max={200} onCommit={v => S.setDesc(v)} />
      </div>
      <div className="field"><label htmlFor="sg-sky"><b>Sky</b></label>
        <Select id="sg-sky" value={sky} opts={E.ENV_KEYS.map(k => [k, cap(k)])} onChange={v => S.setSky(v)} />
      </div>
      <div className="field">
        <div className="set-row"><label htmlFor="sg-grav"><b>Gravity</b></label><span className="set-val" id="sg-grav-v">{Math.round((liveGrav ?? grav) * 100)}%</span></div>
        <Range id="sg-grav" min="0.2" max="1.6" step="0.05" value={grav} onLive={setLiveGrav} onCommit={v => { setLiveGrav(null); S.setGravity(v); }} />
      </div>
      <div className="field"><label htmlFor="sg-mode"><b>Rules</b></label>
        <Select id="sg-mode" value={mode} opts={S.rulesOptions()} onChange={v => S.setRules(v)} />
        <p className="help" id="sg-mode-help">{S.rulesHelp(mode)}</p>
      </div>
      <div className="st-two">
        <div className="field"><label htmlFor="sg-time"><b>Time limit</b> <span className="help">seconds, 0 = none</span></label>
          <NumInput id="sg-time" value={Number(d.modeOpts.timeLimit) || 0} min="0" max="3600" step="5" disabled={mode !== 'custom'} onCommit={v => S.setTimeLimit(v)} />
        </div>
        <div className="field"><label htmlFor="sg-kill"><b>Fall height</b> <span className="help">players below this respawn</span></label>
          <NumInput id="sg-kill" value={Number.isFinite(d.killY) ? d.killY : null} allowEmpty signed min="-500" max="100" step="1" placeholder="-40" onCommit={v => S.setKillY(v === null ? '' : v)} />
        </div>
      </div>
      <hr />
      <div className="btn-row">
        {E.Caps.downloads && <button type="button" className="btn" id="sg-download" onClick={() => S.download()}><Icon name="download" />Download game file</button>}
        {published && canPublish && <button type="button" className="btn" id="sg-unpublish" onClick={unpublish}>Unpublish</button>}
        <button type="button" className="btn btn-danger" id="sg-delete" onClick={del}><Icon name="trash" />Delete game</button>
      </div>
    </Modal>
  );
}
