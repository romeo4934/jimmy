const host = 'tennis.arcadefleet.com';
const endpoint = 'https://mcp.espressocash.com/games/logs';
const consentKey = 'baseline-share-gameplay';
const playerKey = 'baseline-gameplay-id';
const batchSize = 50;

// The public intake used by Espresso's brij-log.js. Own the queue so opting
// out drops unsent data and stops lifecycle events as well as gameplay events.
export function gameLogs(onPageEnd) {
  const required = location.hostname === host;
  const available = location.origin === `https://${host}`;
  let consent = false;
  let session;
  let timer;

  try { consent = available && localStorage.getItem(consentKey) === 'yes'; }
  catch { /* Sharing can still be enabled for this tab. */ }

  function record(type, data = {}) {
    if (!consent) return;
    if (!session) {
      let player = crypto.randomUUID();
      try {
        player = localStorage.getItem(playerKey) || player;
        localStorage.setItem(playerKey, player);
      } catch { /* Use an anonymous ID for this session only. */ }
      session = { id: crypto.randomUUID(), player, start: performance.now(), queue: [], sending: false };
      record('session_start');
      timer = setInterval(flush, 10_000);
    }
    session.queue.push({ type, ts: Math.round(performance.now() - session.start), data: { build: '2026-11-28-early-charge', ...data } });
    if (session.queue.length > 250) session.queue.shift();
  }

  function flush(closing = false) {
    const active = session;
    if (!active?.queue.length || (active.sending && !closing)) return;
    const events = active.queue.splice(0, batchSize);
    const body = JSON.stringify({ game: host, session: active.id, player: active.player, events });
    if (closing && navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'text/plain' }))) return;
    active.sending = true;
    fetch(endpoint, { method: 'POST', body, keepalive: true, credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' } }).then(response => {
      if (response.status === 429 || response.status >= 500) throw new Error('Logging temporarily unavailable');
    }).catch(() => {
      if (active === session) active.queue = [...events, ...active.queue].slice(-250);
    }).finally(() => { active.sending = false; });
  }

  function setEnabled(value) {
    consent = available && value;
    if (!consent) {
      clearInterval(timer);
      session = undefined;
    }
    try { localStorage.setItem(consentKey, consent ? 'yes' : 'no'); }
    catch { /* Keep the setting for this tab. */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', event => {
    if (session && !event.persisted) {
      onPageEnd();
      record('session_end', { durationMs: Math.round(performance.now() - session.start) });
    }
    flush(true);
  });

  return { required, available, get enabled() { return consent; }, record, setEnabled };
}

const numberFields = (source, keys) => Object.fromEntries(keys.flatMap(key => {
  const value = source?.[key];
  return Number.isFinite(value) && Math.abs(value) < 10_000 ? [[key, Math.round(value * 10_000) / 10_000]] : [];
}));
const stroke = value => value === 'forehand' || value === 'backhand' ? value : null;

export function pointMetrics(entry, shot, miss, corrections) {
  const reasons = ['Net', 'Out', 'Second bounce', 'Returned in', 'Swing too early',
    'Too far from ball', 'Hold Drive earlier', 'Release Drive near contact',
    'Wrong side · forehand needed', 'Wrong side · backhand needed'];
  return {
    reason: reasons.includes(entry.reason) ? entry.reason : 'other',
    ...numberFields(entry, ['returns', 'attempt', 'closest', 'closestFrame', 'chargeFrame']),
    lateralCorrections: corrections,
    shot: shot?.shot === 'drive' || shot?.shot === 'lob' ? {
      type: shot.shot, serve: shot.serve === true, stroke: stroke(shot.stroke),
      ...numberFields(shot, ['power', 'aim', 'spin', 'lift', 'offset', 'landingX', 'incomingSpeed', 'returnSpeed', 'releaseLeadFrames', 'paceBoost'])
    } : null,
    miss: miss ? { stroke: stroke(miss.stroke), needed: stroke(miss.needed), early: miss.reason === 'early',
      ...numberFields(miss, ['releaseLeadFrames']) } : null
  };
}
