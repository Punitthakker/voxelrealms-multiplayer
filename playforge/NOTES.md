# PlayForge build notes

`playforge.html` is the whole app: one self-contained page published as a claude.ai artifact
(https://claude.ai/artifact/XwYbKNyGebjkMygmRdZyFF). It loads three.js r128 from cdnjs. All art is
canvas-generated and all sound is WebAudio.

## Capabilities and data

Declared capabilities: `user` (profile scope), `db`, `downloads`, and `room` (the `chat` topic is open to Contributors and up).

| Path | Who reads | Who writes | Holds |
| --- | --- | --- | --- |
| `players/<userId>` | everyone admitted (`view`) | that player (`interact`), or the owner | worn skin (PNG data URL), custom display name |
| `data/users/<userId>/skins` | only that player | only that player | 5 skin slots + which one is worn |
| `reports/<reporterId>/items/<id>` | the artifact owner, and the reporter | the reporter | player reports: reason, note, target id, their last 5 chat lines |
| `games/<creatorId>` | everyone admitted (`view`) | that creator (`interact`), or the owner | a summary of each published game: title, description, thumbnail (jpeg data URL under 24 KB), rules, sky, part count, publisher name, times |
| `games/<creatorId>/data/<gameId>` | everyone admitted | that creator, or the owner | the full published game (compact parts) |
| `likes/<userId>` | everyone admitted | that user, or the owner | `{g: {<gameKey>: true}}`; counts are summed on each device |

On the device only (`localStorage`): Studio drafts (`pf.v1.drafts`), personal bests (`pf.v1.best`),
survival runs saved at dawn (`pf.v1.nights.<gameId>`), settings, mutes.

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

### Games, Studio and the catalogue: build 0.3
- 52 built-in games in 7 groups, all original names:
  - Featured: **Splat Rivals** (a round-based foam-blaster duel; pick Splatter, Popper or Long Shot each round,
    first to 5) and **99 Nights at Pinewood** (keep the campfire burning for 99 nights, chop trees, eat berries,
    rescue 4 lost campers, stay in the light when the Gloom comes out; the run saves at every dawn).
  - Obbies and towers (18), racing against bots (4), blasters and battles (5 more: Snowball Siege 2v2,
    Laser Lights free-for-all, King of the Hill, Push Party, Paint the Park), survival (4 more: Frost Island Nights,
    Desert Camp Nights, Shade Hunt, Lantern Trail), party games (14), explore and hang out (5).
- Game runtime (`60-game.js`): any game definition plays through one runtime: part behaviors (kill, damage,
  checkpoint, finish, coin, bounce, speed, spin, move, swing, vanish, fake, teleport), the `hazard` tag, falling
  unanchored parts, HUD chips, action buttons with keys, bots, effects, results card, personal bests, and host-run
  shared state for multiplayer rules (`Shared.act` and `hostState`).
- Studio (`76-studio.js`): make a game from a blank baseplate or "Edit a copy" of any game. Insert panel (parts,
  gameplay pieces, scenery), orbit camera (drag, pinch, wheel, WASD/QE), tap to select (first tap picks a group,
  the next one part), move/rotate/resize handles with snapping (1, 2, 4, 0.5, 0.25 studs or off; 15° turns),
  Explorer with groups, Properties (name, position, size, rotation, color, material, see-through, anchored, solid,
  behavior and its settings, tag), duplicate, delete, undo/redo (120 steps), game settings (name, description,
  sky, gravity, rules, time limit, fall height), Test and Stop, autosave to the device, Publish to everyone
  (when `db` is there and the player is signed in), and a game-file download (when `downloads` is there).
  On phones the panels are drawers with a bottom dock.
- Multiplayer in the new games: room free-for-all in Splat Rivals (hits and splats sent as acts, the host
  calls the winner); in the survival games the host runs the clock, fuel, chopped trees and eaten bushes, and
  guests send chop/feed/eat acts. Creatures and campers are simulated on each device.

