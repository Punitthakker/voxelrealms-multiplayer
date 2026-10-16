# PlayForge web app: architecture and contract

PlayForge runs as part of this repo's Next.js + Node app (the same pattern as Voxel Realms):
one Node process (`server.js`) serves Next.js pages, a JSON API and WebSocket rooms. Data lives in MongoDB
(local `mongod` in development, MongoDB Atlas when hosted) and falls back to a local JSON file when no
database is reachable, so it also runs with no setup.

The 3D engine and the 52 games are plain browser JavaScript modules in `playforge/engine/`. Every screen
around them (home, game HUD and menus, Studio panels, avatar editor) is React. The engine writes UI state
into small stores; React reads them and calls engine methods.

`playforge/src/`, `playforge/build.py` and `playforge/playforge.html` are the older single-file claude.ai
build. Treat them as read-only reference: the original markup is in `playforge/src/30-markup.html` and
`31-studio.html`, the original styles in `playforge/src/*.css`.

## Layout

| Path | What |
| --- | --- |
| `server.js` | HTTP server: Next.js, Voxel Realms API + `/ws`, PlayForge API `/api/pf` + `/pf-ws` |
| `lib/playforge/` | Server: storage (Mongo or JSON file), sessions, REST routes, WebSocket rooms |
| `app/(playforge)/layout.js` | PlayForge shell: global CSS, icon sprite, engine start-up, toasts, confirm dialog |
| `app/(playforge)/page.js` | `/` home |
| `app/(playforge)/g/[id]/page.js` | `/g/<gameId>` play a game (built-in id, or a community game id `u-xxxxxxxx`) |
| `app/(playforge)/studio/[id]/page.js` | `/studio/<draftId>`, `/studio/new`, `/studio/new?remix=<gameId>` |
| `app/(playforge)/avatar/page.js` | `/avatar` avatar and skin editor |
| `app/voxel/`, `app/play/[room]/` | Voxel Realms (do not change) |
| `components/playforge/` | Shared: `Shell.js`, `engine.js` (`useEngine`, `loadEngine`), `useStore.js`, `Icon.js`, `Modal.js` |
| `components/playforge/{home,game,studio,avatar,settings}/` | Screen components |
| `playforge/engine/` | Engine ES modules (browser only) |
| `playforge/client/` | Platform layer in the browser: session, API client, room client, start-up |
| `playforge/web/playforge.css` | Global PlayForge styles (class names from the original build) |
| `playforge/web/icons.js` | The SVG sprite (`<Icon name="play"/>` uses `#i-play`) |

## Engine rules

- Browser only. React files never import engine or client modules statically (pages are server-rendered
  first). Get the engine module with `const E = useEngine()` (null until loaded), then use `E.Game`,
  `E.gameById`, `E.hudStore`... `components/playforge/engine.js` loads `playforge/engine/index.js` and
  `playforge/client/platform.js` once. The only engine file safe to import statically is `playforge/engine/stores.js`.
- `window.__PF` is the engine module (for the console and tests).
- Engine modules never look up DOM elements by id. React passes the elements they need (`Engine.attach(el)`,
  `Input.attach({...})`, viewport elements for Studio and the avatar editor).
- One WebGL renderer is shared by every screen. A screen calls `E.Engine.setMode(m)` and `E.Engine.attach(hostEl)`
  on mount (`m` is `'game'`, `'studio'` or `'avatar'`; the loop calls `E.Engine.views[m].frame(dt)`), and sets
  `'home'` again when it unmounts. In `'home'` mode nothing renders except home thumbnails.
- Engine code writes screen state into stores and only when a value changed (some writers run every frame).
- New modules export what React needs and register it on `index.js` exports.
- `core.js` still exports TEMPORARY no-op `Modals` and `showScreen` so old modules link. Remove every use;
  the final pass deletes them.

## Stores (`playforge/engine/stores.js`)

