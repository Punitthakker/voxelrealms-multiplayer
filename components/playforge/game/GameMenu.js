'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon, Mark } from '../Icon';
import { Modal } from '../Modal';
import { useStore } from '../useStore';

// The game menu (menu button or Escape): Resume, the players in this room, Reset character, Settings, Leave.
export default function GameMenu({ E, title, test }) {
  const open = useStore(E.gameStore, s => s.menuOpen);
  const [report, setReport] = useState(null);
  const close = useCallback(() => E.Game.closeMenu(), [E]);
  const closeReport = useCallback(() => setReport(null), []);
  useEffect(() => { if (open) { E.Net.publishPlayers(); E.Sfx.play('open'); } }, [E, open]);
  useEffect(() => { if (report) E.Sfx.play('open'); }, [E, report]);
  return (
    <>
      <Modal open={open} onClose={close} className="menu-sheet" titleId="gm-title" hideClose>
        <div className="sheet-head">
          <Mark className="menu-mark" />
          <h2 id="gm-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <div className="menu-list">
          <button type="button" className="primary" id="gm-resume" data-autofocus onClick={close}><Icon name="play" fill />Resume</button>
        </div>
        <Players E={E} onReport={peer => { const t = E.Net.reportTarget(peer); if (t) setReport(t); }} />
        <div className="menu-list two">
          <button type="button" id="gm-reset" onClick={() => { close(); E.Game.kill('reset'); }}><Icon name="reset" />Reset character</button>
          <button type="button" id="gm-settings" onClick={() => E.openSettings()}><Icon name="sliders" />Settings</button>
        </div>
        <div className="menu-list">
          <button type="button" className="danger" id="gm-leave" onClick={() => E.Game.leave()}><Icon name="leave" />{test ? 'Stop test' : 'Leave game'}</button>
        </div>
      </Modal>
      <ReportSheet E={E} target={report} onClose={closeReport} />
    </>
  );
}

function Players({ E, onReport }) {
  const players = useStore(E.netStore, s => s.players);
  const count = useStore(E.netStore, s => s.count);
  const empty = useStore(E.netStore, s => s.empty);
  const inRoom = useStore(E.netStore, s => s.inRoom);
  const canReport = useStore(E.netStore, s => s.canReport);
  return (
    <section className="plist" aria-labelledby="gm-ph">
      <div className="plist-head"><h3 className="sub-h" id="gm-ph">Players</h3><small id="gm-pcount">{count}</small></div>
      <div className="plist-rows" id="gm-players">
        {players.map(p => (
          <div className="prow" key={p.id}>
            <Head E={E} skin={p.skin} ver={p.ver} />
            <div>
              <div className="pn">{p.name}</div>
              <div className="tags">
                {p.me && <span className="chip you">You</span>}
                {inRoom && p.host && <span className="chip host">Host</span>}
                {p.sameUser && <span className="chip">Your other tab</span>}
                {p.guest && <span className="chip">Guest</span>}
                {p.muted && <span className="chip muted">Muted</span>}
                {p.away && <span className="chip">Away</span>}
              </div>
            </div>
            {!p.me && !p.sameUser && (
              <div className="acts">
                <button type="button" className="btn btn-sm" aria-label={`${p.muted ? 'Unmute' : 'Mute'} ${p.name}`} onClick={() => E.Net.toggleMute(p.id)}>
                  {p.muted ? 'Unmute' : 'Mute'}
                </button>
                {canReport && (
                  <button type="button" className="btn btn-sm btn-danger" aria-label={`Report ${p.name}`} onClick={() => onReport(p.id)}>Report</button>
                )}
              </div>
            )}
          </div>
        ))}
        {empty && <p className="help">{empty}</p>}
      </div>
    </section>
  );
}

// The 8 × 8 face from a skin canvas.
function Head({ E, skin, ver }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && skin) E.drawHead(ref.current, skin); }, [E, skin, ver]);
  return <canvas ref={ref} width={8} height={8} className="px" aria-hidden="true" />;
}

function ReportSheet({ E, target, onClose }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(null); setNote(''); setBusy(false); }, [target]);
  const send = async () => {
    if (!target || !reason || busy) return;
    setBusy(true);
    const ok = await E.Net.sendReport(target, reason, note);
    if (ok) onClose(); else setBusy(false);
  };
  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Report ${target.name}` : 'Report player'} titleId="rp-title" closeLabel="Close report">
      <p className="help">Reports go to the PlayForge team with this player&apos;s last few chat messages. The player isn&apos;t told who reported them.</p>
      <div className="field">
        <b id="rp-reason-label">What happened?</b>
        <div className="reasons" id="rp-reasons" role="radiogroup" aria-labelledby="rp-reason-label">
          {E.REPORT_REASONS.map(([v, label]) => (
            <button key={v} type="button" className="reason" role="radio" aria-checked={reason === v} onClick={() => { setReason(v); E.Sfx.play('click'); }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="rp-note"><b>Anything else?</b> <span className="help">Optional</span></label>
        <textarea className="text-input" id="rp-note" maxLength={200} rows={3} value={note} onChange={e => setNote(e.target.value)} />
      </div>
      <div className="choice-btns">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-ember" id="rp-send" disabled={!reason || busy} onClick={send}>{busy ? 'Sending…' : 'Send report'}</button>
      </div>
    </Modal>
  );
}
