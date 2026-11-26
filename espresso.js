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

export function setupEspresso({ createOffer, inviteReady, takeOffer, applyAnswer, cancelPeer }) {
  const params = new URLSearchParams(location.search);
  const incoming = { room: params.get('room'), invite: params.get('espresso_invite') };
  const isGuest = automaticEspresso && /^[A-Za-z0-9_-]{43}$/.test(incoming.room ?? '') &&
    /^inv_[\w-]+$/.test(incoming.invite ?? '');
  const box = byId('espresso-invite');
  const connectButton = byId('espresso-connect');
  const account = byId('espresso-account');
  const send = byId('espresso-send');
  const hostFields = byId('espresso-host-fields');
  const delivery = byId('espresso-delivery');
  const recipient = byId('espresso-recipient');
  const usernameField = byId('espresso-to');
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
    connectButton.hidden = isGuest || Boolean(connection);
    if (isGuest) join.textContent = connection ? 'Join match' : 'Connect and join';
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
  async function completeSignIn(interactive) {
    const espresso = client();
    const connection = await espresso.isConnected();
    showConnection(connection);
    if (!connection) {
      if (!interactive) return false;
      showConnection(await espresso.connect());
    }
    if (automaticEspresso && !credential) {
      const { nonce } = await request('/nonce', 'POST', null, null);
      credential = (await request('/session', 'POST', await espresso.linkProof(nonce), null)).token;
    }
    return true;
  }
  function signIn(interactive = true) {
    if (!pendingSignIn) {
      connectionCheck++;
      pendingSignIn = completeSignIn(interactive).finally(() => { pendingSignIn = undefined; });
    }
    return pendingSignIn;
  }
  function showShareLink(value) {
    let url;
    try { url = new URL(value); }
    catch { /* Report a missing or malformed link below. */ }
    if (!url || !inviteOrigins.has(url.origin) || url.username || url.password || !/^\/i\/[^/]+$/.test(url.pathname)) {
      throw new Error('Espresso did not return a valid invite link.');
    }
    shareUrl.value = url.href;
    share.hidden = false;
  }
  function updateInviteControls(busy) {
    const byUsername = delivery.value === 'username';
    recipient.hidden = !byUsername;
    usernameField.disabled = busy || !byUsername;
    delivery.disabled = send.disabled = join.disabled = busy;
    send.textContent = byUsername ? 'Send Espresso invite' : 'Create invite link';
  }

  async function invite() {
    const open = delivery.value !== 'username';
    const username = open ? '' : usernameField.value.trim();
    if (!open && (!username || /[\s,]/.test(username))) {
      status('Enter one Espresso Cash @username.');
      return;
    }
    const current = ++generation;
    updateInviteControls(true);
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
        hostFields.hidden = true;
        inviteReady();
        status(open ? 'Share this link and keep this tab open. After accepting in Espresso, your friend taps Join match to get their reply code.' :
          'Espresso username invite submitted. After accepting, your friend taps Join match to get their reply code.');
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
      hostFields.hidden = true;
      inviteReady();
      status(open ? 'Share this link and keep this tab open while your friend joins.' :
        'Espresso username invite submitted. Keep this tab open while your friend accepts.');
      const deadline = Date.now() + 900000;
      while (current === generation && Date.now() < deadline) {
        const { answer } = await request(route);
        if (current !== generation) return;
        if (answer) {
          await applyAnswer(answer, username);
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
        updateInviteControls(false);
      }
    }
  }

  delivery.onchange = () => {
    updateInviteControls(false);
    status('');
  };
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
  async function joinMatch(interactive) {
    if (join.disabled) return;
    const current = ++generation;
    let joined = false;
    join.hidden = true;
    updateInviteControls(true);
    status('Verifying your Espresso Cash invitation…');
    try {
      const connected = await signIn(interactive);
      if (current !== generation) return;
      if (!connected) {
        status('Connect with the Espresso account that accepted this invite.');
        return;
      }
      const route = '/rooms/' + encodeURIComponent(incoming.room);
      const { offer } = await request(route + '/join', 'POST', { invite: incoming.invite });
      if (current !== generation) return;
      await takeOffer(offer, async answer => {
        if (current === generation) await request(route + '/answer', 'POST', { answer });
      });
      if (current === generation) {
        joined = true;
        status('Connecting to your friend…');
      }
    } catch (error) {
      if (current === generation) {
        cancelPeer();
        status(explain(error));
      }
    } finally {
      if (current === generation) {
        join.hidden = joined;
        updateInviteControls(false);
      }
    }
  }
  join.onclick = () => joinMatch(true);
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
  if (!isGuest) void refreshConnection();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.EspressoConnect) void refreshConnection();
  });
  return {
    isGuest,
    joinAccepted: () => joinMatch(false),
    reset() {
      generation++;
      const route = active;
      active = undefined;
      if (route) void request(route, 'DELETE').catch(() => {});
      share.hidden = true;
      shareUrl.value = '';
      hostFields.hidden = isGuest;
      join.hidden = !isGuest;
      updateInviteControls(false);
      status(isGuest ? 'Use the same Espresso account that accepted the invite.' : '');
    }
  };
}
