// Connects the engine to the PlayForge server (see playforge/WEBAPP.md, Platform layer). Called once per page by
// components/playforge/engine.js after the engine started:
//   session -> E.Me and E.Caps.online, E.Profile.backend, E.Caps.room (lobby RoomClient), E.Profile.attachCloud(),
//   E.Library.init(), E.Skins.refreshWorn(), E.Profile.emit(), then E.Caps.ready = true.
// When the server can't be reached the page starts offline (solo play, drafts on this device) and keeps trying in
// the background; once it answers, everything above runs and the stores update.
//
// Also on E.Caps for engine modules that should not import this folder:
//   api(method, path, body), onServer(fn) (server broadcasts), players {getPlayer, onPlayerChanged},
//   report(fields) (player reports), downloads {save({filename, data})}.
import { getUser, onSessionChanged, startSession } from './session.js';
import { api } from './api.js';
import { getConnection, onServer } from './room.js';
import { downloads } from './downloads.js';
import { profileBackend } from './profile-backend.js';
import { getPlayer, onPlayerChanged } from './players.js';
import { sendReport } from './reports.js';

let started = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setUser(E, s) {
  const u = s.user;
  E.Me.id = u.id; E.Me.token = s.token; E.Me.accountName = u.name; E.Me.guestName = u.name;
  if (E.platformStore) E.platformStore.set({ user: { id: u.id, name: u.name, nick: u.nick || '' } });
}

export function startPlatform(E) {
  if (started) return started;
  const C = E.Caps, conn = getConnection();
  C.downloads = downloads;
  C.api = api; C.onServer = onServer; C.report = sendReport;
  C.players = { getPlayer, onPlayerChanged };
  // The lobby exists from the start and connects as soon as there is a session, so the game screen can always
  // ask it for a game room (the join times out into solo play while the server is away).
  C.room = conn.lobby(); C.roomP = Promise.resolve(C.room);
  const status = patch => { if (E.platformStore) E.platformStore.set(patch); };
  conn.onServer(m => { if (m.t === 'connected') status({ connected: true }); else if (m.t === 'disconnected') status({ connected: false }); });

  started = (async () => {
    let s = null, wait = 2000, wentOffline = false;
    for (;;) {
      try { s = await startSession(); break; }
      catch (e) {
        if (!wentOffline) {
          wentOffline = true;
          C.online = false;
          E.Library.init();
          E.Profile.emit();
          C.ready = true; status({ ready: true, online: false });
        }
        await sleep(wait); wait = Math.min(wait * 2, 60000);
      }
    }
    setUser(E, s);
    // The server forgot this device's token (its data was reset) and made a new player: carry the profile over.
    onSessionChanged(ns => {
      setUser(E, ns); E.Profile.where = 'device';
      if (E.Profile.slots.some(Boolean) || E.Profile.nick) E.Profile.persist();
      E.Profile.emit(); E.Library.refresh();
    });
    C.online = true; status({ online: true });
    E.Profile.backend = profileBackend;
    conn.start();
    await E.Profile.attachCloud();
    // A profile made on this device before it had a server copy (or while offline) is uploaded once. Not when
    // the read failed: the server may hold a newer copy, and the next save (or the next visit) syncs anyway.
    if (profileBackend.loaded === 'empty' && (E.Profile.slots.some(Boolean) || E.Profile.nick)) E.Profile.persist();
    E.Library.init();
    await E.Skins.refreshWorn();
    E.Profile.emit();
    C.ready = true; status({ ready: true, online: true });
    return E;
  })().catch(e => { console.error('PlayForge: platform start-up failed', e); C.ready = true; status({ ready: true }); return E; });
  return started;
}

// The signed-in player ({id, name, nick}) or null before the session started.
export { getUser };
