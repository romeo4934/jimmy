const byId = id => document.getElementById(id);
const fixedGameTitle = 'Tennis at Baseline Club';
const inviteOrigins = new Set(['https://connect.espressocash.com', 'https://connect.brij.fi']);
const maxRoomMessageBytes = 16 * 1024;
// The offer must remain available throughout the invite's lifetime.
const inviteLifetime = 600;

function explain(error) {
  if (error?.code === 'site_not_registered' || error?.code === 'site_not_verified') {
    return 'Baseline Club needs an active site in Espresso Connect.';
  }
  if (error?.code === 'cancelled') return 'Connection cancelled.';
  if (error?.code === 'blocked') return 'Open Baseline Club in Safari or Chrome and allow the Espresso window.';
  if (error?.code === 'rate_limited') return 'Too many requests to Espresso. Try again shortly.';
  if (error?.code === 'room_closed' || error?.code === 'invite_expired' || error?.code === 'room_not_found') {
    return 'This invite is no longer available. Ask your friend for a new link.';
  }
  if (error?.code === 'permission_denied') return 'Accept the invite in Espresso Cash and open the game from there.';
  return error?.message || 'Could not complete the Espresso invitation.';
}

function readDescription(data, type) {
  try {
    const description = JSON.parse(data);
    if (description?.type === type && typeof description.sdp === 'string' && description.sdp) {
      return { type, sdp: description.sdp };
    }
  } catch { /* Ignore messages that are not WebRTC descriptions. */ }
  return null;
}

async function sendDescription(room, description, options) {
  const data = JSON.stringify(description);
  if (new TextEncoder().encode(data).length > maxRoomMessageBytes) {
    throw new Error('The connection details are too large. Try again on another network.');
  }
  await room.send(data, options);
}

async function playerName(room, sender, fallback = 'Friend') {
  const players = await room.players().catch(() => []);
  const name = players.find(player => player.euid === sender)?.name;
  return typeof name === 'string' && name.trim() ? name.trim().slice(0, 64) : fallback;
}

