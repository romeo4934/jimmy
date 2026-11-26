import { automaticEspresso, setupEspresso } from './espresso.js?v=espresso-accept';
import { cpuInput, drivePreview, maxRallyPower, newMatch, step } from './tennis.js?v=timing-flow';
import { makeRenderer } from './render.js?v=lift-drive';

import { courtSound, playLog } from './feedback.js?v=heavy-shots';

const byId = id => document.getElementById(id);
const court = byId('court');
const game = byId('game');
const fullscreen = byId('fullscreen');
const stick = byId('move-stick');
const render = makeRenderer(court);
const audio = courtSound();
const log = playLog();
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
let espressoPeer;
let channel;
let remote = neutral();
let localShot = null;
let drag = null;
const stickDeadZone = 11;
let remoteShot = null;
let sentInput;
let tick = 0;
let nextFrame = 0;
const invitation = new URLSearchParams(location.hash.slice(1)).get('invite');

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

function lobby(message) {
  const previous = peer;
  peer = undefined;
  espressoPeer = undefined;
  channel = undefined;
  previous?.close();
  mode = 'lobby';
  byId('court-mode').textContent = 'LOBBY';
  view = 0;
  match = newMatch();
  keys.clear();
  resetDrag();
  localShot = remoteShot = null;
  sentInput = undefined;
  remote = neutral();
  byId('exchange').hidden = true;
  espressoLobby.reset();
  byId('reset').hidden = true;
  byId('practice').hidden = byId('drill').hidden = false;
  byId('score').hidden = false;
  byId('drill-progress').hidden = true;
  byId('join').hidden = !invitation;
  byId('connect').disabled = false;
  byId('answer').value = '';
  byId('status').textContent = message || (invitation ?
    'A friend invited you to play. Join to get your reply code.' :
    'Start a practice match or invite a friend to play online.');
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
  byId('exchange').hidden = true;
  byId('status').textContent = message;
  byId('court-mode').textContent = peer ? 'ONLINE MATCH' : 'PRACTICE';
  if (focus) court.focus({ preventScroll: true });
}

function showSession(message) {
  byId('court-mode').textContent = 'ONLINE LOBBY';
  byId('status').textContent = message;
  byId('practice').hidden = byId('drill').hidden = byId('join').hidden = true;
  byId('reset').hidden = false;
}

const encode = description => btoa(JSON.stringify(description)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function decode(code, expected) {
  const value = code.trim();
  if (value.length > 35000 || !/^[\w-]+$/.test(value)) throw new Error('Invalid code');
  const description = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
  if (description.type !== expected || typeof description.sdp !== 'string') throw new Error('Invalid description');
  return description;
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
  return encode(connection.localDescription);
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
    enter('Online match · You are Player ' + (view + 1) + '.');
    game.scrollIntoView({ block: 'start' });
  };
  dataChannel.onmessage = event => { if (peer === connection) receive(event.data); };
  dataChannel.onclose = () => {
    if (peer === connection) lobby('The other player disconnected. Start a new match to reconnect.');
  };
}

function createPeer(index) {
  view = index;
  const connection = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  peer = connection;
  mode = 'connecting';
  connection.onconnectionstatechange = () => {
    if (peer === connection && connection.connectionState === 'failed') {
      lobby('The direct connection failed. Try again on another network.');
    }
  };
  return connection;
}

function showReplyExchange(code) {
  const isHost = code === undefined;
  byId('replyBox').hidden = isHost;
  byId('answerBox').hidden = !isHost;
  if (!isHost) {
    byId('out').value = code;
    byId('copy').textContent = 'Copy';
  }
  byId('exchange').hidden = false;
}

byId('practice').onclick = () => {
  enter('Practice · Use the left stick to move. Hold Drive to charge. Release to swing and move again.', true);
};
byId('drill').onclick = () => {
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
byId('join').onclick = async () => {
  showSession('Preparing reply code…');
  let connection;
  try {
    connection = createPeer(1);
    connection.ondatachannel = event => attach(connection, event.channel);
    await connection.setRemoteDescription(decode(invitation, 'offer'));
    const code = await gather(connection, await connection.createAnswer());
    if (peer !== connection) return;
    showReplyExchange(code);
    byId('status').textContent = 'Send this reply code to the host and keep this tab open.';
  } catch {
    if (peer === connection) lobby('Could not accept this invite. Ask your friend for a fresh link.');
  }
};
byId('connect').onclick = async () => {
  const connection = peer;
  byId('connect').disabled = true;
  try {
    await connection.setRemoteDescription(decode(byId('answer').value, 'answer'));
    if (peer === connection && mode === 'connecting') byId('status').textContent = 'Connecting to your friend…';
  } catch {
    if (peer === connection) {
      byId('connect').disabled = false;
      byId('status').textContent = 'That reply code did not work. Paste the complete code from your friend.';
    }
  }
};
byId('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(byId('out').value);
    byId('copy').textContent = 'Copied';
  } catch {
    byId('out').select();
    byId('copy').textContent = 'Copy selected text';
  }
};
byId('reset').onclick = () => start();

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
  render(match, view, active, active ? drivePreview(match, view, localInput()) : null, maxPower);
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
  async createOffer() {
    if (peer) throw new Error('Leave the current match before inviting someone else.');
    showSession('Preparing your Espresso match…');
    const connection = espressoPeer = createPeer(0);
    attach(connection, connection.createDataChannel('tennis'));
    const offer = await gather(connection, await connection.createOffer());
    if (peer !== connection) throw new Error('Match cancelled.');
    const url = new URL(location.href);
    url.search = '';
    url.hash = 'invite=' + offer;
    if (!automaticEspresso) {
      byId('status').textContent = '';
      showReplyExchange();
    }
    return { offer, url: url.href };
  },
  async takeOffer(offer, sendAnswer) {
    if (peer) throw new Error('Leave the current match before joining another.');
    showSession('Joining Espresso match…');
    const connection = espressoPeer = createPeer(1);
    connection.ondatachannel = event => attach(connection, event.channel);
    await connection.setRemoteDescription(decode(offer, 'offer'));
    const answer = await gather(connection, await connection.createAnswer());
    if (peer !== connection) throw new Error('Match cancelled.');
    await sendAnswer(answer);
  },
  async applyAnswer(answer) {
    if (!peer || view !== 0) throw new Error('Match cancelled.');
    await peer.setRemoteDescription(decode(answer, 'answer'));
  },
  cancelPeer() {
    if (espressoPeer && peer === espressoPeer) lobby('Ready for a new match.');
  }
});

byId('espresso-invite').hidden = Boolean(invitation);

function start() {
  lobby();
  if (invitation || espressoLobby.isGuest) {
    if (matchMedia('(max-width: 740px), (orientation: landscape) and (max-height: 600px)').matches) {
      byId('setup').scrollIntoView({ block: 'start' });
    }
    return;
  }
  enter('Practice · Use the left stick to move. Hold Drive to charge. Release to swing and move again.', false);
}
start();
if (espressoLobby.isGuest) void espressoLobby.joinAccepted();
requestAnimationFrame(frame);
