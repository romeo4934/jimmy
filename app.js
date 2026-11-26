import { setupEspresso } from './espresso.js?v=roster';
import { cpuInput, drivePreview, maxRallyPower, newMatch, step } from './tennis.js?v=timing-flow';
import { drawPlayerPreview, makeRenderer } from './render.js?v=oval-rackets';
import { roster, setupStore } from './store.js?v=roster';

import { connectionLog, courtSound, playLog } from './feedback.js?v=rooms-diagnostics';

const byId = id => document.getElementById(id);
const court = byId('court');
const game = byId('game');
const courtMode = byId('court-mode');
const espressoPanel = byId('espresso-invite');
const practiceOptions = byId('practice-options');
const practiceButton = byId('practice');
const fullscreen = byId('fullscreen');
const stick = byId('move-stick');
const render = makeRenderer(court);
const audio = courtSound();
const log = playLog();
const recordConnection = connectionLog();
let seenEvent = 0;
let lateralCorrections = 0;
const refreshLog = () => { byId('export-log').disabled = !log.count; };
const movementKeys = { KeyW: 'ArrowUp', KeyA: 'ArrowLeft', KeyS: 'ArrowDown', KeyD: 'ArrowRight' };
const keys = new Set();
const bindings = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyZ', 'KeyX']);
const neutral = () => ({ x: 0, y: 0, shot: null, held: null });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let mode = 'lobby';
let match = newMatch();
let view = 0;
let peer;
let peerTimer;
let opponentName = 'Friend';
let ownPlayer = roster[0];
let opponentPlayer = roster[1];
let channel;
let remote = neutral();
let localShot = null;
let drag = null;
const stickDeadZone = 11;
let remoteShot = null;
let sentInput;
let tick = 0;
let nextFrame = 0;

function press(key) {
  if (!keys.has(key) && (key === 'KeyZ' || key === 'KeyX')) {
    if (byId('sound-enabled').checked) audio.unlock();
    localShot = key === 'KeyZ' ? 'drive' : 'lob';
    if (key === 'KeyZ' && drag) {
      drag.aimOnly = true;
      drag.y = 0;
    }
  }
  keys.add(key);
}
window.addEventListener('keydown', event => {
  const key = movementKeys[event.code] || event.code;
  if (event.altKey || event.ctrlKey || event.metaKey ||
    event.target.closest?.('input, textarea, [contenteditable]') ||
    !bindings.has(key) || mode !== 'playing') return;
  event.preventDefault();
  press(key);
});
function release(key) {
  keys.delete(key);
  if (key === 'KeyZ') resumeMovement();
}
window.addEventListener('keyup', event => release(movementKeys[event.code] || event.code));
function updateFullscreen() {
  const expanded = document.fullscreenElement === game || game.classList.contains('expanded');
  fullscreen.textContent = expanded ? 'Exit fullscreen' : 'Fullscreen';
  fullscreen.setAttribute('aria-pressed', String(expanded));
}
fullscreen.onclick = async () => {
  if (document.fullscreenElement === game) await document.exitFullscreen();
  else if (game.classList.contains('expanded')) game.classList.remove('expanded');
  else {
    try { await game.requestFullscreen(); }
    catch { game.classList.add('expanded'); }
  }
  updateFullscreen();
  court.focus({ preventScroll: true });
};
document.addEventListener('fullscreenchange', updateFullscreen);
byId('match-setup').onclick = () => {
  byId('setup').scrollIntoView({ block: 'start' });
  byId('back-to-court').focus({ preventScroll: true });
};
byId('back-to-court').onclick = () => {
  game.scrollIntoView({ block: 'start' });
  court.focus({ preventScroll: true });
};
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && game.classList.contains('expanded')) {
    game.classList.remove('expanded');
    updateFullscreen();
  }
});
court.addEventListener('pointerdown', () => court.focus({ preventScroll: true }));

function paintStick(x, y) {
  const scale = Math.min(1, 29 / (Math.hypot(x,y) || 1));
  stick.style.setProperty('--stick-x', x * scale + 'px');
  stick.style.setProperty('--stick-y', y * scale + 'px');
}

function resetDrag() {
  drag = null;
  stick.classList.remove('is-held');
  paintStick(0,0);
}

stick.addEventListener('pointerdown', event => {
  if (mode !== 'playing' || drag || event.button !== 0) return;
  event.preventDefault();
  stick.setPointerCapture(event.pointerId);
  if (byId('sound-enabled').checked) audio.unlock();
  drag = {
    id: event.pointerId, startX: event.clientX, startY: event.clientY,
    lastX: event.clientX, lastY: event.clientY, axis: null, corrected: false,
    aimOnly: keys.has('KeyZ'), x: 0, y: 0
  };
  stick.classList.add('is-held');
});