`createStore(initial)` returns `{get, set(patch | fn), replace(next), subscribe(fn)}`. React reads with
`useStore(store, selector)` (`components/playforge/useStore.js`); selectors return slices or primitives.

- `uiStore`: `toast` (`{id, msg, warn}`) and `choice` (the open `askChoice` dialog). Use `E.toast(msg, warn)`
  and `await E.askChoice({title, body, buttons: [{label, value, kind}]})` anywhere. The shell renders both.
- `hudStore` (written by `Hud` and `Game`): `objective`, `stats [{key, value, icon, label, warn}]`,
  `hp {cur, max, k} | null`, `board {title, rows [{name, value, me}]} | null`, `flash {id, text, kind} | null`,
  `prompt`, `crosshair`, `hurt` (counter, bump = red vignette), `actions [{id, label, icon, keyLabel, primary,
  disabled, held}]`, `panel {title, text, options [{id, title, blurb, key, on}], buttons [{id, label, kind}]} | null`,
  `end {title, sub, stats [[label, value]], win, againLabel, leaveLabel, canAgain} | null`.
  React calls back with `E.Input.downId(id)` / `E.Input.upId(id)` for action buttons (pointer down/up),
  `E.Hud.panelPick(optionId)`, `E.Hud.panelButton(buttonId)`, `E.Hud.endAction('again' | 'leave')`.
- `gameStore` (written by `Game`): `active, loading, loadingTitle, title, test, hint, hintVisible, menuOpen, fps,
  mp, chatOpen`. `E.Game.openMenu()` / `E.Game.closeMenu()`.
- Each workstream adds its own store in its own module with `createStore` (`netStore` in net.js,
  `studioStore` in studio.js, `editorStore` in skin-editor.js, `libraryStore` in library.js).

## Game screen API (engine)

- `E.Game.enter(def, {host, test, onExit})`: `host` is the element the 3D view goes into (class `gl-host`).
  `onExit()` runs after the player leaves (Leave button, Stop test, end card). `E.Game.leave(quiet)`;
  `quiet` skips `onExit` (use it when the React screen unmounts).
- `E.Input.attach({layer, joyBase, joyKnob, jump})` returns a detach function. `layer` is the full-screen touch
  layer over the view; the joystick and jump button are DOM elements the screen renders.
- Built-in game definitions: `E.GAMES`, `E.gameById(id)`. Community games: `await E.Library.loadPublished(summary)`
  or by id (see Library below).
- `<GameScreen>` (components/playforge/game/GameScreen.js) takes `{def, test, onExit}` so Studio can render it
  in place for Test.

## Platform layer (`playforge/client/`)

- `platform.js` `startPlatform(E)`: starts the session, sets `E.Me` and `E.Caps`, attaches `E.Profile.backend`,
  sets `E.Caps.room` to the lobby `RoomClient`, calls `E.Profile.attachCloud()`, `E.Library.init()`,
  `E.Skins.refreshWorn()`, `E.Profile.emit()`, then `E.Caps.ready = true`.
- Session: `POST /api/pf/session {token?}` returns `{token, user: {id, name, nick}}`. The token is kept in
  `localStorage['pf.v2.session']`. `E.Me = {id, token, accountName: name, guestName: name}`.
  There are no passwords: a device token is the account. A new device is a new guest player.
- `api.js` `api(method, path, body)` sends JSON with `Authorization: Bearer <token>` and throws
  `{status, code, message}` on errors. `E.Caps.online` is true once the session started.
- `E.Caps.downloads = {save({filename, data: Blob})}` (a plain browser download, always available).
- `E.Caps.room`: a `RoomClient` for the lobby, the same interface as the claude.ai room capability, so
  `engine/net.js` keeps its logic: `presence(patch) -> Promise`, `emit(topic, data) -> Promise`,
  `on(topic, fn) -> unsubscribe`, `onPeers(fn, onError) -> unsubscribe` (fn gets `{peers, joined, left, updated}`),
  `join(name) -> Promise<RoomClient>`, `leave() -> Promise`, `name`. Peers: `{peer, by, isMe, sameTab, kind:
  'viewer', guest: false, presence, updatedAt}` (`peer` = connection id, `by` = user id, `isMe` = same user,
  `sameTab` = this connection).
