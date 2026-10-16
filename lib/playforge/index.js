// PlayForge server: storage, REST API under /api/pf and WebSocket rooms at /pf-ws.
// server.js calls init() after lib/store.js tried MongoDB, mount(app) before its own JSON body parser, and
// handleUpgrade() for /pf-ws upgrade requests.
const mongoose = require('mongoose');
const store = require('./store');
const rooms = require('./rooms');
const { createRouter } = require('./api');

let exitHooked = false;
async function init(opts = {}) {
  const mode = await store.init({ mongoose: opts.mongoose || mongoose, dataDir: opts.dataDir });
  // JSON file: changes still waiting for the debounced write are saved even when the process exits abruptly.
  if (mode === 'file' && !exitHooked) { exitHooked = true; process.on('exit', closeSync); }
  return mode;
}

function mount(app) {
  app.use('/api/pf', createRouter());
}

// True when the request was a PlayForge socket (and is now handled).
function handleUpgrade(req, socket, head) {
  const path = (req.url || '').split('?')[0];
  if (path !== '/pf-ws') return false;
  rooms.handleUpgrade(req, socket, head);
  return true;
}

async function close() {
  rooms.close();
  try { await store.flush(); } catch (e) { console.error('> PlayForge: final save failed', e.message); }
}
// Synchronous save for process exit (JSON file only).
function closeSync() { if (store.mode === 'file') store.flushSync(); }

module.exports = { init, mount, handleUpgrade, close, closeSync, store, rooms };
