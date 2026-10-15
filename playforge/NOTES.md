# PlayForge build notes

`playforge.html` is the whole app: one self-contained page published as a claude.ai artifact
(https://claude.ai/artifact/XwYbKNyGebjkMygmRdZyFF). It loads three.js r128 from cdnjs. All art is
canvas-generated and all sound is WebAudio.

## Capabilities and data

Declared capabilities: `user` (profile scope), `db`, and `downloads`. `room` arrives in Phase 2 and `sample` in Phase 5.

| Path | Who reads | Who writes | Holds |
| --- | --- | --- | --- |
| `players/<userId>` | everyone admitted (`view`) | that player (`interact`), or the owner | worn skin (PNG data URL), custom display name |
| `data/users/<userId>/skins` | only that player | only that player | 5 skin slots + which one is worn |

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
