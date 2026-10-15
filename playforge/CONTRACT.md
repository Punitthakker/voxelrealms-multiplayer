# PlayForge module contract

PlayForge is one self-contained HTML page (a claude.ai artifact) built from `playforge/src/` by `playforge/build.py`.
Everything is plain browser JavaScript in one shared `<script>` (no modules, no imports). three.js **r128** is the
global `THREE`. No other libraries, no network fetches, no image/audio files: all art is canvas or three.js
geometry, all sound is the `Sfx` synth.

Read the source files named below when you need detail. This document is the API you may rely on.

## Build and test

- Source layout: `src/*.css` (one `<style>`), `src/*.svg` (`<symbol>`s in one sprite), `src/30-markup.html` then other
  `src/*.html` (body markup), `src/*.js` concatenated in file-name order into one `<script>`. `99-boot.js` runs last.
- Top-level code in your file runs when the script loads, in file order. Only **declare** things at top level
  (`const`, `function`, `Modes.x = …`, `registerGames([...])`). Do not touch the DOM, `World`, `Game`, `Caps` or
  `Engine` at top level: those are ready only after boot. Lazy work goes in functions called later.
- Test harness (headless Chromium + software WebGL):
  `node /tmp/claude-0/-home-user-voxelrealms-multiplayer/d3ce2449-7b5e-5903-8496-f72b1d9f0475/scratchpad/harness/run.js --name YOURNAME --extra YOUR_DIR [--mock] [--pages 2] [--touch --viewport 390x844] [--dark] SCRIPT.js`
  It builds core `src/` + the files in `YOUR_DIR` (a same-named file replaces the src one), checks syntax, serves
  the page, opens pages and runs `module.exports = async ({pages, page, log, shot, wait}) => {...}`. Console errors
  are printed; screenshots go to `harness/out/YOURNAME/shots/`. See `harness/example.js`.
  `--mock` installs a fake `window.claude` (room over BroadcastChannel shared by the pages, db over localStorage,
  user ids `u_alice`, `u_bob`, …). Without it, every capability is null (solo play), which must also work.
  Headless rendering is slow (a few frames per second): wait on conditions (`wait(page, () => Game.ended)`),
  not on wall-clock time, and use the default `--preset low`.

## Globals you can use

Utilities (`40-core.js`): `$`, `$$`, `clamp`, `lerp`, `damp(a,b,rate,dt)`, `DEG`, `LS.get/set`, `hashStr(s)`,
`rng(seed) → () => [0,1)`, `pick(R, arr)`, `shade(hex, amt)`, `normHex`, `toast(msg, warn)`, `Modals.open/close`,
`askChoice({title, body, buttons:[{label, value, kind:'ember'|'danger'}]}) → Promise<value>`, `showScreen(id)`,
`Sfx.play(name)`, `WordFilter.clean(text)` / `.hasBad(text)`, `IS_TOUCH`, `Settings`, `PRESETS`, `Me` ({id, accountName, guestId}),
`Profile.displayName()`, `Caps` ({user, db, downloads, room, canWrite}), `fmtTime(s)` → `1:05.3`, `fmtClock(s)` → `1:05`,
`saveBest(key, value, lower=true) → {best, isNew, had}`, `getBest(key)`, `hitCapsule(feetPos, point, r)`.

Sounds for `Sfx.play`: click, open, jump, land, step, paint, fill, pick, save, error, spawn, respawn, die, hurt, coin, bounce,
boost, checkpoint, win, lose, break, shoot, splat, chop, pop, tick, alarm, whoosh, crackle.

Skins: `STARTERS` (5 outfits), `STARTER_CANVASES` (ready only after boot), `paintSkin(canvas, outfit, seed)`,
`randomOutfit(R)`, `newSkinCanvas()`.

## Parts

A part is plain JSON. Every level, built-in or made in Studio, is a list of parts.

