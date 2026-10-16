// Sessions. There are no passwords: a random device token is the account. The server keeps only the token's
// sha256 hash, so a copy of the database can't be used to sign in as anyone.
const crypto = require('crypto');
const store = require('./store');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url
const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const CACHE_MAX = 5000, CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // tokenHash -> {user, at}

const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const randomId = (prefix, n) => prefix + Array.from(crypto.randomBytes(n), b => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
const newUserId = () => randomId('p', 12);
const USER_ID_RE = /^p[a-z0-9]{12}$/;
const publicUser = u => ({ id: u._id, name: u.name, nick: u.nick || '' });

// The user for a token, or null. Cached briefly so sockets and API calls don't hit the database each time.
async function userForToken(token) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const h = hashToken(token), c = cache.get(h), now = Date.now();
  if (c && now - c.at < CACHE_MS) return c.user;
  const u = await store.userByToken(h);
  if (!u) { cache.delete(h); return null; }
  const user = publicUser(u);
  cache.set(h, { user, at: now });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return user;
}

// Keeps cached copies in step after a profile save.
function updateCachedUser(id, patch) {
  for (const c of cache.values()) if (c.user.id === id) Object.assign(c.user, patch);
}

async function createGuest() {
  const token = newToken(), now = Date.now();
  const u = { _id: newUserId(), name: 'Guest ' + (1000 + crypto.randomInt(9000)), nick: '', tokenHash: hashToken(token), createdAt: now };
  await store.createUser(u);
  return { token, user: publicUser(u) };
}

const bearer = req => {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

module.exports = { TOKEN_RE, USER_ID_RE, hashToken, userForToken, updateCachedUser, createGuest, publicUser, bearer, randomId };
