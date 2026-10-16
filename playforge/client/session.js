// The PlayForge session. There are no passwords: a device token is the account. It is kept in
// localStorage['pf.v2.session']; a new device (or a cleared browser) starts a new guest player.
// POST /api/pf/session {token?} -> {token, user: {id, name, nick}}.
const KEY = 'pf.v2.session';
let current = null;   // {token, user}
let starting = null;  // the request in flight
const listeners = new Set();

function readToken() {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) return '';
    if (raw[0] === '{') { const j = JSON.parse(raw); return j && typeof j.token === 'string' ? j.token : ''; }
    return raw;
  } catch (e) { return ''; }
}
function writeToken(t) { try { localStorage.setItem(KEY, t); } catch (e) { /* storage blocked: this tab keeps the session */ } }

export class SessionError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function request() {
  const saved = readToken();
  let res;
  try {
    res = await fetch('/api/pf/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved ? { token: saved } : {}) });
  } catch (e) { throw new SessionError(0, 'offline', 'The PlayForge server is not reachable.'); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.token !== 'string' || !body.user) {
    throw new SessionError(res.status, (body && body.code) || 'http_' + res.status, (body && body.message) || 'Could not start a session.');
  }
  if (body.token !== saved) writeToken(body.token);
  return { token: body.token, user: body.user };
}

// Starts (or resumes) the session. Tabs opening at the same moment share one new guest: creation runs under a
// cross-tab lock and the second tab then finds the first tab's token.
export function startSession() {
  if (starting) return starting;
  const run = () => request();
  const locks = typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function' ? navigator.locks : null;
  starting = (locks ? locks.request('pf.session', run) : run()).then(s => {
    const prev = current; current = s;
    if (prev && (prev.token !== s.token || prev.user.id !== s.user.id)) listeners.forEach(fn => { try { fn(s, prev); } catch (e) { console.error(e); } });
    return s;
  }).finally(() => { starting = null; });
  return starting;
}

// After the server forgot this token (its data was reset): ask again. The server answers with the same player
// when it still knows the token, otherwise with a new guest.
export function renewSession() { return startSession(); }

export function getSession() { return current; }
export function getToken() { return current ? current.token : ''; }
export function getUser() { return current ? current.user : null; }
// fn(session, previous) when the token or player changed after a renew.
export function onSessionChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
