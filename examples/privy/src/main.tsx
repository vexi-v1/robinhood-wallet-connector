import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PrivyProvider, useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { RobinhoodProvider } from '@vexi/robinhood-wallet';
import { createRobinhoodPrivyLogin } from '@vexi/robinhood-wallet-privy';
import './style.css';

const root = createRoot(document.getElementById('root')!);
const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim();
const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
if (!projectId || !appId) {
  root.render(<main><h1>Robinhood with Privy</h1><p>Set VITE_WC_PROJECT_ID and VITE_PRIVY_APP_ID in .env.local, then restart.</p></main>);
} else {
  const provider = new RobinhoodProvider({
    projectId, chains: [1],
    metadata: { name: 'Robinhood Wallet · Privy', description: 'Independent connector example', url: window.location.origin, icons: [] },
  });
  function App() {
    const { ready, authenticated, logout } = usePrivy();
    const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
    const handlers = useRef({ generateSiweMessage, loginWithSiwe, logout });
    handlers.current = { generateSiweMessage, loginWithSiwe, logout };
    const [login] = useState(() => createRobinhoodPrivyLogin(provider, {
      generateSiweMessage: (parameters) => handlers.current.generateSiweMessage(parameters),
      loginWithSiwe: (parameters) => handlers.current.loginWithSiwe(parameters),
      logout: () => handlers.current.logout(),
    }));
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(true);
    const [signingIn, setSigningIn] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
      let mounted = true;
      const refresh = () => { if (mounted) setConnected(provider.connected); };
      for (const event of ['connect', 'accountsChanged', 'disconnect']) provider.on(event, refresh);
      void provider.isAuthorized().finally(() => { refresh(); if (mounted) setBusy(false); });
      return () => {
        mounted = false;
        login.cancel();
        for (const event of ['connect', 'accountsChanged', 'disconnect']) provider.removeListener(event, refresh);
      };
    }, [login]);
    async function perform(action: () => Promise<unknown>) {
      if (busy) return;
      setBusy(true); setError(false);
      try { await action(); } catch { setError(true); }
      finally { setConnected(provider.connected); setBusy(false); }
    }
    return <main>
      <p className="eyebrow">Independent community connector · Privy</p>
      <h1>Connect, then sign in with Privy.</h1>
      <p>Connecting shares your wallet account. Signing in is a separate action that requests a signature.</p>
      <div className="panel">
        <p className="status" aria-live="polite">{connected ? 'Connected' : busy ? 'Checking connection…' : 'Disconnected'} · {authenticated ? 'Signed in' : 'Not signed in'}</p>
        <button disabled={busy || connected} onClick={() => void perform(() => provider.connect())}>Connect Robinhood Wallet</button>
        {busy && !signingIn && <button className="secondary" onClick={() => provider.cancel()}>Cancel connection</button>}
        {connected && <button disabled={busy} className="secondary" onClick={() => void perform(() => provider.disconnect())}>Disconnect</button>}
        <button disabled={!ready || !connected || busy || authenticated} onClick={() => void perform(async () => {
          setSigningIn(true);
          try { await login.login(); } finally { setSigningIn(false); }
        })}>Sign in with Privy</button>
        {signingIn && <button className="secondary" onClick={() => login.cancel()}>Cancel sign-in</button>}
        {authenticated && <button disabled={busy} className="secondary" onClick={() => void perform(logout)}>Sign out</button>}
        {error && <p role="alert">Request cancelled or unavailable. Try again when ready.</p>}
      </div>
      <p>Disconnecting a wallet and signing out are separate actions. This community package is not endorsed by Robinhood.</p>
    </main>;
  }
  root.render(<PrivyProvider appId={appId} config={{ loginMethods: ['wallet'], externalWallets: { disableAllExternalWallets: true } }}><App/></PrivyProvider>);
  const dispose = () => { root.unmount(); provider.destroy(); };
  window.addEventListener('pagehide', (event) => { if (!event.persisted) dispose(); }, { once: true });
  import.meta.hot?.dispose(dispose);
}
