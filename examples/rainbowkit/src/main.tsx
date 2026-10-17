import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, ConnectButton, connectorsForWallets, darkTheme } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { robinhoodWallet } from '@vexi/robinhood-wallet-rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import './style.css';

const projectId = import.meta.env.VITE_WC_PROJECT_ID?.trim() ?? '';
const connectors = projectId ? connectorsForWallets([
  { groupName: 'Recommended', wallets: [robinhoodWallet] },
  { groupName: 'Other wallets', wallets: [injectedWallet, walletConnectWallet] },
], { projectId, appName: 'Robinhood Wallet · RainbowKit', appUrl: window.location.origin }) : [];
const config = createConfig({ chains: [mainnet], connectors, transports: { [mainnet.id]: http() } });
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

function App() {
  return <main>
    <p className="eyebrow">Independent community connector · RainbowKit 2</p>
    <h1>Robinhood, first in your wallet list.</h1>
    <p>Choose Robinhood Wallet to open its dedicated pairing screen. Close the screen to cancel, then select Robinhood again to retry.</p>
    <div className="panel">
      {projectId ? <ConnectButton/> : <><h2>Set your WalletConnect project ID</h2><p>Add <code>VITE_WC_PROJECT_ID</code> to <code>.env.local</code>, allow this origin, and restart the example.</p></>}
    </div>
    <p>This example uses RainbowKit 2.2.11 and wagmi 2.19.5. No transaction or signature is requested automatically.</p>
    <a href="https://robinhood.com/wallet/" target="_blank" rel="noreferrer">Get Robinhood Wallet</a>
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={queryClient}>
    <RainbowKitProvider theme={darkTheme({ accentColor: '#ceff55', accentColorForeground: '#172008' })}>
      <App/>
    </RainbowKitProvider>
  </QueryClientProvider></WagmiProvider></React.StrictMode>,
);