```js
{ id: 'p12', name: 'Lava strip', shape: 'block' | 'wedge' | 'sphere' | 'cylinder' | 'spawn',
  pos: [x, y, z],            // center, world units (the avatar is 2 units tall, walks 8 u/s, jumps ~2.5 u high, ~5 u far)
  size: [sx, sy, sz],        // full size. Wedges slope down toward +z. Cylinders/spheres use size like a bounding box.
  rot: [rx, ry, rz],         // degrees, Euler order YXZ
  color: '#RRGGBB', material: 'plastic' | 'grass' | 'wood' | 'stone' | 'brick' | 'metal' | 'sand' | 'ice' | 'neon',
  anchored: true,            // false: falls straight down during play and settles on what's below
  canCollide: true, transparency: 0..1,
  behavior: 'kill' | 'damage' | 'checkpoint' | 'finish' | 'coin' | 'bounce' | 'speed' | 'spin' | 'move' | 'swing' | 'vanish' | 'fake' | 'teleport',
  bp: { ... },               // behavior parameters, see below
  tag: 'tree',               // free string for your mode's own rules (Game.partsByTag, Game.near, onTouch). tag 'hazard' kills on touch (use it on spinning/swinging/moving parts)
}
```

Make parts with `mkPart(shape, pos, size, color, material='plastic', extra={})` (extra merges: name, rot, behavior,
bp, tag, canCollide, transparency). `ice` is slippery. `neon` is unlit and glows. Materials tint a grey texture by
`color`. A `spawn` part is a pad; the first one is the spawn point unless the definition gives `spawn`.

Built-in behaviors (handled by the runtime for the local player; your mode can override through `onTouch`):

| behavior | bp | effect |
| --- | --- | --- |
| kill | | touching kills (respawn at last checkpoint) |
| damage | dps (25) | damage per second while touching (shows health) |
| checkpoint | | sets the respawn point, turns green |
| finish | | ends the run: time / falls / coins card, saves best time (override with `onFinish`) |
| coin | value (1), respawn (s, 0 = never) | collect for score; spins. Use `canCollide: false`. |
| bounce | power (26) | launches the player up |
| speed | mult (1.8), time (3) | temporary speed boost |
| spin | axis ('y'), speed (deg/s, 90) | rotates in place, carries players standing on it |
| move | offset [dx,dy,dz] ([0,0,6]), period (4), phase (0..1) | slides back and forth, carries players |
| swing | axis ('z'), amp (deg, 60), period (3), pivot [dx,dy,dz] (top center), phase | pendulum |
| vanish | delay (0.5), back (3, 0 = never) | blinks then disappears after being touched |
| fake | back (4) | breaks the moment it's touched |
| teleport | to [x,y,z] | moves the player |

Moving parts follow a shared clock (`World.time()`), so every player sees them in the same place.

## Game definitions

Register built-in games at top level of your file:

```js
registerGames([{
  id: 'lava-leap',              // unique, ^[a-z0-9][a-z0-9_.-]{0,47}$ (also the multiplayer room name)
  title: 'Lava Leap',           // original name, 1-3 words
  cat: 'featured' | 'obby' | 'survival' | 'arena' | 'race' | 'party' | 'explore',
  desc: 'One or two plain sentences: what you do and what makes it fun.',
  mode: 'obby',                 // key in Modes
  modeOpts: { ... },            // read by your mode as G.modeOpts (merged over mode.defaults)
  env: { sky: 'day' | 'sunset' | 'night' | 'space' | 'candy' | 'haunted' | 'desert' | 'snow' | 'cave' | 'neon' | 'forest', gravity: 1, fog: 1 },
  build(R) { return { parts: [...], spawn: [x, y, z], spawnYaw: Math.PI }; },  // R = seeded rng; deterministic per id
  killY: -40,                   // fall below and you die (optional)
  thumb: { pos: [x,y,z], look: [x,y,z] },  // thumbnail camera (optional; default frames the level)
  accent: '#FF6A2B', icon: 'flag',          // used for placeholder tiles
  featured: false, maxPlayers: 10, tags: ['bots'],
}]);
```

`build(R)` must be deterministic for a given id (use only `R`, never `Math.random`) so every player in a room gets
the same level. Keep levels under ~600 parts (phones), with one baseplate or floor. Spawn facing: `spawnYaw` is the
yaw the avatar faces (Math.PI faces -z).