export function setupEspresso({ createOffer, inviteReady, takeOffer, applyAnswer, cancelPeer }) {
  const params = new URLSearchParams(location.search);
  const incoming = params.get('espresso_invite');
  const legacyInvite = new URLSearchParams(location.hash.slice(1)).has('invite') || Boolean(incoming && params.has('room'));
  const isGuest = legacyInvite || incoming !== null;
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
  let sdk, pendingSignIn, activeRoom, roomTimer;
  let generation = 0, connectionCheck = 0;

  function client() {
    if (!window.EspressoConnect) throw new Error('Espresso Connect could not load. Try again in Safari or Chrome.');
    sdk ??= window.EspressoConnect({ siteName: 'Baseline Club' });
    if (typeof sdk.room !== 'function' || typeof sdk.invitation !== 'function') {
      throw new Error('Reload Baseline Club to get the Espresso Rooms update.');
    }
    return sdk;
  }
  function showConnection(connection) {
    connectButton.hidden = isGuest || Boolean(connection);
    if (isGuest) join.textContent = connection ? 'Retry joining' : 'Connect and join';
    account.hidden = !connection;
  }
  async function refreshConnection() {
    if (pendingSignIn) return;
    const check = ++connectionCheck;
    let connection;
    try { connection = await client().isConnected(); }
    catch { /* Let the player retry if the SDK or saved connection is unavailable. */ }
    if (check === connectionCheck) showConnection(connection);
  }
  async function completeSignIn(interactive) {
    const espresso = client();
    const connection = await espresso.isConnected();
    showConnection(connection);
    if (connection) return true;
    if (!interactive) return false;
    showConnection(await espresso.connect());
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
  function closeRoom() {
    clearTimeout(roomTimer);
    activeRoom?.close();
    activeRoom = undefined;
  }
  function reset() {
    generation++;
    closeRoom();
    share.hidden = true;
    shareUrl.value = '';
    hostFields.hidden = isGuest;
    join.hidden = !isGuest || legacyInvite;
    updateInviteControls(false);
    status(legacyInvite ? 'This invite was created before Espresso Rooms. Ask your friend for a new invite.' : '');
  }
  function failMatch(error) {
    reset();
    cancelPeer();
    status(explain(error));
  }
  function waitForDescription(room, type, timeout, timeoutMessage, receive) {
    let received = false;
    roomTimer = setTimeout(() => {
      if (activeRoom === room) failMatch(new Error(timeoutMessage));
    }, timeout);
    room.onMessage(message => {
      if (activeRoom !== room || received || typeof message.from !== 'string' || !message.from) return;
      const description = readDescription(message.data, type);
      if (!description) return;
      received = true;
      clearTimeout(roomTimer);
      void receive(description, message.from).catch(error => {
        if (activeRoom === room) failMatch(error);
      });
    });
  }

  async function invite() {
    const open = delivery.value !== 'username';
    const username = open ? '' : usernameField.value.trim();
    if (!open && (!username || /[\s,]/.test(username))) {
      status('Enter one Espresso Cash @username.');
      return;
    }
    if (send.disabled) return;
    const current = ++generation;
    updateInviteControls(true);
    status('Preparing your Espresso invitation…');
    try {
      await signIn();
      if (current !== generation) return;
      const offer = await createOffer();
      if (current !== generation) return;
      const invite = await client().invite({
        ...(open ? { open: true } : { to: [username] }),
        room: crypto.randomUUID(), title: fixedGameTitle, url: location.origin + location.pathname,
        maxPlayers: 2, expiresIn: inviteLifetime
      });
      if (current !== generation) return;
      if (!invite?.id) throw new Error('Espresso did not return a match room.');
      const room = activeRoom = client().room(invite.id);
      await sendDescription(room, offer);
      if (activeRoom !== room) return;
      if (open) showShareLink(invite.link);
      hostFields.hidden = true;
      inviteReady();
      status(open ? 'Share this link and keep this tab open. The match starts when your friend joins.' :
        'Espresso username invite submitted. Keep this tab open while your friend joins.');
      waitForDescription(room, 'answer', inviteLifetime * 1000, 'This invite expired. Send a new one.', async (answer, from) => {
        const name = await playerName(room, from, username ? '@' + username.replace(/^@/, '') : 'Friend');
        if (activeRoom !== room) return;
        status('Connecting to your friend…');
        await applyAnswer(answer, name);
        if (activeRoom === room) closeRoom();
      });
    } catch (error) {
      if (current === generation) failMatch(error);
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
      status('Invite link copied. Send it to your friend and keep this tab open.');
    } catch {
      shareUrl.select();
      status('Copy the selected invite link and send it to your friend.');
    }
  };
  async function joinMatch(interactive) {
    if (!isGuest || legacyInvite || join.disabled) return;
    const current = ++generation;
    join.hidden = true;
    updateInviteControls(true);
    status('Joining your Espresso match…');
    try {
      const connected = await signIn(interactive);
      if (current !== generation) return;
      if (!connected) {
        join.hidden = false;
        updateInviteControls(false);
        status('Connect with the Espresso account that accepted this invite.');
        return;
      }
      const espresso = client();
      const inviteId = espresso.invitation();
      if (!/^inv_[\w-]+$/.test(inviteId ?? '')) throw new Error('Open the invite from Espresso Cash to join this match.');
      const room = activeRoom = espresso.room(inviteId);
      status('Waiting for your friend’s game. Keep this tab open.');
      waitForDescription(room, 'offer', 60_000, 'Still waiting for the host. Ask them to open their game tab, then try again.', async (offer, from) => {
        const name = await playerName(room, from);
        if (activeRoom !== room) return;
        status('Connecting to your friend…');
        await takeOffer(offer, name, async answer => {
          if (activeRoom === room) await sendDescription(room, answer, { to: from });
        });
        if (activeRoom === room) closeRoom();
      });
      // onMessage starts polling; awaiting me() also surfaces errors from the first poll.
      await room.me();
    } catch (error) {
      if (current === generation) failMatch(error);
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
  if (!isGuest || legacyInvite) void refreshConnection();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.EspressoConnect) void refreshConnection();
  });
  return { isGuest, joinAccepted: () => joinMatch(false), reset };
}
