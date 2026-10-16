# PlayForge and Voxel Realms

Two multiplayer browser games built with [three.js](https://threejs.org/), Next.js, Node and MongoDB, served by one Node process.

- **PlayForge** (at `/`): play, build and share 3D games. 52 original games (obbies, races, the Splat Rivals
  foam-blaster duel, the 99 Nights at Pinewood campfire survival, party games, worlds to explore), a game maker
  (Studio) to make your own and publish them, a pixel avatar editor, and multiplayer rooms with chat.
- **Voxel Realms** (at `/voxel`): an endless voxel sandbox with survival, crafting, mobs and dimensions.
  Create a world, share the link, and friends build in it with you.

## Stack

- **Frontend:** Next.js 15 / React 19. PlayForge's screens (home, game HUD and menus, Studio, avatar editor)
  are React; its 3D engine and games are browser ES modules in `playforge/engine/` (three.js 0.128).
- **Backend:** Node. `server.js` runs one process that serves Next.js, a JSON API (Express) and WebSockets (`ws`).
- **Database:** MongoDB through Mongoose: local `mongod` in development, MongoDB Atlas when hosted.
  Without a reachable database, PlayForge keeps its data in a local file (`.data/playforge.json`) and
  Voxel Realms keeps worlds in memory, so it all still runs with no setup.

| Path | What it does |
| --- | --- |
| `server.js` | HTTP + WebSocket entry point for both games |
| `app/(playforge)/` | PlayForge pages: `/`, `/g/[id]` (play), `/studio/[id]`, `/avatar` |
| `components/playforge/` | PlayForge React components |
| `playforge/engine/` | PlayForge engine: renderer, physics, world, game runtime, the 52 games, Studio and editor cores |
| `playforge/client/` | PlayForge browser platform: session, API client, room client |
| `lib/playforge/` | PlayForge server: storage, sessions, REST API (`/api/pf`), rooms (`/pf-ws`) |
| `playforge/WEBAPP.md` | PlayForge architecture, API and protocol |
| `app/voxel/`, `app/play/[room]/` | Voxel Realms lobby and game page |
| `lib/rooms.js`, `lib/store.js` | Voxel Realms rooms and storage (`lib/store.js` also opens the shared Mongo connection) |
| `public/game/game.js` | The Voxel Realms engine |
| `playforge/src/`, `playforge/playforge.html` | The older single-file build of PlayForge (claude.ai artifact) |

## Run locally

Needs Node 20+. MongoDB 7+ is optional.

```sh
npm install
npm run db      # optional, terminal 1: local MongoDB with data in .data/db
npm run dev     # terminal 2: http://localhost:3000
```

Without `npm run db`, PlayForge saves players, published games and likes to `.data/playforge.json`.
Friends on the same Wi-Fi can open `http://<your-computer-ip>:3000`.

## Host it to share a link

Vercel can't host this, because it doesn't keep WebSocket connections open. Use a service that runs a long-lived
Node process, such as Render, Railway or Fly.io. Hosts like these have no lasting disk on free plans, so use
MongoDB Atlas for the data:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/maanthakker/voxelrealms-multiplayer)

The button uses `render.yaml` and only asks for `MONGODB_URI`. To set it up by hand instead:

1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas). Add a database user, allow network
   access from `0.0.0.0/0`, and copy the connection string.
2. Push this repo to GitHub and create a **Web Service** from it:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variable: `MONGODB_URI=<your Atlas connection string>`
3. Open the site and share its address.

## PlayForge

- Each device is a player: the first visit creates a guest account (a device token, no password). Pick a
  display name and skin in the avatar editor.
- Games you make in Studio are drafts on your device until you press **Publish**; then everyone sees them
  under New and can play, like and copy them.
- Multiplayer: everyone who opens the same game plays in the same room (up to 10). Chat with Enter or `/`.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD or arrows | Left stick |
| Look | Drag (shooter games: mouse aims) | Drag the right side |
| Jump | Space | Jump button |
| Game actions (fire, chop, shove…) | Keys on the buttons (click, F, E, R…) | Buttons |
| Menu | Esc | Menu button |

## Voxel Realms

Every client generates the same terrain from a fixed seed, so only **block edits** are stored (one document per
changed cell) and broadcast. Player positions, chat and the day/night clock are synced live.

- **T** or **Enter** (or the chat button) opens chat; the top-left bar shows who is online
- Settings has **Copy invite link** and **Leave world**
- Known limits: mobs, dropped items and survival inventory are per player and are not synced. There's no PvP.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD | Left stick |
| Look | Mouse | Drag right side |
| Break / place | Left / right click | Buttons |
| Jump / sprint | Space / Shift | Jump button |
| Fly (creative) | F (Space up, C down) | Fly button |
| Pick block | 1–9 or wheel | Tap hotbar |
| Inventory / crafting | E | ▦ button |
| Eat | R | Tap hunger bar |