- `E.Library` (`engine/library.js`) keeps its public API (`published, likeCounts, myLikes, onChange, drafts,
  getDraft, saveDraft, deleteDraft, newId, blank, remix, toDef, compact, publish, unpublish, rename,
  loadPublished, likes, liked, toggleLike, canPublish, init`) on top of the REST API, plus
  `loadById(gameId)`. Drafts stay in `localStorage` on the device.
- Player skins and names for other players: `GET /api/pf/players/:id`; the server announces profile saves so
  open rooms refresh that avatar.

## Server

Storage (`lib/playforge/store.js`): MongoDB through the app's existing mongoose connection when it is up
(`lib/store.js` connects), otherwise a JSON file at `${PF_DATA_DIR || '.data'}/playforge.json` (debounced
writes, loaded at start). Collections: `pf_users {_id, name, nick, tokenHash, createdAt}`,
`pf_skins {_id: userId, slots, active, updatedAt}` (private), `pf_players {_id: userId, nick, skin, updatedAt}`
(public), `pf_games {_id: gameId, creatorId, creatorName, title, desc, thumb, mode, modeOpts, env, killY,
spawnYaw, parts, partsCount, createdAt, updatedAt}`, `pf_likes {userId, gameKey}` (unique pair),
`pf_reports {reporterId, ..., createdAt}`.

REST, JSON, under `/api/pf` (every route but `POST /session` needs the bearer token):

| Method and path | Body | Returns |
| --- | --- | --- |
| `POST /session` | `{token?}` | `{token, user: {id, name, nick}}` (new guest if the token is missing or unknown) |
| `GET /me/profile` | | `{slots: [png or ''] x5, active, nick}` |
| `PUT /me/profile` | `{slots, active, nick, skin}` | `{ok: true}`; updates private slots and the public player |
| `GET /players/:id` | | `{id, name, nick, skin}` |
| `GET /games` | | `{games: [summary]}`; summary `{id, title, desc, thumb, mode, sky, parts, createdAt, updatedAt, creatorId, creatorName, likes}` |
| `GET /games/:id` | | the full game: summary fields plus `modeOpts, env, killY, spawnYaw, parts` |
| `PUT /games/:id` | `{title, desc, mode, modeOpts, env, killY, spawnYaw, parts, thumb}` | summary; creates or updates (owner only) |
| `PATCH /games/:id` | `{title}` | summary (owner only) |
| `DELETE /games/:id` | | `{ok: true}` (owner only) |
| `GET /likes` | | `{counts: {gameKey: n}, mine: [gameKey]}` |
| `PUT /likes/:key` | `{liked}` | `{liked, count}` |
| `POST /reports` | `{target, targetNick, game, reason, note, recent}` | `{ok: true}` |