## Rule sets (modes)

```js
Modes.obby = {
  label: 'Obby',
  camera: 'follow' | 'shoulder',   // shoulder = over-the-shoulder aiming (crosshair, pointer lock on desktop)
  hp: false,                       // show the health bar from the start
  board: false, boardAsc: false, boardTitle: 'Scores', // live leaderboard of G.score (you + others in the room)
  hint: 'one-line controls hint for desktop',
  defaults: { ... },               // default modeOpts
  setup(G) {}, update(dt, G) {}, teardown(G) {},
  onTouch(part, G, collider) {},   // return true to skip the built-in behavior
  onCoin(part, G) {}, onCheckpoint(part, G) {}, onFinish(part, G) {},  // onFinish: return true to skip the default card
  onDeath(G, why) {},              // why: 'hazard' | 'fall' | 'damage' | 'hit' | 'reset'. Return true = you call G.respawn() yourself
  onRespawn(G) {}, onEnd(G, result) {},
  onBotHit(bot, n, from, G) {}, onBotDown(bot, why, G) {},
  hostState(G) { return {...}; },  // host only, ~5 Hz: small JSON (< 2 KB) mirrored to everyone
  onShared(state, G) {},           // non-hosts, when the host's state changes
  onAct(from, kind, data, G) {},   // every client, for every Shared.act in the room (yours too: from.isMe)
};
```

Keep per-round state on the mode object or in a closure and reset it in `setup` (Play again calls setup again on a
fresh world). Hooks are wrapped in try/catch; an exception logs and is skipped.

## Game (the runtime) — `G` in hooks

State: `G.def`, `G.modeOpts`, `G.body` (player physics: `pos` Vector3 at the feet, `vel`, `grounded`, `speedMul`,
`jumpMul`), `G.avatar`, `G.cam`, `G.hp`, `G.maxHp`, `G.dead`, `G.score`, `G.deaths`, `G.time` (seconds this round),
`G.ended`, `G.R` (rng for this round), `G.coinsTotal`, `G.frozen` (true stops movement and the clock),
`G.noJump`, `G.facing`, `G.visY`.

Methods: `G.kill(why)`, `G.damage(n, from, quiet)`, `G.heal(n)`, `G.respawn()`, `G.setCheckpoint(pos|[x,y,z], yaw, id)`,
`G.addScore(n)`, `G.setScore(n)`, `G.end({win, title, sub, stats: [[label, value]], again: true})`, `G.finishRun()`,
`G.setCamera('follow'|'shoulder')`, `G.aimRay() → {origin, dir}`, `G.aimPoint(max) → Vector3`, `G.handPos() → Vector3`,
`G.addAction({id, label, icon, key: 'KeyE'|'Mouse0'|…, key2, keyLabel: 'E', primary, onDown, onUp})` (on-screen button +
key; `Mouse0` = left click in shoulder mode), `G.removeAction(id)`, `G.actionHeld(id)`, `G.setActionEnabled(id, on)`,
`G.setActionLabel(id, text)`, `G.part(id)`, `G.mesh(id)`, `G.collider(id)`, `G.partsByTag(tag)`,
`G.near(tag, radius) → [{part, d}]`, `G.spawnPart(rawPart) → part` (adds mesh + collider at runtime), `G.removePart(id)`,
`G.setPartVisible(id, on)`, `G.setPartSolid(id, on)`, `G.movePart(id, pos|[x,y,z], rotDeg?)` (moves mesh + collider; players standing on it ride along), `G.setPartColor(id, hex)`, `G.collect(part)`, `G.breakPart(part, backSeconds)`,
`G.others() → [{key, peer, name, pos, yaw, sc, x, avatar, visible}]` (other players in the room), `G.myPeer()`,
`G.setPublic(obj)` (small JSON others read as `.x`), `G.hud`, `G.bots`, `G.fx`, `G.shared`.

