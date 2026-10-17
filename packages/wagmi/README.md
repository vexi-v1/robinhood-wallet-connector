# Robinhood Wallet for wagmi

An independent community connector. Robinhood does not endorse this package.

```ts
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';

export const config = createConfig({
  chains: [mainnet],
  connectors: [robinhoodWallet({
    projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
    metadata: {
      name: 'My app',
      description: 'My app description',
      url: 'https://my-app.example',
      icons: [],
    },
  })],
  transports: { [mainnet.id]: http() },
});
```

Use wagmi's normal `useConnect`, `useDisconnect`, and wallet client APIs. Connection requests start only after an explicit connect action. A discovered Robinhood provider is selected by its published identity hints; other injected providers are never relabeled. Without one, the SDK opens a dedicated Robinhood dialog using WalletConnect as transport.

`getProvider()` returns the stable `RobinhoodProvider`. `cancelConnect()` cancels only a pending attempt. `disconnect()` clears the connector's session and listeners; it does not revoke permissions in another wallet or modify another connector's session. Chain switching requires a configured chain and actual wallet confirmation. The chain list is application configuration, not evidence that Robinhood supports every configured network.

Compatibility baselines: wagmi **2.19.5** / `@wagmi/core` **2.22.1**, or wagmi **3.7.7** / `@wagmi/core` **3.6.5**, with Viem **2.57.7**. The repository matrix validates packed packages against both. Runnable examples are in `examples/wagmi-v2` and `examples/wagmi-v3`.

Use `showModal: false` only if your host handles `display_uri` and exposes cancellation. `isAuthorized()` and reconnection never request account permission. SSR import is supported; wallet interaction requires a browser.
