const storageKey = 'baseline-club-playtest-v1';

export function playLog() {
  let entries = [];
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) entries = saved.slice(-60);
  } catch { /* The report remains available in this tab if storage is unavailable. */ }
  return {
    get count() { return entries.length; },
    add(entry) {
      entries = [...entries.slice(-59), { time: new Date().toISOString(), ...entry }];
      try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
        return true;
      } catch {
        return false;
      }
    },
    report() {
      return JSON.stringify({ version: 1, entries }, null, 2);
    }
  };
}

export function courtSound() {
  let context;
  let noise;
  function play(event) {
    if (context?.state !== 'running' || !['hit', 'bounce', 'drill'].includes(event.type)) return;
    if (event.type === 'drill' && !event.success) return;
    const hit = event.type === 'hit';
    const strength = hit ? Math.max(0, Math.min(1.35, event.power ?? 0)) : 0;
    const time = context.currentTime;
    const duration = hit ? .052 + .035 * strength : .055;
    const voice = context.createOscillator();
    const volume = context.createGain();
    voice.type = hit ? 'triangle' : 'sine';
    voice.frequency.setValueAtTime(hit ? 400 - 125 * strength : 135, time);
    voice.frequency.exponentialRampToValueAtTime(hit ? 130 : 72, time + duration);
    volume.gain.setValueAtTime(hit ? .09 + strength * .12 : .075, time);
    volume.gain.exponentialRampToValueAtTime(.001, time + duration);
    voice.connect(volume).connect(context.destination);
    voice.start(time);
    voice.stop(time + duration);
    if (!hit) return;
    const impact = context.createBufferSource();
    const impactVolume = context.createGain();
    impact.buffer = noise;
    impactVolume.gain.setValueAtTime(.12 + strength * .12, time);
    impactVolume.gain.exponentialRampToValueAtTime(.001, time + .03);
    impact.connect(impactVolume).connect(context.destination);
    impact.start(time);
    impact.stop(time + .03);
  }
  return {
    unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try {
        if (!context) {
          context = new Audio();
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * .04), context.sampleRate);
          const samples = noise.getChannelData(0);
          for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        }
        if (context.state === 'suspended') context.resume().catch(() => {});
      } catch { /* Audio can be unavailable in an embedded browser. */ }
    },
    play
  };
}
