import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { mainnet } from '@reown/appkit/networks';
import { WagmiProvider, useAccount, useDisconnect } from 'wagmi';
import { createAdapter } from './config';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const root = createRoot(document.getElementById('root')!);

if (!projectId) {
  root.render(<main><h1>Connect with AppKit</h1><p>Set VITE_WC_PROJECT_ID in .env.local, allow this origin, and restart the example.</p></main>);
} else {
  const metadata = { name: 'Robinhood Wallet · AppKit', description: 'An independent connector example', url: window.location.origin, icons: [] };
  const adapter = createAdapter({ projectId, metadata });
  const modal = createAppKit({
    adapters: [adapter], projectId, networks: [mainnet], metadata,
    features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
  });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  function App() {
    const { status, chainId } = useAccount();
    const { disconnect, isPending } = useDisconnect();
    return <main>
      <p className="eyebrow">Independent community connector · AppKit</p>
      <h1>Choose Robinhood in AppKit.</h1>
      <p>Select Robinhood Wallet to open its connection screen. Close that screen to cancel, then retry from the chooser.</p>
      <div className="panel">
        <p className="status" aria-live="polite">Status: {status}{chainId ? ` · chain ${chainId}` : ''}</p>
        <button onClick={() => void modal.open()}>Open wallet chooser</button>
        {status === 'connected' && <button className="secondary" disabled={isPending} onClick={() => disconnect()}>Disconnect</button>}
      </div>
      <p>No signature or transaction is requested by this example. This community package is not endorsed by Robinhood.</p>
    </main>;
  }

  root.render(<React.StrictMode><WagmiProvider config={adapter.wagmiConfig}><QueryClientProvider client={queryClient}><App/></QueryClientProvider></WagmiProvider></React.StrictMode>);
}
