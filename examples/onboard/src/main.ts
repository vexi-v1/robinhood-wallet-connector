import Onboard from '@web3-onboard/core';
import { robinhoodModule } from '@vexi/robinhood-wallet-onboard';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const root = document.getElementById('root')!;
root.innerHTML = `<main>
  <p class="eyebrow">Independent community connector · Web3-Onboard</p>
  <h1>A familiar wallet module. A direct connection.</h1>
  <p>Select Robinhood Wallet and approve the connection in your wallet.</p>
  <div class="panel"><p id="status" class="status" aria-live="polite">Disconnected</p>
    <button id="connect">Connect Robinhood Wallet</button>
    <button id="disconnect" class="secondary" hidden>Disconnect</button>
  </div>
  <p>No transaction or signature is requested by this example. This independent package is not endorsed by Robinhood.</p>
  <a href="https://robinhood.com/wallet/" target="_blank" rel="noreferrer">Get Robinhood Wallet</a>
</main>`;
const status = document.getElementById('status')!;
const connect = document.getElementById('connect') as HTMLButtonElement;
const disconnect = document.getElementById('disconnect') as HTMLButtonElement;

if (!projectId) {
  status.textContent = 'Set VITE_WC_PROJECT_ID in .env.local, allow this origin in the project dashboard, and restart the example.';
  connect.disabled = true;
} else {
  const onboard = Onboard({
    wallets: [robinhoodModule({ projectId })],
    chains: [{ id: '0x1', token: 'ETH', label: 'Ethereum', rpcUrl: 'https://ethereum-rpc.publicnode.com' }],
    appMetadata: {
      name: 'Robinhood Wallet · Web3-Onboard',
      description: 'An independent connector example',
      explore: window.location.origin,
    },
    accountCenter: { desktop: { enabled: false }, mobile: { enabled: false } },
  });
  const subscription = onboard.state.select('wallets').subscribe((wallets) => {
    status.textContent = wallets.length ? `Connected · ${wallets[0].accounts.length} approved account(s)` : 'Disconnected';
    disconnect.hidden = wallets.length === 0;
    connect.disabled = wallets.length !== 0;
  });
  connect.addEventListener('click', async () => {
    connect.disabled = true;
    status.textContent = 'Waiting for wallet connection…';
    try {
      await onboard.connectWallet();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Connection did not complete.';
    } finally {
      connect.disabled = onboard.state.get().wallets.length !== 0;
    }
  });
  disconnect.addEventListener('click', async () => {
    const wallet = onboard.state.get().wallets[0];
    if (wallet) await onboard.disconnectWallet({ label: wallet.label });
  });
  window.addEventListener('pagehide', () => subscription.unsubscribe(), { once: true });
}
