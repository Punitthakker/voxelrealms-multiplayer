# PlayForge build notes

`playforge.html` is the whole app: one self-contained page published as a claude.ai artifact
(https://claude.ai/artifact/XwYbKNyGebjkMygmRdZyFF). It loads three.js r128 from cdnjs. All art is
canvas-generated and all sound is WebAudio.

## Capabilities and data

Declared capabilities: `user` (profile scope), `db`, `downloads`, and `room` (the `chat` topic is open to Contributors and up). `sample` arrives in Phase 5.

| Path | Who reads | Who writes | Holds |
| --- | --- | --- | --- |
| `players/<userId>` | everyone admitted (`view`) | that player (`interact`), or the owner | worn skin (PNG data URL), custom display name |
| `data/users/<userId>/skins` | only that player | only that player | 5 skin slots + which one is worn |
| `reports/<reporterId>/items/<id>` | the artifact owner, and the reporter | the reporter | player reports: reason, note, target id, their last 5 chat lines |

Room layout: the lobby (everyone with the page open) carries `{g: gameId}` presence for "N online" counts.
Each game joins the named room `join(gameId)`. Presence holds identity (`uid`, `nk`, `st`, `jt`) plus `p`, `r`, `s`, `m`, `t`,
sent at up to 10 Hz. Chat is the `chat` event topic and is never stored.

If `db` or `user` is missing, or a write is refused, everything falls back to `localStorage` on the device.

## Phase log

### Phase 0 (engine) and Phase 1 (avatar): build 0.1
- Shared WebGL renderer with Low, Medium and High presets, plus dynamic resolution.
- Forge Park starter world, built from the same part format Studio will edit
  (`shape`, `pos`, `rot`, `size`, `color`, `material`, `canCollide`, `transparency`).
- Physics: signed-distance colliders (box, wedge, sphere, cylinder, rotated) and a floating-capsule
  player (steps, slopes, coyote time, jump buffer, hold to auto-jump).
- 64×64 box-UV skin layout with a base layer (rows 0–31) and an outer layer (rows 32–63).
- Skin editor: paint on the 3D model or the flat map, with pencil, eraser, bucket, eyedropper,
  mirror, brush sizes 1–3, grid, palette and custom colors, undo and redo (60 steps), randomize,
  5 starter skins, 5 slots, PNG import and download.
- Game menu (early part of Phase 2): Resume, Reset character, Settings, Leave game.

### Phase 2 (play mode and multiplayer): build 0.2
- Each game joins its own room. Movement is sent about 10 times a second and other players are drawn 140 ms behind,
  blended between samples.
- Other players' skins load live from `players/<id>`. Their names come from a custom name or the account name.
- Chat: a collapsible panel holding the last 50 lines, bubbles above heads, the ### filter on send and receive,
  150 characters, 1 message per second (receivers also drop floods), and join and leave notices.
- Players list in the menu with You, Host, Guest and Muted tags, Mute (saved on the device), and Report (saved to `db`).
- The host is the earliest joiner. When they leave, the next earliest takes over.
- Soft cap of 10 players. Late joiners past 10 are sent home with a message.
- New setting: Chat bubbles.
