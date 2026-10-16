import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http, useConnection, useConnect, useDisconnect } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { RobinhoodProvider } from '@vexi/robinhood-wallet';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const config = createConfig({
  chains: [mainnet],
  connectors: projectId ? [robinhoodWallet({
    projectId,
    metadata: { name: 'Robinhood Wallet · wagmi-v3', description: 'An independent connector example', url: window.location.origin, icons: [] },
  })] : [],
  transports: { [mainnet.id]: http() },
  multiInjectedProviderDiscovery: false,
});
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

function Controls() {
  const { status, chainId, addresses } = useConnection();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const connectButton = useRef<HTMLButtonElement>(null);
  const connecting = useRef(false);
  const connector = connectors[0];
  const beginConnection = () => {
    if (!connector || isPending || connecting.current) return;
    connecting.current = true;
    connect({ connector }, { onSettled: () => {
      connecting.current = false;
      requestAnimationFrame(() => {
        const button = connectButton.current;
        if (connecting.current || !button?.isConnected || button.disabled || document.querySelector('dialog[open]')) return;
        const focus = document.activeElement;
        if (focus && focus !== document.body && focus !== document.documentElement && focus !== button) return;
        button.focus({ preventScroll: true });
      });
    } });
  };
  const cancel = async () => {
    const provider = await connector?.getProvider();
    if (provider instanceof RobinhoodProvider) provider.cancel();
  };
  return <div className="panel">
    <p className="status" aria-live="polite">Status: {status}{chainId ? ` · chain ${chainId}` : ''}{addresses?.length ? ` · ${addresses.length} approved account(s)` : ''}</p>
    {/* Keep the trigger focusable while pending so the SDK can capture it before opening. */}
    <button ref={connectButton} disabled={!connector || status === 'connected'} aria-disabled={isPending || undefined} aria-busy={isPending || undefined} onClick={beginConnection}>Connect Robinhood Wallet</button>
    {isPending && <button className="secondary" onClick={() => void cancel()}>Cancel connection</button>}
    {status === 'connected' && <button className="secondary" onClick={() => disconnect()}>Disconnect</button>}
    {error && <p role="alert">{error.message}</p>}
  </div>;
}
function App() {
  return <main><p className="eyebrow">Independent community connector · wagmi-v3</p><h1>One wallet. A direct connection.</h1><p>Connect Robinhood Wallet through its own pairing screen. Your wallet decides which accounts and networks to approve.</p>
    {projectId ? <Controls/> : <div className="panel"><h2>Set your WalletConnect project ID</h2><p>Add <code>VITE_WC_PROJECT_ID</code> to <code>.env.local</code>, allow this origin in the project dashboard, and restart the example.</p></div>}
    <p>No signature or transaction is requested by this example. Robinhood does not endorse this independent package.</p><a href="https://robinhood.com/wallet/" target="_blank" rel="noreferrer">Get Robinhood Wallet</a></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={queryClient}><App/></QueryClientProvider></WagmiProvider></React.StrictMode>);
