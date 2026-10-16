// E.Profile.backend: the player's skins (5 slots), worn slot and nickname on the server.
//   load() -> {slots, active, nick} | null (null: this player never saved, so the device copy stays)
//   save({slots, active, nick, skin}) -> updates the private slots and the public player (others see the skin)
import { api } from './api.js';

export const profileBackend = {
  async load() {
    const d = await api('GET', '/me/profile');
    if (!d || !d.updatedAt) return null;
    return { slots: (d.slots || []).map(s => s || null), active: d.active | 0, nick: d.nick || '' };
  },
  async save({ slots, active, nick, skin }) {
    await api('PUT', '/me/profile', {
      slots: (slots || []).slice(0, 5).map(s => s || ''), active: active | 0, nick: nick || '', skin: skin || '',
    });
  },
};
