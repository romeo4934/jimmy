import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const token = () => randomBytes(32).toString('base64url');
const signalPattern = /^[A-Za-z0-9_-]{1,35000}$/;
const roomPattern = /^\/rooms\/([A-Za-z0-9_-]{43})(?:\/(join|answer))?$/;
const lifetime = 900_000;

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function body(request) {
  let text = '';
  request.setEncoding('utf8');
  for await (const chunk of request) {
    text += chunk;
    if (Buffer.byteLength(text) > 40_000) throw new HttpError(413, 'Request too large.');
  }
  try {
    const json = JSON.parse(text);
    if (json && typeof json === 'object' && !Array.isArray(json)) return json;
  } catch { /* Return a client error below. */ }
  throw new HttpError(400, 'Expected a JSON object.');
}

function signal(value) {
  if (typeof value !== 'string' || !signalPattern.test(value)) throw new HttpError(400, 'Invalid match signal.');
  return value;
}

async function espresso(path, { apiKey, payload }) {
  const response = await fetch('https://api.brij.fi/connect/v2/server' + path, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(8_000)
  });
  const json = await response.json();
  if (!response.ok) {
    const code = json?.error?.code;
    if (['site_not_registered', 'site_not_verified'].includes(code)) {
      throw new HttpError(503, 'Baseline Club needs an active Espresso site.', code);
    }
    if (response.status === 429) throw new HttpError(429, 'Too many requests. Try again shortly.', code);
    if (response.status === 403 || response.status === 401) {
      throw new HttpError(403, 'Espresso denied this request. Check your connection and Invites beta access.', code);
    }
    throw new HttpError(502, 'Espresso could not complete this request.', code);
  }
  return json;
}

export function createLobby({ apiKey, gameUrl, provider = espresso }) {
  const game = new URL(gameUrl);
  if (!apiKey || game.protocol !== 'https:' || game.username || game.password || game.search || game.hash) {
    throw new Error('Set ESPRESSO_API_KEY and a clean HTTPS GAME_URL.');
  }
  const nonces = new Map(), sessions = new Map(), rooms = new Map();

  return createServer(async (request, response) => {
    const cors = {
      'Access-Control-Allow-Origin': game.origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Vary': 'Origin', 'Cache-Control': 'no-store'
    };
    const send = (status, value) => {
      response.writeHead(status, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    try {
      if (request.headers.origin !== game.origin) throw new HttpError(403, 'Origin not allowed.');
      if (request.method === 'OPTIONS') return send(204);
      const now = Date.now();
      for (const entries of [nonces, sessions, rooms]) {
        for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
      }
      const { pathname } = new URL(request.url, 'http://localhost');
      if (request.method === 'POST' && pathname === '/nonce') {
        if (nonces.size >= 2000) throw new HttpError(429, 'Try again shortly.');
        const nonce = token();
        nonces.set(nonce, { expires: now + 120_000 });
        return send(201, { nonce });
      }
      if (request.method === 'POST' && pathname === '/session') {
        const { nonce, siteKey, timestamp, signature } = await body(request);
        const challenge = nonces.get(nonce);
        if (!challenge || challenge.expires <= Date.now() || typeof siteKey !== 'string' ||
          typeof signature !== 'string' || !['number', 'string'].includes(typeof timestamp)) {
          throw new HttpError(401, 'Sign-in expired. Try again.');
        }
        nonces.delete(nonce);
        const identity = await provider('/connections/verify', { apiKey, payload: { nonce, siteKey, timestamp, signature } });
        if (typeof identity?.espresso_user_id !== 'string' || !identity.espresso_user_id) {
          throw new HttpError(502, 'Espresso did not return a verified identity.');
        }
        if (sessions.size >= 5000) throw new HttpError(429, 'Try again shortly.');
        const key = token();
        sessions.set(key, { id: identity.espresso_user_id, expires: Date.now() + 60 * 60 * 1000 });
        return send(200, { token: key });
      }
      const session = sessions.get(request.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1]);
      if (!session) throw new HttpError(401, 'Connect your Espresso Cash wallet.');

      if (request.method === 'POST' && pathname === '/rooms') {
        const { username, offer, open } = await body(request);
        const user = typeof username === 'string' ? username.trim() : '';
        if (open !== true && (!user || user.length > 64 || /[\s,]/.test(user))) {
          throw new HttpError(400, 'Enter one Espresso Cash @username.');
        }
        if (rooms.size >= 1000 || [...rooms.values()].some(room => room.host === session.id)) {
          throw new HttpError(409, 'Finish or cancel your current invitation first.');
        }
        const id = token();
        const url = new URL(game);
        url.searchParams.set('room', id);
        const room = { host: session.id, offer: signal(offer), expires: now + lifetime };
        rooms.set(id, room);
        try {
          const invite = await provider('/invites', { apiKey, payload: {
            id, from: session.id, room: id, title: 'Tennis at Baseline Club', url: url.href,
            max_players: 2, expires_in: 900, ...(open === true ? { open: true } : { to: [user] })
          } });
          if (!/^inv_[\w-]+$/.test(invite?.invite_id || '')) throw new HttpError(502, 'Espresso did not return an invite ID.');
          room.invite = invite.invite_id;
          return send(201, { room: id, link: invite.link ?? null });
        } catch (error) {
          rooms.delete(id);
          throw error;
        }
      }

      const [, id, action] = pathname.match(roomPattern) ?? [];
      const room = rooms.get(id);
      if (!room?.invite) throw new HttpError(404, 'Match not found or expired.');
      if (request.method === 'POST' && action === 'join') {
        const { invite } = await body(request);
        if (invite !== room.invite || session.id === room.host) throw new HttpError(403, 'Open the accepted invite from Espresso.');
        if (room.guest !== session.id) {
          const details = await provider('/invites/' + encodeURIComponent(room.invite), { apiKey });
          if (!details?.answers?.some(answer => answer.status === 'accepted' && answer.espresso_user_id === session.id)) {
            throw new HttpError(403, 'Accept the invite in Espresso Cash first.');
          }
          if (!rooms.has(id) || room.expires <= Date.now()) throw new HttpError(404, 'Match expired.');
          if (room.guest && room.guest !== session.id) throw new HttpError(409, 'This match is full.');
          room.guest = session.id;
        }
        return send(200, { offer: room.offer });
      }
      if (request.method === 'POST' && action === 'answer' && session.id === room.guest) {
        const { answer } = await body(request);
        if (!rooms.has(id) || room.expires <= Date.now()) throw new HttpError(404, 'Match expired.');
        if (room.answer) throw new HttpError(409, 'You already joined this match.');
        room.answer = signal(answer);
        return send(204);
      }
      if (!action && request.method === 'GET' && session.id === room.host) return send(200, { answer: room.answer ?? null });
      if (!action && request.method === 'DELETE' && session.id === room.host) {
        rooms.delete(id);
        return send(204);
      }
      throw new HttpError(404, 'Match not found.');
    } catch (error) {
      if (!response.headersSent) send(error.status ?? 502, {
        error: error.status ? error.message : 'The lobby could not complete that request.', code: error.code
      });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createLobby({ apiKey: process.env.ESPRESSO_API_KEY, gameUrl: process.env.GAME_URL })
    .listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('Baseline Club lobby ready'));
}
