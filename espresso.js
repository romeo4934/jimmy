import { allowedPlayer, roster } from './store.js?v=saved-settings';

const byId = id => document.getElementById(id);
const fixedGameTitle = 'Tennis at Baseline Club';
const inviteOrigins = new Set(['https://connect.espressocash.com', 'https://connect.brij.fi']);
const maxRoomMessageBytes = 16 * 1024;
const inviteLifetime = 3600;

function explain(error) {
  if (error?.code === 'site_not_registered' || error?.code === 'site_not_verified') {
    return 'Baseline Club needs an active site in Espresso Connect.';
  }
  if (error?.code === 'cancelled') return 'Espresso sign-in closed before it finished. Try signing in again.';
  if (error?.code === 'blocked') return 'The Espresso sign-in window was blocked. Open Baseline Club directly in Safari or Chrome and allow pop-ups.';
  if (error?.code === 'not_connected') return 'Reconnect to Espresso Cash to continue.';
  if (error?.code === 'rate_limited') return 'Too many requests to Espresso. Try again shortly.';
  if (error?.code === 'room_closed' || error?.code === 'invite_expired' || error?.code === 'room_not_found') {
    return 'This invite is no longer available. Ask your friend for a new link.';
  }
  if (error?.code === 'permission_denied') return 'Accept the invite in Espresso Cash and open the game from there.';
  return error?.message || 'Could not complete the Espresso invitation.';
}

function readSignal(data) {
  try {
    const signal = JSON.parse(data);
    if (!signal || typeof signal.attempt !== 'string' || !signal.attempt || signal.attempt.length > 64) return null;
    if (signal.type === 'ready') return signal;
    if (['offer', 'answer'].includes(signal.type) && typeof signal.round === 'string' && signal.round &&
        signal.round.length <= 64 && typeof signal.sdp === 'string' && signal.sdp) return signal;
  } catch { /* Ignore messages outside the match protocol. */ }
  return null;
}

async function sendSignal(room, signal, to) {
  const data = JSON.stringify(signal);
  if (new TextEncoder().encode(data).length > maxRoomMessageBytes) {
    throw new Error('The connection details are too large. Try again on another network.');
  }
  await room.send(data, { to });
}

async function roomPlayer(room, sender, selected, fallback = 'Friend') {
  const players = await room.players();
  const player = players.find(entry => entry.euid === sender);
  const name = typeof player?.name === 'string' && player.name.trim() ? player.name.trim().slice(0, 64) : fallback;
  const items = Array.isArray(player?.items) ? player.items : [];
  return { name, euid: player?.euid, appearance: allowedPlayer(selected, items, roster[1]) };
}

