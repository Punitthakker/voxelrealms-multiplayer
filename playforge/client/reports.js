// Player reports from the game screen: POST /api/pf/reports.
// sendReport({target, targetNick, game, reason, note, recent}) -> Promise<{ok: true}>; reason is one of
// language, bullying, name, cheating, other; recent is the reported player's last chat lines (up to 5).
import { api } from './api.js';

export function sendReport({ target = null, targetNick = null, game = null, reason, note = '', recent = [] } = {}) {
  return api('POST', '/reports', {
    target: target || null, targetNick: targetNick ? String(targetNick).slice(0, 40) : null, game: game || null, reason,
    note: String(note || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    recent: (Array.isArray(recent) ? recent : []).slice(-5).map(s => String(s).slice(0, 150)),
  });
}
