// E.Profile.backend: the player's skins (5 slots), worn slot and nickname on the server.
//   load() -> {slots, active, nick} | null (null: this player never saved, so the device copy stays)
//   save({slots, active, nick, skin}) -> updates the private slots and the public player (others see the skin)
import { api } from './api.js';

export const profileBackend = {
  // How the last load went: 'ok' (the server had a profile), 'empty' (never saved) or 'failed' (no answer).
  // Only an 'empty' server copy may be filled from this device; after 'failed' the server copy is unknown.
  loaded: '',
  async load() {
    let d;
    try { d = await api('GET', '/me/profile'); } catch (e) { this.loaded = 'failed'; throw e; }
    if (!d || !d.updatedAt) { this.loaded = 'empty'; return null; }
    this.loaded = 'ok';
    return { slots: (d.slots || []).map(s => s || null), active: d.active | 0, nick: d.nick || '' };
  },
  async save({ slots, active, nick, skin }) {
    await api('PUT', '/me/profile', {
      slots: (slots || []).slice(0, 5).map(s => s || ''), active: active | 0, nick: nick || '', skin: skin || '',
    });
  },
};
