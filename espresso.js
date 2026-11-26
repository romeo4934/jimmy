import { lobbyApi } from './online-config.js';

export const automaticEspresso = lobbyApi !== '';
const byId = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixedGameTitle = 'Tennis at Baseline Club';
const inviteOrigins = new Set(['https://connect.espressocash.com', 'https://connect.brij.fi']);

function explain(error) {
  if (error?.code === 'site_not_registered' || error?.code === 'site_not_verified') {
    return 'Baseline Club needs an active site in Espresso Connect.';
  }
  if (error?.code === 'cancelled') return 'Connection cancelled.';
  if (error?.code === 'blocked') return 'Open Baseline Club in Safari or Chrome and allow the Espresso window.';
  if (error?.code === 'rate_limited') return 'Too many invites. Try again shortly.';
  return error?.message || 'Could not complete the Espresso invitation.';
}

export function setupEspresso({ createOffer, takeOffer, applyAnswer, cancelPeer }) {
  const params = new URLSearchParams(location.search);
  const incoming = { room: params.get('room'), invite: params.get('espresso_invite') };
  const isGuest = automaticEspresso && /^[A-Za-z0-9_-]{43}$/.test(incoming.room ?? '') &&
    /^inv_[\w-]+$/.test(incoming.invite ?? '');
  const box = byId('espresso-invite');
  const connectButton = byId('espresso-connect');
  const account = byId('espresso-account');
  const send = byId('espresso-send');
  const hostFields = byId('espresso-host-fields');
  const share = byId('espresso-share');
  const shareUrl = byId('espresso-share-url');
  const join = byId('espresso-join');
  const status = text => { byId('espresso-status').textContent = text; };
  let sdk, connectionId, credential, active, pendingSignIn;
  let generation = 0, connectionCheck = 0;

  function client() {
    if (!window.EspressoConnect) throw new Error('Espresso Connect could not load. Try again in Safari or Chrome.');
    return sdk ??= window.EspressoConnect({ siteName: 'Baseline Club' });
  }
  function showConnection(connection) {
    connectButton.hidden = Boolean(connection);
    account.hidden = !connection;
    if (connectionId !== connection?.connectionId) {
      connectionId = connection?.connectionId;
      credential = undefined;
    }
  }
  async function refreshConnection() {
    if (pendingSignIn) return;
    const check = ++connectionCheck;
    let connection;
    try { connection = await client().isConnected(); }
    catch { /* Allow a manual connection when the saved session cannot be read. */ }
    if (check === connectionCheck) showConnection(connection);
  }
  async function request(route, method = 'GET', payload, session = credential) {
    const response = await fetch(lobbyApi.replace(/\/$/, '') + route, {
      method, headers: {
        ...(session ? { Authorization: 'Bearer ' + session } : {}),
        ...(payload ? { 'Content-Type': 'application/json' } : {})
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(15_000)
    });
    const json = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      if (response.status === 401 && session === credential) credential = undefined;
      throw Object.assign(new Error(json?.error || 'The match lobby is unavailable.'), { code: json?.code, status: response.status });
    }
    return json;
  }
  async function completeSignIn() {
    const espresso = client();
    const connection = await espresso.isConnected();
    showConnection(connection);
    if (!connection) showConnection(await espresso.connect());
    if (!automaticEspresso || credential) return;
    const { nonce } = await request('/nonce', 'POST', null, null);
    credential = (await request('/session', 'POST', await espresso.linkProof(nonce), null)).token;
  }
  function signIn() {
    if (!pendingSignIn) {
      connectionCheck++;
      pendingSignIn = completeSignIn().finally(() => { pendingSignIn = undefined; });
    }
    return pendingSignIn;
  }
  function showShareLink(value) {
    const url = new URL(value);
    if (!inviteOrigins.has(url.origin) || url.username || url.password || !/^\/i\/[^/]+$/.test(url.pathname)) {
      throw new Error('Espresso did not return a valid invite link.');
    }
    shareUrl.value = url.href;
    share.hidden = false;
  }
  function busy(value) {
    send.disabled = join.disabled = value;
  }

  async function invite() {
    const username = byId('espresso-to').value.trim();
    const open = username === '';
    if (/[\s,]/.test(username)) {
      status('Enter one Espresso Cash @username, or leave the field blank to share a link.');
      return;
    }
    const current = ++generation;
    busy(true);
    status('Preparing your Espresso invitation…');
    try {
      await signIn();
      if (current !== generation) return;
      const { offer, url } = await createOffer();
      if (current !== generation) return;
      if (!automaticEspresso) {
        const delivered = await sdk.invite({
          ...(open ? { open: true } : { to: [username] }),
          room: crypto.randomUUID(), title: fixedGameTitle, url, maxPlayers: 2
        });
        if (current !== generation) return;
        if (open) showShareLink(delivered.link);
        status(open ? 'Share this link and keep this tab open. Paste your friend’s reply code when they send it.' :
          'Invitation submitted. Keep this tab open and paste your friend’s reply code when they send it.');
        return;
      }
      const created = await request('/rooms', 'POST', { username, open, offer });
      const route = '/rooms/' + encodeURIComponent(created.room);
      if (current !== generation) {
        await request(route, 'DELETE');
        return;
      }
      active = route;
      if (open) showShareLink(created.link);
      status(open ? 'Share this link and keep this tab open while your friend joins.' :
        'Invitation submitted. Keep this tab open while your friend accepts in Espresso Cash.');
      const deadline = Date.now() + 900000;
      while (current === generation && Date.now() < deadline) {
        const { answer } = await request(route);
        if (current !== generation) return;
        if (answer) {
          await applyAnswer(answer);
          status('Connecting to your friend…');
          return;
        }
        await pause(1500);
      }
      if (current === generation) throw new Error('This invitation expired.');
    } catch (error) {
      if (current === generation) {
        cancelPeer();
        status(explain(error));
        busy(false);
      }
    }
  }

  hostFields.onsubmit = event => {
    event.preventDefault();
    void invite();
  };
  byId('espresso-share-button').onclick = async () => {
    const url = shareUrl.value;
    if (navigator.share) {
      try {
        await navigator.share({ title: fixedGameTitle, url });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      status(automaticEspresso ? 'Invite link copied. Send it to your friend and keep this tab open.' :
        'Invite link copied. Send it to your friend, then paste their reply code when they send it.');
    } catch {
      shareUrl.select();
      status('Copy the selected invite link and send it to your friend.');
    }
  };
  join.onclick = async () => {
    const current = ++generation;
    busy(true);
    status('Verifying your Espresso Cash invitation…');
    try {
      await signIn();
      if (current !== generation) return;
      const route = '/rooms/' + encodeURIComponent(incoming.room);
      const { offer } = await request(route + '/join', 'POST', { invite: incoming.invite });
      if (current !== generation) return;
      await takeOffer(offer, async answer => {
        if (current === generation) await request(route + '/answer', 'POST', { answer });
      });
      if (current === generation) status('Connecting to your friend…');
    } catch (error) {
      if (current === generation) {
        cancelPeer();
        status(explain(error));
      }
    } finally {
      if (current === generation) busy(false);
    }
  };
  connectButton.onclick = async () => {
    connectButton.disabled = true;
    status('');
    try { await signIn(); }
    catch (error) { status(explain(error)); }
    finally { connectButton.disabled = false; }
  };
  box.hidden = false;
  hostFields.hidden = isGuest;
  join.hidden = !isGuest;
  if (window.EspressoConnect || document.readyState === 'complete') void refreshConnection();
  else window.addEventListener('load', refreshConnection, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.EspressoConnect) void refreshConnection();
  });
  return {
    isGuest,
    reset() {
      generation++;
      const route = active;
      active = undefined;
      if (route) void request(route, 'DELETE').catch(() => {});
      share.hidden = true;
      shareUrl.value = '';
      busy(false);
      status(isGuest ? 'Use the same Espresso account that accepted the invite.' : '');
    }
  };
}
