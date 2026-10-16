'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { useStore } from '../useStore';

// Chat for game rooms: the round HUD button (with the unread count) and the collapsible panel.
// Net (playforge/engine/net.js) owns the lines, the 1-per-second limit and the word filter.
export function ChatButton({ E }) {
  const inRoom = useStore(E.netStore, s => s.inRoom);
  const open = useStore(E.netStore, s => s.chatOpen);
  const unread = useStore(E.netStore, s => s.unread);
  if (!inRoom) return null;
  const label = open ? 'Hide chat' : unread ? `Chat, ${unread} new` : 'Chat';
  return (
    <button
      type="button" className="hud-round" id="hud-chat" aria-label={label} aria-expanded={open} aria-controls="chat"
      onClick={() => { E.Net.setChatOpen(!open); E.Sfx.play('click'); }}
    >
      <Icon name="chat" />
      {unread > 0 && !open && <span className="chat-badge" id="chat-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

export function ChatPanel({ E }) {
  const inRoom = useStore(E.netStore, s => s.inRoom);
  const open = useStore(E.netStore, s => s.chatOpen);
  const lines = useStore(E.netStore, s => s.lines);
  const mutes = useStore(E.netStore, s => s.mutes);
  const status = useStore(E.netStore, s => s.status);
  const note = useStore(E.netStore, s => s.note);
  const canChat = useStore(E.netStore, s => s.canChat);
  const focusSeq = useStore(E.netStore, s => s.focusSeq);
  const [text, setText] = useState('');
  const input = useRef(null), log = useRef(null), stick = useRef(true);

  useEffect(() => { if (focusSeq && input.current) input.current.focus({ preventScroll: true }); }, [focusSeq]);
  // Follow new lines while the reader is at the bottom; leave them alone while they scroll back.
  useLayoutEffect(() => { const el = log.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [lines, open]);
  useEffect(() => { if (open) stick.current = true; }, [open]);
  if (!inRoom) return null;

  const muted = new Set(mutes);
  const shown = lines.filter(l => !l.key || l.mine || !muted.has(l.key));
  const submit = e => {
    e.preventDefault();
    if (E.Net.send(text)) { setText(''); stick.current = true; }
  };
  return (
    <section className="chat-panel" id="chat" aria-label="Chat" hidden={!open}>
      <div className="chat-head">
        <b>Chat</b>
        <small id="chat-status" role="status">{status}</small>
        <button type="button" id="chat-close" aria-label="Collapse chat" onClick={() => { E.Net.setChatOpen(false); E.Sfx.play('click'); }}>
          <Icon name="chev-up" />
        </button>
      </div>
      <ol id="chat-log" ref={log} aria-live="polite" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40; }}>
        {shown.map(l => (l.system
          ? <li key={l.id} className="sys">{l.text}</li>
          : <li key={l.id}><span className="who" style={{ color: l.color }}>{l.name}</span>{l.text}</li>))}
      </ol>
      <p className="chat-note" id="chat-note" role="status" hidden={!note}>{note}</p>
      <form className="chat-form" id="chat-form" autoComplete="off" onSubmit={submit}>
        <input
          ref={input} id="chat-input" maxLength={E.CHAT_MAX} value={text} onChange={e => setText(e.target.value)}
          placeholder={canChat ? 'Say something nice…' : 'Chat is read-only for you'} disabled={!canChat}
          enterKeyHint="send" spellCheck aria-label="Chat message"
          onFocus={() => E.Input.release()}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); } }}
        />
        <span className="cnt" id="chat-count" aria-hidden="true">{text.length}/{E.CHAT_MAX}</span>
        <button type="submit" id="chat-send" aria-label="Send message" disabled={!canChat}><Icon name="send" /></button>
      </form>
    </section>
  );
}
