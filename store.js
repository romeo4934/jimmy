const price = '0.10';
export const roster = [
  { id: 'alex', name: 'Alex', shirt: '#cedd62', trim: '#eff5a2', skin: '#d99568', hair: '#382b2c', shorts: '#263f4f', style: 'short' },
  { id: 'mika', name: 'Mika', shirt: '#e87965', trim: '#ffb494', skin: '#bc7854', hair: '#282737', shorts: '#394060', style: 'ponytail' },
  { id: 'player:jade', name: 'Jade', shirt: '#47b6a6', trim: '#adf2d7', skin: '#976046', hair: '#271f22', shorts: '#283754', style: 'curls', paid: true },
  { id: 'player:sol', name: 'Sol', shirt: '#e9ad4d', trim: '#ffe49b', skin: '#edb688', hair: '#925737', shorts: '#3c365e', style: 'visor', paid: true }
];

export function allowedPlayer(id, items = [], fallback = roster[0]) {
  const player = roster.find(entry => entry.id === id);
  return player && (!player.paid || items.includes(id)) ? player : fallback;
}

export function setupStore({ client, signIn, preferences, openPanel, drawPreview, setPlayer }) {
  const byId = id => document.getElementById(id);
  const dialog = byId('store');
  const connect = byId('store-connect');
  const refreshButton = byId('store-refresh');
  const status = byId('store-status');
  let busy = false, connected = false, receiptsChecked = false;
  let owned = [];
  let pendingItem;
  const cards = roster.map(player => {
    const card = document.createElement('article');
    const canvas = document.createElement('canvas');
    canvas.width = 112;
    canvas.height = 96;
    canvas.setAttribute('aria-hidden', 'true');
    drawPreview(canvas, player);
    const name = document.createElement('h3');
    name.textContent = player.name;
    const label = document.createElement('p');
    label.textContent = player.paid ? `${price} USDC` : 'Free';
    const button = document.createElement('button');
    button.type = 'button';
    button.onclick = () => activate(player);
    card.append(canvas, name, label, button);
    byId('store-roster').append(card);
    return { player, button };
  });

  function update() {
    const selected = allowedPlayer(preferences.get('player'), owned);
    setPlayer(selected);
    for (const { player, button } of cards) {
      const unlocked = !player.paid || owned.includes(player.id);
      button.textContent = player === selected ? 'Selected' : unlocked ? 'Select' : 'Buy';
      button.setAttribute('aria-label', player === selected ? `${player.name} selected` :
        unlocked ? `Select ${player.name}` : `Buy ${player.name} for ${price} USDC`);
      button.disabled = busy || player === selected || (!unlocked && connected && (!receiptsChecked || Boolean(pendingItem)));
    }
    connect.hidden = connected;
    connect.disabled = busy;
    refreshButton.hidden = !connected || (receiptsChecked && !pendingItem);
    refreshButton.disabled = busy;
  }

  async function checkPurchases(interactive = false) {
    connected = await signIn(interactive);
    if (!connected) {
      owned = [];
      receiptsChecked = false;
      return;
    }
    const receipts = await client().purchases();
    owned = receipts.map(receipt => receipt.item);
    receiptsChecked = true;
    if (pendingItem && owned.includes(pendingItem)) pendingItem = undefined;
  }

  async function refresh(interactive = false) {
    if (busy) return;
    busy = true;
    receiptsChecked = false;
    update();
    status.textContent = interactive ? 'Approve sign-in in Espresso Cash.' : 'Checking your purchases…';
    try {
      await checkPurchases(interactive);
      status.textContent = pendingItem ? 'Waiting for Espresso to confirm your purchase.' : '';
    } catch {
      status.textContent = 'Couldn’t check your Espresso purchases. Try again.';
    } finally {
      busy = false;
      update();
    }
  }

  async function activate(player) {
    if (busy) return;
    if (!player.paid || owned.includes(player.id)) {
      preferences.set('player', player.id);
      status.textContent = '';
      dialog.close();
      return;
    }
    if (!connected) {
      await refresh(true);
      return;
    }
    if (!receiptsChecked || pendingItem) return;
    busy = true;
    update();
    status.textContent = 'Checking your purchases…';
    try {
      await checkPurchases();
      if (!connected) {
        status.textContent = 'Connect to Espresso Cash to buy a player.';
        return;
      }
      if (!owned.includes(player.id)) {
        status.textContent = `Preparing your ${price} USDC purchase…`;
        await client().charge(price, {
          memo: player.id,
          session: false,
          onApproval() {
            pendingItem = player.id;
            status.textContent = `Approve ${price} USDC in Espresso Cash, then return here.`;
          }
        });
        pendingItem = player.id;
        await checkPurchases();
      }
      if (owned.includes(player.id)) {
        preferences.set('player', player.id);
        status.textContent = `${player.name} is unlocked and selected.`;
      } else {
        status.textContent = 'Payment approved. Check your purchases again in a moment.';
      }
    } catch (error) {
      if (['site_has_no_payout_wallet', 'payout_wallet_not_set'].includes(error?.code)) {
        status.textContent = 'The store is waiting for the owner to set a payout wallet.';
      } else if (error?.code === 'declined') {
        pendingItem = undefined;
        status.textContent = 'Payment was declined or expired. You can try again.';
      } else {
        receiptsChecked = false;
        status.textContent = 'Espresso couldn’t confirm the purchase. Check your purchases before trying again.';
      }
    } finally {
      busy = false;
      update();
    }
  }

  byId('open-store').onclick = () => {
    openPanel(dialog);
    void refresh();
  };
  connect.onclick = () => refresh(true);
  refreshButton.onclick = () => refresh();
  preferences.onChange('player', update);
  void refresh();
}
