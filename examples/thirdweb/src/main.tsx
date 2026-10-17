import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createThirdwebClient } from 'thirdweb';
import { ThirdwebProvider, useActiveAccount, useActiveWalletChain, useConnect, useDisconnect, useSetActiveWallet } from 'thirdweb/react';
import { robinhoodWallet } from '@vexi/robinhood-wallet-thirdweb';
import './style.css';

const root = createRoot(document.getElementById('root')!);
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim();
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID?.trim();
if (!projectId || !clientId) {
  root.render(<main><h1>Robinhood with thirdweb</h1><p>Set VITE_WC_PROJECT_ID and VITE_THIRDWEB_CLIENT_ID in .env.local, then restart.</p></main>);
} else {
  const client = createThirdwebClient({ clientId });
  const wallet = robinhoodWallet({
    projectId, chains: [1],
    metadata: { name: 'Robinhood Wallet · thirdweb', description: 'Independent connector example', url: window.location.origin, icons: [] },
  });
  function App() {
    const account = useActiveAccount();
    const chain = useActiveWalletChain();
    const { connect, isConnecting, error } = useConnect();
    const { disconnect } = useDisconnect();
    const setActiveWallet = useSetActiveWallet();
    const [restoring, setRestoring] = useState(true);
    useEffect(() => {
      let mounted = true;
      void wallet.autoConnect({ client }).then(async () => {
        if (mounted) await setActiveWallet(wallet);
      }).catch(() => {}).finally(() => { if (mounted) setRestoring(false); });
      return () => { mounted = false; };
    }, [setActiveWallet]);
    return <main>
      <p className="eyebrow">Independent community connector · thirdweb</p>
      <h1>Connect Robinhood with thirdweb.</h1>
      <p>Your approved wallet is available through thirdweb's active wallet hooks.</p>
      <div className="panel">
        <p className="status" aria-live="polite">{account ? `Connected · chain ${chain?.id ?? ''}` : restoring ? 'Checking saved connection…' : isConnecting ? 'Connecting…' : 'Disconnected'}</p>
        <button disabled={restoring || isConnecting || !!account} onClick={() => void connect(async () => {
          await wallet.connect({ client });
          return wallet;
        })}>Connect Robinhood Wallet</button>
        {isConnecting && <button className="secondary" onClick={() => wallet.cancelConnect()}>Cancel connection</button>}
        {account && <button className="secondary" onClick={() => disconnect(wallet)}>Disconnect</button>}
        {error && <p role="alert">Connection cancelled or unavailable. Try again when ready.</p>}
      </div>
      <p>No signature or transaction is requested. This community package is not endorsed by Robinhood.</p>
    </main>;
  }
  root.render(<ThirdwebProvider><App/></ThirdwebProvider>);
  const dispose = () => { root.unmount(); wallet.destroy(); };
  window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { once: true });
  import.meta.hot?.dispose(dispose);
}
