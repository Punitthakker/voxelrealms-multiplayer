// Other players' names and skins for the game screen's avatars.
//   getPlayer(id) -> Promise<{id, name, nick, skin} | null>   cached for a few minutes; null when unknown
//   onPlayerChanged(fn) -> unsubscribe                          fn(id) when that player saved their profile
// The server announces profile saves to every page ({t:'player', id}); the cache entry is dropped first, so
// getPlayer(id) inside the listener returns the new skin and name.
import { api } from './api.js';
import { onServer } from './room.js';

const TTL = 5 * 60 * 1000, ID_RE = /^p[a-z0-9]{12}$/;
const cache = new Map(); // id -> {at, p}
const listeners = new Set();
let hooked = false;

function hook() {
  if (hooked) return; hooked = true;
  onServer(m => {
    if (m.t === 'player' && typeof m.id === 'string') {
      cache.delete(m.id);
      listeners.forEach(fn => { try { fn(m.id); } catch (e) { console.error(e); } });
    } else if (m.t === 'connected' && m.reconnect) {
      // Saves made while this page was offline were missed: refresh everyone we know.
      const ids = [...cache.keys()]; cache.clear();
      ids.forEach(id => listeners.forEach(fn => { try { fn(id); } catch (e) { console.error(e); } }));
    }
  });
}

export function getPlayer(id) {
  hook();
  if (typeof id !== 'string' || !ID_RE.test(id)) return Promise.resolve(null);
  const c = cache.get(id), now = Date.now();
  if (c && now - c.at < TTL) return c.p;
  const p = api('GET', '/players/' + id).then(
    d => ({ id: d.id, name: String(d.name || ''), nick: String(d.nick || ''), skin: typeof d.skin === 'string' ? d.skin : '' }),
    e => { if (e && e.status !== 404 && cache.get(id) && cache.get(id).p === p) cache.delete(id); return null; },
  );
  cache.set(id, { at: now, p });
  return p;
}

export function onPlayerChanged(fn) { hook(); listeners.add(fn); return () => listeners.delete(fn); }