### Hud (`G.hud`)
`objective(text|null)`, `stat(key, value, {icon, label, warn})`, `removeStat(key)`, `hp(cur, max)`, `hideHp()`,
`flash(text, 'info'|'good'|'bad', ms)`, `board(rows|null, title)` (rows `{name, value, me}`), `prompt(text|null)`,
`crosshair(on)`, `hurt()`. Icons: clock, coin, skull, flag, star, moon, sun, log, fire, target, trophy, axe, bolt, blaster,
shield, key, gem, drop, heart, users, hand, jump, play.

### Bots (`G.bots`)
`add({name, pos, yaw, hp, speed, team, skin: starterIndex | canvas, outfit, seed, flying, scale, nametag, data}) → bot`,
`remove(bot)`, `clear()`, `alive()`, `damage(bot, n, from)`, `down(bot, why)`, `hitTest(point, r, except) → bot|null`,
`nearest(pos, filter)`, `list`. A bot: `pos`, `body`, `hp`, `alive`, `team`, `data`, `goTo(x, z, stop, y) → arrived`,
`stop()`, `face(x, z)`, `lookYaw` (null = face movement), `jump()`, `dist(pos)`, `say(text)`, `respawn(pos)`, `avatar`.
Flying bots glide without physics (`move.y` used). Bots that fall below killY trigger `onBotDown(bot, 'fall')`.
Physics is stepped for you; you only steer. Keep bots ≤ 6.

### Fx (`G.fx`)
`burst(pos, color, n, speed)`, `splat(pos, normal, color, size)`, `text(pos, str, color)`, `ring(pos, color, size)`.

### Physics queries (`Phys`)
`Phys.raycast(origin, dir, maxDist) → {t, point, normal, c} | null` (solids only), `Phys.pointHit(x, y, z, r) → collider|null`,
`Phys.groundAt(x, z, fromY, maxDown) → y|null`, `Phys.params` ({gravity, speed, jump}; reset by each world load:
gravity = 50 × env.gravity). A collider has `.part`, `.center`, `.min`, `.max`.

### World
`World.scene` (add your own THREE objects to it; they vanish with the world), `World.parts`, `World.spawn`,
`World.time()`, `World.setEnv(ENV.night)` / `World.setEnvBlend('day', 'night', t)` (day/night cycles), `ENV` presets.
Lights you add (e.g. a campfire `THREE.PointLight`) must be added to `World.scene`. Avoid more than 3 extra lights.

### Shared (multiplayer state)
The host is the earliest player in the room (or you, solo). `Shared.isHost()`, `Shared.state()` (latest host state),
`Shared.act(kind, data)` (tell everyone, including the host; you also receive it in `onAct` with `from.isMe`).
Patterns: the host simulates shared things (day/night clock, fire fuel, creature position, round timer) and returns them
from `hostState`; everyone renders from `Shared.state()`. A non-host action (feed fire) is `Shared.act('feed', {n})`;
the host applies it in `onAct`. A hit on another player is `Shared.act('hit', {to: peer, dmg})`; the target applies it
when `data.to === G.myPeer()`. Keep acts small and rare (a few per second at most).
Solo (no room) works the same: you are the host and acts arrive locally.

## Content rules

- Original names and art only. Do not use Roblox names or the names of Roblox experiences (no "Rivals",
  no "99 Nights in the Forest", no "Doors", "Adopt Me", "Brookhaven", "Tower of Hell", …). Generic genre words are
  fine inside an original title.
- Kid-friendly: blasters shoot foam, paint, snowballs or light; defeated players "splat" or "pop", never blood or gore.
  Night creatures are spooky shapes, not graphic.
- Copy is plain and direct. Buttons say what they do. No emoji in UI text.
- Every game must be playable solo on a phone with the joystick, jump button and your action buttons.
- Performance budget per game on a mid-range phone: < 600 parts, ≤ 6 bots, ≤ 3 extra lights, no per-frame allocation
  in hot loops where avoidable, no per-frame DOM writes unless the value changed (Hud.stat already caches).

## File ownership

Each agent writes only its own files into its own folder and never edits core `src/` files. If you need a core change,
describe it precisely in your final report (file, function, the change, why) instead of making it.
