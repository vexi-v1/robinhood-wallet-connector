# Robinhood Wallet for wagmi

> **AI integration docs:** [llms.txt](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/docs/ai-integration.md)

Connect Robinhood Wallet to wagmi v2/v3 using the toolkit's provider and dedicated connection dialog.

Built and maintained by **[Vexi Lab](https://vexi-protocol.ai) (an onchain options protocol)**. This is an independent community project, **not an official Robinhood SDK**, and is not affiliated with or endorsed by Robinhood.

These packages are not published to npm. Follow the [tarball installation guide](https://github.com/vexi-v1/robinhood-wallet-connector#install-from-this-repository) before using this adapter.

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

`getProvider()` returns the stable `RobinhoodProvider`. `cancelConnect()` rejects an unfinished adapter connection, including its preferred-chain switch. If wallet approval has already completed, the core session and any wallet-side request remain active; use `disconnect()` to clear the session. `disconnect()` clears the connector's session and listeners; it does not revoke permissions in another wallet or modify another connector's session. Chain switching requires a configured chain and the applicable wallet or session approval; switching between already-approved WalletConnect chains is local. The chain list is application configuration, not evidence that Robinhood supports every configured network.

As with wagmi's built-in `injected` and `walletConnect` connectors, a `chainId` passed to `connect` is a preference. After the wallet approves, the connector asks to switch; if the switch fails while the wallet remains connected, the connection stays on the wallet's current chain. User rejection, cancellation, disconnection or destruction still rejects the connection attempt; it cannot return a successful connection with an empty account list. Before connecting, `getChainId()` reports an in-app Robinhood wallet's current chain (read with `eth_chainId`, which needs no account permission), so hosts such as RainbowKit do not request a needless switch. Without one, it reports the first configured chain. A repeated `connect` while one is pending shares that request; one for a different chain fails with `ResourceUnavailableRpcError`.

Compatibility baselines: wagmi **2.19.5** / `@wagmi/core` **2.22.1**, or wagmi **3.7.7** / `@wagmi/core` **3.6.5**, with Viem **2.57.7**. The repository matrix validates packed packages against both. Runnable examples are in `examples/wagmi-v2` and `examples/wagmi-v3`.

Use `showModal: false` only if your host handles `display_uri` and exposes cancellation. `isAuthorized()` and reconnection never request account permission. SSR import is supported; wallet interaction requires a browser.

## AppKit and ConnectKit

The same provider and lifecycle power the pinned [AppKit React + wagmi v3 example](https://github.com/vexi-v1/robinhood-wallet-connector/blob/main/examples/appkit/README.md) and [ConnectKit + wagmi v2 / React 18 example](https://github.com/vexi-v1/robinhood-wallet-connector/blob/main/examples/connectkit/README.md). Pass `robinhoodWallet(options)` to AppKit's `WagmiAdapter` connectors. Use the named export **`robinhoodWalletForConnectKit(options)`** in the wagmi config consumed by `ConnectKitProvider`. It takes the same `RobinhoodWalletParameters` and preserves `getProvider()` and `cancelConnect()`. These integrations add examples and packed-consumer verification, with no new SDK package or connection implementation. ConnectKit 1.9.2 requires `type: 'injected'` to route this SDK connector through its EIP-1193 screen; the helper changes only that routing field. This does not detect an installed wallet or select an arbitrary injected provider. The normal `robinhoodWallet` type is not actionable in that chooser. Keep the SDK dialog enabled, retain other wallet entries, and follow each guide's exact dependency baseline.
