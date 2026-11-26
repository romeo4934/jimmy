import { lobbyApi } from './online-config.js';

export const automaticEspresso = lobbyApi !== '';
const byId = id => document.getElementById(id);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixedGameTitle = 'Tennis at Baseline Club';

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
  const send = byId('espresso-send');
  const share = byId('espresso-link');
  const join = byId('espresso-join');
  const status = text => { byId('espresso-status').textContent = text; };
  let sdk, connection, credential, active, generation = 0;

  function client() {
    if (!window.EspressoConnect) throw new Error('Espresso Connect could not load. Try again in Safari or Chrome.');
    return sdk ??= window.EspressoConnect({ siteName: 'Baseline Club' });
  }
  async function connected() {
    const espresso = client();
    connection = await espresso.isConnected() || await espresso.connect();
    return connection;
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
  async function signIn() {
    await connected();
    if (!automaticEspresso || credential) return;
    const { nonce } = await request('/nonce', 'POST', null, null);
    credential = (await request('/session', 'POST', await sdk.linkProof(nonce), null)).token;
  }
  function showLink(value) {
    const url = new URL(value);
    if (url.origin !== 'https://connect.brij.fi') throw new Error('Espresso did not return a share link.');
    const field = byId('espresso-share-url');
    field.value = url.href;
    byId('espresso-share').hidden = false;
  }
  function busy(value) {
    send.disabled = share.disabled = join.disabled = value;
  }

  async function invite(open) {
    const username = byId('espresso-to').value.trim();
    if (!open && (!username || /[\s,]/.test(username))) {
      status('Enter your friend’s Espresso Cash @username.');
      return;
    }
    const current = ++generation;
    busy(true);
    byId('espresso-share').hidden = true;
    status('Connecting to Espresso Cash…');
    try {
      await signIn();
      if (current !== generation) return;
      const { offer, url } = await createOffer();
      if (current !== generation) return;
      if (!automaticEspresso) {
        const delivered = await sdk.invite({
          ...(open ? { open: true } : { to: [username] }), room: crypto.randomUUID(),
          title: fixedGameTitle, url, maxPlayers: 2
        });
        if (current !== generation) return;
        if (open) showLink(delivered.link);
        status('Espresso invitation submitted. When your friend opens the game, paste the reply code they send you.');
        return;
      }
      const created = await request('/rooms', 'POST', { username, open, offer });
      const route = '/rooms/' + encodeURIComponent(created.room);
      if (current !== generation) {
        await request(route, 'DELETE');
        return;
      }
      active = route;
      if (open) showLink(created.link);
      status('Invitation submitted. Keep this tab open while your friend accepts in Espresso Cash.');
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
      }
    } finally {
      if (current === generation && !active) busy(false);
    }
  }

  send.onclick = () => invite(false);
  share.onclick = () => invite(true);
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
  byId('espresso-connect').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await signIn();
      status('Espresso Cash connected.');
    } catch (error) { status(explain(error)); }
    finally { button.disabled = false; }
  };
  byId('espresso-copy').onclick = async () => {
    const field = byId('espresso-share-url');
    try {
      await navigator.clipboard.writeText(field.value);
      status('Espresso link copied.');
    } catch {
      field.select();
      status('Copy the selected link.');
    }
  };
  box.hidden = false;
  byId('espresso-host-fields').hidden = isGuest;
  join.hidden = !isGuest;
  return {
    reset() {
      generation++;
      const route = active;
      active = undefined;
      if (route) void request(route, 'DELETE').catch(() => {});
      byId('espresso-share').hidden = true;
      busy(false);
      status(isGuest ? 'Connect with the same Espresso account that accepted the invite.' : '');
    }
  };
}
