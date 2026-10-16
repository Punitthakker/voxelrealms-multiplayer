// PlayForge REST client: api(method, path, body) sends JSON to /api/pf<path> with the session token and resolves
// with the JSON answer. Errors throw an ApiError {status, code, message}; status 0 / code 'offline' means the
// server could not be reached.
import { getToken, renewSession } from './session.js';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; }
}

async function once(method, path, body) {
  const headers = { accept: 'application/json' };
  const token = getToken();
  if (token) headers.authorization = 'Bearer ' + token;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res;
  try { res = await fetch('/api/pf' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw new ApiError(0, 'offline', 'The PlayForge server is not reachable. Check your connection.'); }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && data.code) || 'http_' + res.status, (data && data.message) || res.statusText || 'Request failed');
  return data;
}

export async function api(method, path, body) {
  try { return await once(method, path, body); }
  catch (e) {
    // The server no longer knows this token: renew the session once, then retry.
    if (e.status === 401 && path !== '/session') { await renewSession(); return once(method, path, body); }
    throw e;
  }
}
