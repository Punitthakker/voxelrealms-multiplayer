# Voxel Realms

A multiplayer browser voxel sandbox built with [three.js](https://threejs.org/), Next.js, Node and MongoDB.

- Endless procedurally generated world: 13 biomes, caves, ores, trees and villages
- Creative and Survival modes: mining with tools, crafting, furnace, hunger, health
- 30+ mobs (animals, villagers, iron golems, zombies, skeletons, creepers…)
- Nether and End dimensions, ending with the Ender Dragon
- Day/night cycle, soft shadows, smooth lighting, clouds and particles
- Keyboard + mouse and touch controls; adaptive graphics quality

Multiplayer: create a world, share the link, and friends build in it with you in real time.

## Stack

- **Frontend:** Next.js 15 / React 19. The lobby is a React page, and the game runs on `/play/[code]`
- **Backend:** Node, running one process (`server.js`) that serves Next, a small Express API and a WebSocket server (`ws`)
- **Database:** MongoDB through Mongoose. Local `mongod` in development, MongoDB Atlas when hosted. If no database is reachable, the server falls back to in-memory storage.

Every client generates the same terrain from a fixed seed. So only **block edits** are stored (one document per changed cell) and broadcast. Player positions, chat and the day/night clock are synced live. Each player's last position is saved per world.

| Path | What it does |
| --- | --- |
| `server.js` | HTTP + WebSocket entry point |
| `lib/rooms.js` | Realtime rooms: join, relay edits/positions/chat, flush edits to the DB every 2s |
| `lib/store.js` | Mongo models (`World`, `Block`, `PlayerState`) + in-memory fallback |
| `app/page.js` | Lobby: pick a name, create a world or join by code |
| `app/play/[room]/` | Game page: mounts the HUD markup and loads `public/game/game.js` |
| `public/game/game.js` | The game engine (three.js), plus the multiplayer client at the bottom |

## Run locally

Needs Node 20+ and MongoDB 7+.

```sh
npm install
npm run db      # terminal 1: local MongoDB, data in .data/db
npm run dev     # terminal 2: http://localhost:3000
```

Friends on the same Wi-Fi can join at `http://<your-computer-ip>:3000/play/<CODE>`.

## Host it to share a link

Vercel can't host this, because it doesn't keep WebSocket connections open. Use a service that runs a long-lived Node process, such as Render, Railway or Fly.io:

1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas). Add a database user, allow network access from `0.0.0.0/0`, and copy the connection string.
2. Push this repo to GitHub and create a **Web Service** from it:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variable: `MONGODB_URI=<your Atlas connection string>`
3. Open the site, create a world and press **Copy invite link**.

## In-game multiplayer

- **T** or **Enter** (or the 💬 button) opens chat
- The top-left bar shows who is online
- Settings (⚙) has **Copy invite link** and **Leave world**

Known limits for now: mobs, dropped items and survival inventory are per player and are not synced. There's no PvP.

## Controls

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