Limits: 20 published games per creator, 1200 parts, title 40 chars, description 200, thumbnail a
`data:image/jpeg` URL under 24 000 chars, request bodies under 1 MB, nick 20 chars. Titles, descriptions,
nicks and chat go through the word filter (`lib/playforge/filter.js`, same list as the client's).
Game ids match `/^u-[a-z0-9]{8}$/`; like keys are built-in ids or community ids.

WebSocket `/pf-ws?token=<token>` (JSON messages):

- Client to server: `{t: 'join', room, presence?}` (rooms: `'lobby'` or a game id; game rooms hold 10 players,
  the 11th gets `{t: 'error', room, code: 'full'}`), `{t: 'leave', room}`, `{t: 'presence', room, patch}` (merge,
  `null` deletes a key; under 4 KB; at most 20 per second), `{t: 'emit', room, topic, data}` (under 2 KB; topic
  `chat`: text filtered, 150 chars, one per second per player).
- Server to client: `{t: 'peers', room, peers, joined, left, updated}` on join and on every change (peers as
  above), `{t: 'event', room, topic, data, peer, by}`, `{t: 'error', room?, code, message}`, and broadcasts to
  every socket: `{t: 'games'}` (published games changed), `{t: 'likes', key, count}`, `{t: 'player', id}`
  (a profile was saved).
- The server pings every 20 s and drops dead sockets. Leaving a socket leaves its rooms.

## Testing

- Your own dev server, so workstreams don't collide:
  `PORT=<port> NEXT_DIST_DIR=.next-<name> PF_DATA_DIR=.data/<name> MONGODB_URI=mongodb://127.0.0.1:1/none NEXT_TELEMETRY_DISABLED=1 node server.js > <log> 2>&1 &`
  then wait until `curl -s http://127.0.0.1:<port>/voxel` returns 200. Stop it with `kill $(lsof -t -i:<port>)`
  when you finish. Ports: platform 3111, game 3121, home 3131, studio 3141, avatar 3151, games 3161, reviewers 3171+.
  Pages compile on first visit (10-60 s); wait for conditions, not fixed times.
- Browser tests: `node /tmp/claude-0/-home-user-voxelrealms-multiplayer/d3ce2449-7b5e-5903-8496-f72b1d9f0475/scratchpad/harness/web.js --name <name> --base http://127.0.0.1:<port> [--path /g/forge-park] [--pages 2] [--viewport 390x844 --touch] [--dark] script.js`.
  Each page is a separate browser profile (a different PlayForge user); `--shared` puts pages in one profile.
  The script gets `{pages, page, log, shot, wait, base}`; screenshots go to `harness/out/<name>/shots/` (look at
  them with the Read tool). It ends with `NO ERRORS` or the console errors. Example: `harness/web-tests/p0.js`.
- Headless rendering is software GL: slow frames are expected. Use the Low preset (the runner sets it).
- `npx next build` (with `NEXT_DIST_DIR=.next-build-<name>`) must pass before you finish.

## Design and content rules

- Keep the PlayForge look: the class names in `playforge/web/playforge.css` and the original markup.
  Light and dark themes, phones first (360 px wide, 16 px gutters, no horizontal page scroll, 44 px touch
  targets), keyboard and mouse too.
- Original names only; never Roblox names, logos or interface. Plain, direct copy; buttons say what they do;
  no emoji in UI text.
- Hide a feature when its service is missing (for example Publish and Like when the server is offline).

## File ownership (workstreams)

| Workstream | Owns |
| --- | --- |
| Platform | `lib/playforge/**`, `server.js` (PlayForge wiring only), `playforge/client/**`, `playforge/engine/library.js` |
| Game screen | `playforge/engine/net.js`, `playforge/engine/settings-ui.js` (remove or turn into helpers), `components/playforge/game/**`, `components/playforge/settings/**`, `app/(playforge)/g/**` |
| Home | `playforge/engine/home.js` (becomes thumbnails and status helpers), `components/playforge/home/**`, `app/(playforge)/page.js` |
| Studio | `playforge/engine/studio.js`, `components/playforge/studio/**`, `app/(playforge)/studio/**` |
| Avatar | `playforge/engine/skin-editor.js`, `components/playforge/avatar/**`, `app/(playforge)/avatar/**` |
| Games | `playforge/engine/games/**`, `playforge/engine/modes-base.js` |

Shared files (`core.js`, `render.js`, `world.js`, `game.js`, `hud.js`, `input.js`, `stores.js`, `index.js`,
`components/playforge/*.js`, `playforge/web/playforge.css`): make small additive changes only, with the Edit
tool (never rewrite the whole file), and say what you changed in your report. Put a workstream's new styles in
its own `playforge/web/<area>.css` imported by its components.
