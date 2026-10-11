// Single Node process: Next.js pages, a small REST API (Express) and the multiplayer WebSocket.
const http = require('http');
const express = require('express');
const next = require('next');
const { WebSocketServer } = require('ws');
const store = require('./lib/store');
const rooms = require('./lib/rooms');

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/voxel-realms';

async function main() {
  const nextApp = next({ dev });
  const handle = nextApp.getRequestHandler();
  await Promise.all([nextApp.prepare(), store.connect(mongoUri)]);

  const app = express();
  app.use('/api', express.json());

  app.post('/api/worlds', async (req, res, nxt) => {
    try { res.json({ code: (await rooms.createWorld()).code }); } catch (e) { nxt(e); }
  });

  app.get('/api/worlds/:code', async (req, res, nxt) => {
    try {
      const code = rooms.cleanCode(req.params.code);
      const w = await store.getWorld(code);
      if (!w) return res.status(404).json({ error: 'World not found' });
      res.json({ code, online: rooms.online(code) });
    } catch (e) { nxt(e); }
  });

  app.all('*', (req, res) => handle(req, res));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  wss.on('connection', rooms.onConnection);

  const nextUpgrade = nextApp.getUpgradeHandler();
  server.on('upgrade', (req, socket, head) => {
    if (req.url.startsWith('/ws?')) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    else nextUpgrade(req, socket, head); // Next dev hot reload
  });

  const shutdown = async () => {
    await rooms.flushAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, () => console.log(`> Voxel Realms on http://localhost:${port}`));
}

main().catch(e => { console.error(e); process.exit(1); });
