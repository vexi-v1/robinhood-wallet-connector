import React from 'react';
import { createRoot } from 'react-dom/client';
import { DynamicContextProvider, DynamicWidget, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { createSettings } from './config';
import './style.css';

const root = createRoot(document.getElementById('root')!);
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim();
const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID?.trim();
if (!projectId || !environmentId) {
  root.render(<main><h1>Robinhood with Dynamic</h1><p>Set VITE_WC_PROJECT_ID and VITE_DYNAMIC_ENVIRONMENT_ID in .env.local, then restart.</p></main>);
} else {
  const settings = createSettings(environmentId, {
    projectId, chains: [1],
    metadata: { name: 'Robinhood Wallet · Dynamic', description: 'Independent connector example', url: window.location.origin, icons: [] },
  });
  function App() {
    const { primaryWallet, handleLogOut } = useDynamicContext();
    return <main>
      <p className="eyebrow">Independent community connector · Dynamic</p>
      <h1>Choose Robinhood in Dynamic.</h1>
      <p>Connect your wallet to continue. Close the Robinhood connection screen to cancel.</p>
      <div className="panel">
        <p className="status" aria-live="polite">{primaryWallet ? 'Connected' : 'Disconnected'}</p>
        <DynamicWidget innerButtonComponent="Connect wallet"/>
        {primaryWallet && <button className="secondary" onClick={() => void handleLogOut()}>Disconnect</button>}
      </div>
      <p>This example connects a wallet without signing in. No signature or transaction is requested. This community package is not endorsed by Robinhood.</p>
    </main>;
  }
  root.render(<DynamicContextProvider settings={settings}><App/></DynamicContextProvider>);
  import.meta.hot?.dispose(() => root.unmount());
}