stick.addEventListener('pointermove', event => {
  if (event.pointerId !== drag?.id) return;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  const x = event.clientX - drag.startX;
  let y = event.clientY - drag.startY;
  if (drag.aimOnly) {
    drag.x = clamp(x / 35, -1, 1);
    drag.y = clamp(y / 35, -1, 1);
    paintStick(x,y);
    return;
  }
  if (!drag.axis && Math.hypot(x,y) >= stickDeadZone) {
    drag.axis = Math.abs(x) > Math.abs(y) * 1.4 ? 'lateral' : 'free';
  }
  if (drag.axis === 'lateral') {
    if (Math.abs(y) >= 15) {
      drag.startY += Math.sign(y) * 15;
      y = event.clientY - drag.startY;
      drag.axis = 'free';
    } else {
      if (!drag.corrected && Math.abs(y) >= 4) {
        drag.corrected = true;
        lateralCorrections++;
      }
      y = 0;
    }
  }
  const distance = Math.hypot(x,y);
  drag.x = distance < stickDeadZone ? 0 : x / distance;
  drag.y = distance < stickDeadZone ? 0 : y / distance;
  paintStick(x,y);
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  stick.addEventListener(type, event => {
    if (event.pointerId === drag?.id) resetDrag();
  });
}
window.addEventListener('blur', () => { keys.clear(); localShot = null; resetDrag(); });
document.querySelectorAll('[data-key]').forEach(button => {
  button.addEventListener('pointerdown', event => {
    if (mode !== 'playing') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(button.dataset.key);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, () => release(button.dataset.key));
  }
});

function closePeer() {
  clearTimeout(peerTimer);
  const previous = peer;
  peer = undefined;
  channel = undefined;
  previous?.close();
}

function lobby(message) {
  closePeer();
  mode = 'lobby';
  courtMode.textContent = 'LOBBY';
  opponentName = 'Friend';
  opponentPlayer = roster[1];
  view = 0;
  match = newMatch();
  keys.clear();
  resetDrag();
  localShot = remoteShot = null;
  sentInput = undefined;
  remote = neutral();
  espressoLobby.reset();
  espressoPanel.hidden = false;
  byId('open-store').hidden = false;
  byId('reset').hidden = !espressoLobby.isInvitePage;
  practiceOptions.hidden = false;
  practiceOptions.open = false;
  practiceButton.textContent = 'Play vs CPU';
  byId('score').hidden = true;
  byId('drill-progress').hidden = true;
  byId('status').textContent = message || (espressoLobby.isInvitePage ? '' : 'Start a practice match or invite a friend to play online.');
}

function enter(message, focus = true, drill = false) {
  mode = 'playing';
  match = newMatch(drill);
  seenEvent = lateralCorrections = 0;
  byId('score').hidden = drill;
  byId('drill-progress').hidden = !drill;
  tick = 0;
  keys.clear();
  resetDrag();
  localShot = remoteShot = null;
  sentInput = undefined;
  byId('status').textContent = message;
  practiceButton.textContent = !peer && !drill ? 'Restart practice' : 'Play vs CPU';
  const opponent = peer ? opponentName : 'CPU';
  byId('p1-name').textContent = view === 0 ? 'You' : opponent;
  byId('p2-name').textContent = view === 1 ? 'You' : opponent;
  courtMode.textContent = peer ? 'ONLINE · VS ' + opponent : 'PRACTICE · VS CPU';
  if (focus) court.focus({ preventScroll: true });
}

function showSession(message) {
  mode = 'lobby';
  byId('open-store').hidden = true;
  match = newMatch();
  courtMode.textContent = 'PREPARING MATCH';
  byId('score').hidden = true;
  byId('drill-progress').hidden = true;
  byId('status').textContent = message;
  practiceOptions.hidden = true;
  byId('reset').hidden = false;
}

async function gather(connection, description) {
  await connection.setLocalDescription(description);
  if (connection.iceGatheringState !== 'complete') {
    await new Promise(resolve => {
      const done = () => {
        clearTimeout(timeout);
        connection.removeEventListener('icegatheringstatechange', check);
        resolve();
      };
      const check = () => {
        if (connection.iceGatheringState === 'complete') done();
      };
      const timeout = setTimeout(done, 8500);
      connection.addEventListener('icegatheringstatechange', check);
      check();
    });
  }
  const { type, sdp } = connection.localDescription;
  const candidates = [...sdp.matchAll(/^a=candidate:[^\r\n]*? typ (host|srflx|prflx|relay)\b/gm)];
  const types = [...new Set(candidates.map(candidate => candidate[1]))];
  recordConnection(`WebRTC ${type} gathered ${candidates.length} ICE candidates${types.length ? ` (${types.join(', ')})` : ''}.`);
  return { type, sdp };
}

function receive(data) {
  try {
    const message = JSON.parse(data);
    if (view === 0 && message.input) {
      const { x, y, shot, held, fixedMove, walk, target } = message.input;
      if (Number.isFinite(x) && Math.abs(x) <= 1 && Number.isFinite(y) && Math.abs(y) <= 1) {
        remote = {
          x, y, held: held === 'lob' || held === 'drive' ? held : null,
          fixedMove: fixedMove === true, walk: walk === true,
          target: Number.isFinite(target?.x) && Number.isFinite(target?.y) ? target : null
        };
        if (shot === 'lob' || shot === 'drive') remoteShot = shot;
      }
    }
    if (view === 1 && message.match?.players?.length === 2 &&
      message.match.points?.length === 2 && message.match.games?.length === 2) match = message.match;
    if (view === 1) consumeEvent();
  } catch { /* Ignore malformed data from the other browser. */ }
}

function attach(connection, dataChannel) {
  if (peer !== connection) { dataChannel.close(); return; }
  channel = dataChannel;
  dataChannel.onopen = () => {
    if (peer !== connection) return;
    clearTimeout(peerTimer);
    recordConnection('WebRTC data channel opened. Match started.');
    espressoLobby.matchStarted();
    espressoPanel.hidden = true;
    enter('Online match · You vs ' + opponentName + '.');
    game.scrollIntoView({ block: 'start' });
  };
  dataChannel.onmessage = event => { if (peer === connection) receive(event.data); };
  dataChannel.onclose = () => {
    if (peer !== connection) return;
    recordConnection('WebRTC data channel closed.');
    lobby('The other player disconnected. Start a new match to reconnect.');
  };
}

const directConnectionFailed = 'The browsers couldn’t connect. Try a new invite or another network.';

function waitForPeer(connection) {
  if (peer !== connection || channel?.readyState === 'open') return;
  peerTimer = setTimeout(() => {
    if (peer !== connection) return;
    recordConnection('WebRTC timed out after exchanging the offer and answer.');
    lobby(directConnectionFailed);
  }, 30_000);
}

function createPeer(index) {
  closePeer();
  view = index;
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peer = connection;
  mode = 'connecting';
  connection.oniceconnectionstatechange = () => {
    if (peer === connection) recordConnection(`ICE: ${connection.iceConnectionState}.`);
  };
  connection.onconnectionstatechange = () => {
    if (peer !== connection) return;
    recordConnection(`WebRTC: ${connection.connectionState}.`);
    if (connection.connectionState === 'failed') {
      lobby(directConnectionFailed);
    }
  };
  return connection;
}

practiceButton.onclick = () => {
  practiceOptions.open = false;
  enter('');
  game.scrollIntoView({ block: 'start' });
};
byId('drill').onclick = () => {
  practiceOptions.open = false;
  if (byId('sound-enabled').checked) audio.unlock();
  enter('Return drill · Read the bounce marker, hold Drive, then release near contact.', true, true);
  game.scrollIntoView({ block: 'start' });
};
byId('export-log').onclick = async () => {
  const report = log.report();
  try {
    await navigator.clipboard.writeText(report);
    byId('log-status').textContent = 'Log copied. Paste it into your feedback.';
  } catch {
    const output = byId('playtest-report');
    output.hidden = false;
    output.value = report;
    output.select();
    byId('log-status').textContent = 'Select and copy the log below.';
  }
};
refreshLog();
byId('reset').onclick = () => {
  if (espressoLobby.isInvitePage) location.assign(location.pathname);
  else start();
};

function send(message) {
  if (channel?.readyState !== 'open' || channel.bufferedAmount >= 16000) return false;
  channel.send(JSON.stringify(message));
  return true;
}

function localInput() {
  return {
    x: drag?.x ?? Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
    y: drag?.y ?? Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
    fixedMove: !!drag,
    shot: localShot,
    held: keys.has('KeyZ') ? 'drive' : keys.has('KeyX') ? 'lob' : null
  };
}

function resumeMovement() {
  if (!drag?.aimOnly) return;
  Object.assign(drag, {
    startX: drag.lastX, startY: drag.lastY, x: 0, y: 0,
    axis: null, corrected: false, aimOnly: false
  });
  paintStick(0,0);
}

function consumeEvent() {
  const entry = match.lastEvent;
  if (!entry || entry.id <= seenEvent) return;
  seenEvent = entry.id;
  if (byId('sound-enabled').checked) audio.play(entry);
  if (entry.type !== 'point' && entry.type !== 'drill') return;
  if (byId('log-enabled').checked) {
    const { id, type, ...result } = entry;
    const details = type === 'point'
      ? { ...result, won: entry.winner === view, shot: match.lastShots?.[view] ?? null,
          miss: match.lastMisses?.[view] ?? null }
      : result;
    const saved = log.add({ mode: type === 'drill' ? 'return-drill' : peer ? 'online' : 'cpu',
      ...details, lateralCorrections });
    refreshLog();
    byId('log-status').textContent = saved ? log.count + ' entries saved on this device.' :
      'Log available in this tab only. Copy it before closing.';
  }
  lateralCorrections = 0;
}

function simulate() {
  const input = localInput();
  localShot = null;
  tick++;
  if (view === 1) {
    const changed = !sentInput || input.x !== sentInput.x || input.y !== sentInput.y ||
      input.held !== sentInput.held || input.fixedMove !== sentInput.fixedMove;
    if ((input.shot || changed || tick % 2 === 0) && send({ input })) sentInput = input;
  } else {
    const opponent = peer ? { ...remote, shot: remoteShot } :
      match.drill ? neutral() : { ...cpuInput(match), cpu: true };
    remoteShot = null;
    step(match, [input, opponent]);
    consumeEvent();
    if (peer && tick % 2 === 0) send({ match });
  }
}

function pointLabel(points, against) {
  if (points >= 3 && against >= 3) return points === against ? '40' : points > against ? 'AD' : '40';
  return [0, 15, 30, 40][points];
}
function frame(now) {
  if (!nextFrame || now - nextFrame > 100) nextFrame = now;
  while (nextFrame <= now) {
    if (mode === 'playing') simulate();
    nextFrame += 1000 / 60;
  }
  const active = mode === 'playing';
  const p = match.players[view];
  const serving = match.server === view && (match.toss || p.swing && match.lastShots?.[view]?.serve);
  const maxPower = serving ? 1 : maxRallyPower;
  render(match, view, active, active ? drivePreview(match, view, localInput()) : null, maxPower, ownPlayer, opponentPlayer);
  if (match.drill && byId('drill-progress').textContent !== match.call) {
    byId('drill-progress').textContent = match.call;
  }
  const power = Math.round((p.power || 0) * 100);
  const meter = byId('power-meter');
  if (meter.max !== maxPower * 100) meter.max = maxPower * 100;
  if (meter.value !== power) meter.value = power;
  byId('p1').textContent = pointLabel(...match.points);
  byId('p2').textContent = pointLabel(match.points[1], match.points[0]);
  byId('games').textContent = 'GAMES ' + match.games.join('–');
  requestAnimationFrame(frame);
}
const espressoLobby = setupEspresso({
  record: recordConnection,
  selectedPlayer: () => ownPlayer.id,
  async createOffer() {
    showSession('Your friend joined. Connecting…');
    courtMode.textContent = 'FRIEND JOINED';
    const connection = createPeer(0);
    attach(connection, connection.createDataChannel('tennis'));
    const offer = await gather(connection, await connection.createOffer());
    if (peer !== connection) throw new Error('Match cancelled.');
    return offer;
  },
  inviteReady() {
    showSession('');
    courtMode.textContent = 'WAITING FOR FRIEND';
  },
  async takeOffer(offer, opponent, sendAnswer) {
    showSession('Joining Espresso match…');
    opponentName = opponent.name;
    opponentPlayer = opponent.appearance;
    const connection = createPeer(1);
    connection.ondatachannel = event => attach(connection, event.channel);
    await connection.setRemoteDescription(offer);
    const answer = await gather(connection, await connection.createAnswer());
    if (peer !== connection) throw new Error('Match cancelled.');
    await sendAnswer(answer);
    if (peer === connection && mode === 'connecting') courtMode.textContent = 'CONNECTING TO FRIEND';
    waitForPeer(connection);
  },
  async applyAnswer(answer, opponent) {
    const connection = peer;
    if (!connection || view !== 0) throw new Error('Match cancelled.');
    opponentName = opponent.name;
    opponentPlayer = opponent.appearance;
    courtMode.textContent = 'CONNECTING TO FRIEND';
    await connection.setRemoteDescription(answer);
    waitForPeer(connection);
  },
  cancelPeer() {
    if (peer || byId('open-store').hidden) lobby('Ready for a new match.');
  }
});

function start() {
  lobby();
  if (espressoLobby.isInvitePage) {
    if (matchMedia('(max-width: 740px), (orientation: landscape) and (max-height: 600px)').matches) {
      byId('setup').scrollIntoView({ block: 'start' });
    }
    return;
  }
  enter('', false);
}
start();
if (espressoLobby.isInvitePage) void espressoLobby.joinAccepted();
setupStore({
  client: espressoLobby.client,
  signIn: espressoLobby.signIn,
  drawPreview: drawPlayerPreview,
  setPlayer(player) { ownPlayer = player; }
});
requestAnimationFrame(frame);
