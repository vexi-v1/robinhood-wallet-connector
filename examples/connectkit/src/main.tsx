import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitButton, ConnectKitProvider } from 'connectkit';
import { WagmiProvider, useAccount, useDisconnect } from 'wagmi';
import { createWalletConfig } from './config';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const root = createRoot(document.getElementById('root')!);

if (!projectId) {
  root.render(<main><h1>Connect with ConnectKit</h1><p>Set VITE_WC_PROJECT_ID in .env.local, allow this origin, and restart the example.</p></main>);
} else {
  const config = createWalletConfig({
    projectId,
    metadata: { name: 'Robinhood Wallet · ConnectKit', description: 'An independent connector example', url: window.location.origin, icons: [] },
  });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

  function App() {
    const { status, chainId } = useAccount();
    const { disconnect, isPending } = useDisconnect();
    return <main>
      <p className="eyebrow">Independent community connector · ConnectKit</p>
      <h1>Choose Robinhood in ConnectKit.</h1>
      <p>Select Robinhood Wallet to open its connection screen. Close that screen to cancel, then retry from the chooser.</p>
      <div className="panel">
        <p className="status" aria-live="polite">Status: {status}{chainId ? ` · chain ${chainId}` : ''}</p>
        <ConnectKitButton showBalance={false}/>
        {status === 'connected' && <button className="secondary" disabled={isPending} onClick={() => disconnect()}>Disconnect</button>}
      </div>
      <p>No signature or transaction is requested by this example. This community package is not endorsed by Robinhood.</p>
    </main>;
  }

  root.render(<React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={queryClient}>
    <ConnectKitProvider theme="midnight"><App/></ConnectKitProvider>
  </QueryClientProvider></WagmiProvider></React.StrictMode>);
}