export function setupEspresso({ record, onConnection, createOffer, inviteReady, takeOffer, applyAnswer, cancelPeer, selectedPlayer }) {
  const params = new URLSearchParams(location.search);
  const incoming = params.get('espresso_invite');
  const legacyInvite = new URLSearchParams(location.hash.slice(1)).has('invite') || Boolean(incoming && params.has('room'));
  let isInvitePage = legacyInvite || incoming !== null;
  const connectButton = byId('espresso-connect');
  const send = byId('espresso-send');
  const hostFields = byId('espresso-host-fields');
  const usernameField = byId('espresso-to');
  const share = byId('espresso-share');
  const shareUrl = byId('espresso-share-url');
  const join = byId('espresso-join');
  const status = text => { byId('espresso-status').textContent = text; };
  let sdk, pendingSignIn, activeRoom, roomTimer, readyTimer;
  let needsConnection = false;
  let generation = 0, connectionCheck = 0;
  if (isInvitePage) {
    record(document.documentElement.dataset.espressoTicket === 'present'
      ? 'Invite opened with an Espresso connection ticket.'
      : 'Invite opened without an Espresso connection ticket.');
  } else {
    record('Game opened.');
  }

  function client() {
    if (!window.EspressoConnect) throw new Error('Espresso Connect could not load. Try again in Safari or Chrome.');
    sdk ??= window.EspressoConnect({ siteName: 'Baseline Club' });
    if (typeof sdk.room !== 'function' || typeof sdk.invitation !== 'function') {
      throw new Error('Reload Baseline Club to get the Espresso Rooms update.');
    }
    return sdk;
  }
  function showConnection(connection, refresh = false) {
    needsConnection = !connection;
    connectButton.hidden = isInvitePage || Boolean(connection);
    if (isInvitePage) join.textContent = connection ? 'Retry joining' : 'Connect and join';
    onConnection(sdk, connection, refresh);
  }
  async function refreshConnection() {
    if (pendingSignIn) return;
    const check = ++connectionCheck;
    let connection;
    try { connection = await client().isConnected(); }
    catch (error) { record('Saved-session check failed.', error); }
    if (check === connectionCheck) {
      if (needsConnection !== !connection) record(connection ? 'Espresso connection found.' : 'No saved Espresso connection.');
      showConnection(connection, true);
    }
  }
  async function completeSignIn(interactive) {
    const espresso = client();
    // A sign-in window must open directly from the tap, before any async reads.
    const openSignIn = interactive && needsConnection;
    record(openSignIn ? 'Opening the Espresso sign-in window.' : 'Checking the Espresso connection.');
    const connection = openSignIn ? await espresso.connect() : await espresso.isConnected();
    record(connection ? 'Espresso connection confirmed.' : 'No saved Espresso connection.');
    showConnection(connection);
    return Boolean(connection);
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
    usernameField.disabled = send.disabled = join.disabled = busy;
    send.textContent = usernameField.value.trim() ? 'Send invite' : 'Create invite link';
  }
  function closeRoom() {
    clearTimeout(roomTimer);
    clearInterval(readyTimer);
    activeRoom?.close();
    activeRoom = undefined;
  }
  function reset() {
    generation++;
    closeRoom();
    share.hidden = true;
    shareUrl.value = '';
    hostFields.hidden = isInvitePage;
    join.hidden = !isInvitePage || legacyInvite;
    updateInviteControls(false);
    status(isInvitePage && legacyInvite ? 'This invite was created before Espresso Rooms. Ask your friend for a new invite.' : '');
  }
  function failMatch(error) {
    record('Match setup failed.', error);
    reset();
    cancelPeer();
    if (error?.code === 'not_connected') showConnection(null);
    status(explain(error));
  }
  async function openRoom(inviteId, username = '') {
    const room = activeRoom = client().room(inviteId);
    const pending = [];
    let receive;
    let negotiation;
    const isCurrent = current => activeRoom === room && negotiation === current;
    function fail(error, current) {
      if (isCurrent(current)) failMatch(error);
    }
    room.onMessage(message => {
      if (activeRoom !== room) return;
      if (receive) receive(message);
      else pending.push(message);
    });
    const me = await room.me();
    const [host] = await room.players();
    if (activeRoom !== room) return;
    if (!me || !host?.euid) throw new Error('Espresso couldn’t find the players in this match.');
    const isHost = me === host.euid;
    const attempt = isHost ? null : crypto.randomUUID();
    record(isHost ? 'Espresso room opened as host.' : 'Espresso room opened as guest.');
    roomTimer = setTimeout(() => {
      if (activeRoom === room) failMatch(new Error('Still waiting for the other player. Reopen the match from Espresso Cash.'));
    }, inviteLifetime * 1000);

    async function offerTo(current) {
      const fallback = username ? '@' + username.replace(/^@/, '') : 'Friend';
      const player = await roomPlayer(room, current.from, undefined, fallback);
      if (!isCurrent(current)) return;
      status(`${player.name} joined. Connecting…`);
      record('Second player joined. Preparing a fresh WebRTC offer.');
      const offer = await createOffer();
      if (!isCurrent(current)) return;
      await sendSignal(room, { ...offer, attempt: current.attempt, round: current.round, player: selectedPlayer() }, current.from);
    }
    async function acceptAnswer(signal, current) {
      const fallback = username ? '@' + username.replace(/^@/, '') : 'Friend';
      const player = await roomPlayer(room, current.from, signal.player, fallback);
      if (!isCurrent(current)) return;
      record('Guest answer received.');
      await applyAnswer({ type: 'answer', sdp: signal.sdp }, player);
    }
    async function answerOffer(signal, current) {
      const player = await roomPlayer(room, host.euid, signal.player);
      if (!isCurrent(current)) return;
      record('Fresh host offer received.');
      status('Connecting to your friend…');
      await takeOffer({ type: 'offer', sdp: signal.sdp }, player, async answer => {
        if (!isCurrent(current)) return;
        await sendSignal(room, { ...answer, attempt, round: current.round, player: selectedPlayer() }, host.euid);
        if (isCurrent(current)) record('Answer sent to the host.');
      });
    }
    receive = ({ from, data }) => {
      if (typeof from !== 'string' || !from || from === me) return;
      const signal = readSignal(data);
      if (!signal) return;
      if (isHost && signal.type === 'ready' && signal.attempt !== negotiation?.attempt) {
        const current = negotiation = { from, attempt: signal.attempt, round: crypto.randomUUID() };
        void offerTo(current).catch(error => fail(error, current));
      } else if (isHost && signal.type === 'answer' && negotiation?.from === from && negotiation.round === signal.round &&
                 negotiation.attempt === signal.attempt && !negotiation.answered) {
        const current = negotiation;
        current.answered = true;
        void acceptAnswer(signal, current).catch(error => fail(error, current));
      } else if (!isHost && from === host.euid && signal.type === 'offer' && signal.attempt === attempt && signal.round !== negotiation?.round) {
        const current = negotiation = { round: signal.round };
        void answerOffer(signal, current).catch(error => fail(error, current));
      }
    };
    if (isHost) {
      inviteReady();
      // The newest retained ready message belongs to the most recent guest tab.
      const ready = pending.findLast(message => message.from !== me && readSignal(message.data)?.type === 'ready');
      if (ready) receive(ready);
    } else {
      status(`${host.name || 'Your friend'} was notified. Keep this tab open while they join.`);
      const sendReady = () => sendSignal(room, { type: 'ready', attempt }, host.euid);
      await sendReady();
      if (activeRoom !== room) return;
      readyTimer = setInterval(() => {
        if (activeRoom === room) void sendReady().catch(error => record('Couldn’t refresh the ready signal.', error));
      }, 120_000);
    }
  }

  async function invite() {
    const username = usernameField.value.trim();
    const open = !username;
    if (username === '@' || /[\s,]/.test(username)) {
      status('Enter one Espresso Cash @username.');
      return;
    }
    if (send.disabled) return;
    const current = ++generation;
    updateInviteControls(true);
    status('Preparing your Espresso invitation…');
    try {
      const connected = await signIn();
      if (current !== generation) return;
      if (!connected) {
        updateInviteControls(false);
        status('Connect to Espresso Cash to send an invite.');
        return;
      }
      const invite = await client().invite({
        ...(open ? { open: true } : { to: [username] }),
        room: crypto.randomUUID(), title: fixedGameTitle, url: location.origin + location.pathname,
        maxPlayers: 2, expiresIn: inviteLifetime
      });
      if (current !== generation) return;
      if (!invite?.id) throw new Error('Espresso did not return a match room.');
      record(open ? 'Espresso share link created.' : 'Espresso username invite submitted.');
      if (open) showShareLink(invite.link);
      hostFields.hidden = true;
      status(open ? 'Share this link. Espresso will notify you when your friend accepts.' :
        'Espresso will notify you when your friend accepts.');
      await openRoom(invite.id, username);
    } catch (error) {
      if (current === generation) failMatch(error);
    }
  }

  usernameField.oninput = () => {
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
      status('Invite link copied. Espresso will notify you when your friend accepts.');
    } catch {
      shareUrl.select();
      status('Copy the selected invite link and send it to your friend.');
    }
  };
  async function joinMatch(interactive) {
    if (!isInvitePage || legacyInvite || join.disabled) return;
    const current = ++generation;
    join.hidden = true;
    updateInviteControls(true);
    record(interactive ? 'Join button tapped.' : 'Trying to join automatically.');
    status(interactive && needsConnection ? 'Approve sign-in in Espresso Cash, then return to this tab.' : 'Joining your Espresso match…');
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
      record('Checking access to the Espresso room.');
      status('Finding your match…');
      await openRoom(inviteId);
    } catch (error) {
      if (current === generation) failMatch(error);
    }
  }
  join.onclick = () => joinMatch(true);
  connectButton.onclick = async () => {
    connectButton.disabled = true;
    status('Approve sign-in in Espresso Cash, then return to this tab.');
    try { if (await signIn()) status(''); }
    catch (error) {
      record('Espresso sign-in failed.', error);
      status(explain(error));
    }
    finally { connectButton.disabled = false; }
  };
  hostFields.hidden = isInvitePage;
  if (!isInvitePage || legacyInvite) void refreshConnection();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.EspressoConnect) void refreshConnection();
  });
  return {
    get isInvitePage() { return isInvitePage; },
    leaveInvite() {
      if (!isInvitePage) return;
      isInvitePage = false;
      history.replaceState(null, '', location.pathname);
      void refreshConnection();
    },
    joinAccepted: () => joinMatch(false), matchStarted: closeRoom, reset, client, signIn
  };
}
