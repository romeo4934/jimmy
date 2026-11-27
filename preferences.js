const fields = {
  player: { local: 'baseline-player', cloud: 'baseline.player' },
  sound: { local: 'baseline-court-sound', cloud: 'baseline.sound' }
};
const ownerKey = 'baseline-settings-account';

export function setupPreferences({ validPlayer, record }) {
  const keys = Object.keys(fields);
  const listeners = new Map();
  const valid = (key, value) => key === 'player' ? validPlayer(value) : typeof value === 'boolean';
  const values = {};
  let active;

  function read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function write(key, value) {
    try {
      if (value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* Keep the in-memory value for this tab. */ }
  }
  let owner = read(ownerKey);
  for (const key of keys) {
    const stored = read(fields[key].local);
    const value = key === 'sound' ? { true: true, false: false }[stored] : stored;
    if (valid(key, value)) values[key] = value;
  }

  function apply(key, value) {
    if (values[key] === value) return;
    values[key] = value;
    write(fields[key].local, value === undefined ? undefined : String(value));
    listeners.get(key)?.forEach(listener => listener(value));
  }

  function persistPending(session) {
    const value = session.pending.size ? JSON.stringify(Object.fromEntries(session.pending)) : undefined;
    write(session.storageKey, value);
  }

  function sync(session) {
    if (session.syncing || (session.loaded && !session.pending.size)) return;
    session.syncing = true;
    void synchronize(session).catch(error => {
      record('Espresso settings sync paused.', error);
    }).finally(() => { session.syncing = false; });
  }

  async function synchronize(session) {
    if (!session.loaded) {
      const saved = await session.sdk.saves();
      if (active !== session) return;
      for (const key of keys) {
        if (session.pending.has(key)) continue;
        const value = saved?.[fields[key].cloud];
        if (valid(key, value)) apply(key, value);
        else if (valid(key, values[key])) session.pending.set(key, values[key]);
      }
      session.loaded = true;
      persistPending(session);
    }
    while (active === session && session.pending.size) {
      const [key, value] = session.pending.entries().next().value;
      await session.sdk.save(fields[key].cloud, value);
      if (active !== session) return;
      if (session.pending.get(key) === value) session.pending.delete(key);
      persistPending(session);
    }
  }

  return {
    get(key) { return values[key]; },
    onChange(key, listener) {
      if (!listeners.has(key)) listeners.set(key, []);
      listeners.get(key).push(listener);
      listener(values[key]);
    },
    set(key, value) {
      if (!valid(key, value)) return;
      apply(key, value);
      if (!active) return;
      active.pending.set(key, value);
      persistPending(active);
      sync(active);
    },
    connect(sdk, account, refresh) {
      if (!account || typeof sdk?.saves !== 'function' || typeof sdk.save !== 'function') {
        active = undefined;
        return;
      }
      if (active?.account !== account) {
        if (owner && owner !== account) keys.forEach(key => apply(key, undefined));
        owner = account;
        write(ownerKey, owner);
        const storageKey = `baseline-pending-settings:${account}`;
        let saved;
        try { saved = JSON.parse(read(storageKey)); } catch { /* Ignore malformed queued settings. */ }
        const pending = new Map();
        active = { sdk, account, storageKey, pending, loaded: false, syncing: false };
        for (const key of keys) {
          if (valid(key, saved?.[key])) {
            pending.set(key, saved[key]);
            apply(key, saved[key]);
          }
        }
      } else if (refresh && !active.syncing) {
        active.loaded = false;
      }
      sync(active);
    }
  };
}
