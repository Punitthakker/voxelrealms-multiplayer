// Small in-memory rate limiters (fixed windows per key) and the client address used for per-IP limits.
const net = require('net');

const buckets = new Map(); // name -> Map(key -> {n, reset})
setInterval(() => {
  const now = Date.now();
  for (const m of buckets.values()) for (const [k, v] of m) if (v.reset <= now) m.delete(k);
}, 60000).unref();

// Returns true when the call is allowed; counts it.
function hit(name, key, max, windowMs) {
  let m = buckets.get(name); if (!m) buckets.set(name, m = new Map());
  const now = Date.now(); let b = m.get(key);
  if (!b || b.reset <= now) { b = { n: 0, reset: now + windowMs }; m.set(key, b); }
  if (b.n >= max) return false;
  b.n++; return true;
}
// Seconds until the key's window resets (for Retry-After).
function retryAfter(name, key) {
  const b = buckets.get(name) && buckets.get(name).get(key);
  return b ? Math.max(1, Math.ceil((b.reset - Date.now()) / 1000)) : 1;
}

// Behind a proxy on a private network (Render, nginx on the same host) the last X-Forwarded-For entry is the
// address the proxy saw; otherwise X-Forwarded-For is ignored because anyone can send it.
const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|::ffff:(127|10|192\.168)\.)/i;
function clientIp(req) {
  const remote = (req.socket && req.socket.remoteAddress) || '';
  const xff = req.headers['x-forwarded-for'];
  if (xff && PRIVATE.test(remote)) {
    const last = String(xff).split(',').map(s => s.trim()).filter(Boolean).pop();
    if (last && net.isIP(last.replace(/^::ffff:/, ''))) return last;
  }
  return remote || 'unknown';
}

// Simple token bucket for message rates on sockets: rate per second, burst capacity.
function tokenBucket(rate, burst) {
  let tokens = burst, last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * rate); last = now;
    if (tokens < 1) return false;
    tokens -= 1; return true;
  };
}

module.exports = { hit, retryAfter, clientIp, tokenBucket };
