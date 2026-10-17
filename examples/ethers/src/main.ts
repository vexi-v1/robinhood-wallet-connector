import { createWalletConnection } from './client';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
document.getElementById('root')!.innerHTML = `<main>
  <p class="eyebrow">Independent community connector · ethers v6</p>
  <h1>Connect Robinhood with ethers v6.</h1>
  <p>Connect your wallet, or close its connection screen to cancel and try again.</p>
  <div class="panel">
    <p id="status" class="status" aria-live="polite">Checking saved connection…</p>
    <button id="connect" disabled>Connect Robinhood Wallet</button>
    <button id="cancel" class="secondary" hidden>Cancel connection</button>
    <button id="disconnect" class="secondary" hidden>Disconnect</button>
  </div>
  <p>No signature or transaction is requested by this example. This community package is not endorsed by Robinhood.</p>
</main>`;
const status = document.getElementById('status')!;
const connect = document.getElementById('connect') as HTMLButtonElement;
const cancel = document.getElementById('cancel') as HTMLButtonElement;
const disconnect = document.getElementById('disconnect') as HTMLButtonElement;

if (!projectId) {
  status.textContent = 'Set VITE_WC_PROJECT_ID in .env.local, allow this origin, and restart the example.';
} else {
  const connection = createWalletConnection({
    projectId, chains: [1], rpcMap: { 1: 'https://ethereum-rpc.publicnode.com' },
    metadata: { name: 'Robinhood Wallet · ethers v6', description: 'An independent connector example', url: window.location.origin, icons: [] },
  });
  const { provider } = connection;
  let busy = true;
  let disposed = false;
  let revision = 0;

  async function render() {
    const current = ++revision;
    connect.disabled = provider.connected || disposed;
    connect.setAttribute('aria-disabled', String(busy));
    connect.setAttribute('aria-busy', String(busy));
    cancel.hidden = provider.status !== 'connecting';
    disconnect.hidden = !provider.connected;
    disconnect.disabled = busy;
    if (!provider.connected) {
      status.textContent = busy ? 'Waiting for wallet connection…' : 'Disconnected';
      return;
    }
    try {
      const state = await connection.readState();
      if (disposed || current !== revision) return;
      status.textContent = `Connected · ${state.count} approved account(s) · chain ${state.chainId}`;
    } catch {
      if (!disposed && current === revision) status.textContent = 'Could not read wallet state. Disconnect and try again.';
    }
  }
  const refresh = () => { void render(); };
  for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.on(event, refresh);

  connect.onclick = async () => {
    if (busy || disposed || provider.connected) return;
    busy = true;
    let failed = false;
    try {
      const pending = provider.connect({ chainId: 1 });
      refresh();
      await pending;
    } catch { failed = true; }
    finally {
      busy = false;
      if (!disposed) {
        await render();
        if (failed) status.textContent = 'Connection cancelled or unavailable. Try again when ready.';
        if (!provider.connected && document.activeElement === document.body) connect.focus();
      }
    }
  };
  cancel.onclick = () => provider.cancel();
  disconnect.onclick = async () => {
    if (busy || disposed) return;
    busy = true;
    refresh();
    let failed = false;
    try { await provider.disconnect(); }
    catch { failed = true; }
    finally {
      busy = false;
      if (!disposed) {
        await render();
        if (failed) status.textContent = 'Disconnected locally. Wallet session cleanup could not be confirmed.';
      }
    }
  };
  // Restore previously approved state without requesting account permission.
  void provider.isAuthorized().finally(() => {
    busy = false;
    if (!disposed) refresh();
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    ++revision;
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) provider.removeListener(event, refresh);
    connection.dispose();
    connect.onclick = cancel.onclick = disconnect.onclick = null;
    window.removeEventListener('pagehide', onPageHide);
  }
  function onPageHide(event: PageTransitionEvent) {
    if (!event.persisted) dispose();
  }
  window.addEventListener('pagehide', onPageHide);
  import.meta.hot?.dispose(dispose);
}
