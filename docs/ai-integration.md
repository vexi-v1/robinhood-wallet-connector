# Robinhood Wallet integration guide for AI coding agents

Use this guide to add Robinhood Wallet to an existing frontend application. This repository provides a standalone EIP-1193 provider and adapters for wagmi v2/v3, RainbowKit and Web3-Onboard.

Built by **[Vexi Lab](https://vexi-protocol.ai) (an onchain options protocol)**. This is an independent community project, not an official Robinhood SDK, and is not affiliated with or endorsed by Robinhood.

## Choose an integration

Inspect the application's existing wallet framework and dependency versions before choosing a package. Match the exact [supported framework baselines](../README.md#framework-versions); do not infer support for other versions or frameworks from shared dependencies.

| Existing application | Public entry point | Guide and runnable source |
| --- | --- | --- |
| wagmi v2 | `import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi'` | [Adapter guide](../packages/wagmi/README.md), [example setup](../examples/wagmi-v2/README.md), [React app](../examples/wagmi-v2/src/main.tsx) |
| wagmi v3 | Same wagmi entry point | [Adapter guide](../packages/wagmi/README.md), [example setup](../examples/wagmi-v3/README.md), [React app](../examples/wagmi-v3/src/main.tsx) |
| RainbowKit with wagmi v2 | `import { robinhoodWallet } from '@vexi/robinhood-wallet-rainbowkit'` | [Adapter guide](../packages/rainbowkit/README.md), [example setup](../examples/rainbowkit/README.md), [React app](../examples/rainbowkit/src/main.tsx) |
| Web3-Onboard | `import { robinhoodModule } from '@vexi/robinhood-wallet-onboard'` | [Module guide](../packages/web3-onboard/README.md), [example setup](../examples/onboard/README.md), [app source](../examples/onboard/src/main.ts) |
| Vanilla browser or a host that accepts an EIP-1193 provider | `import { RobinhoodProvider } from '@vexi/robinhood-wallet'` | [Core API](../packages/core/README.md), [example setup](../examples/vanilla/README.md), [app source](../examples/vanilla/main.ts) |

The two `robinhoodWallet` exports serve different APIs: call the wagmi factory with options and put its result in `createConfig({ connectors })`; pass the RainbowKit factory without calling it in a `connectorsForWallets` wallet group. Call `robinhoodModule(options)` for `Onboard({ wallets })`. Keep the application's other wallet entries and provider wrappers intact.

This repository does not yet provide tested adapters for Reown AppKit, ConnectKit, thirdweb or Dynamic, or a verified Privy integration. Its EIP-1193 interface is an integration starting point, not evidence of compatibility with those SDKs. RainbowKit uses the documented wagmi v2 baseline; the separate wagmi v3 example does not extend that claim.

## Install the actual packages

The packages are **unpublished**. Do not suggest installing these `@vexi` package names directly from the npm registry. With Node.js 22.12 or newer, prepare tarballs from a checkout:

```sh
git clone https://github.com/vexi-v1/robinhood-wallet-connector.git
cd robinhood-wallet-connector
npm ci
npm run build
mkdir -p artifacts
npm pack --workspaces --pack-destination artifacts
```

In the consuming application, install the required tarballs together in one `npm install` command so npm can resolve their unpublished dependencies:

| Integration | Local SDK packages required |
| --- | --- |
| Core | `@vexi/robinhood-wallet` |
| wagmi | Core + `@vexi/robinhood-wallet-wagmi` |
| RainbowKit | Core + wagmi adapter + `@vexi/robinhood-wallet-rainbowkit` |
| Web3-Onboard | Core + `@vexi/robinhood-wallet-onboard` |

Use the exact tarball filenames and installation example in the [installation guide](../README.md#install-from-this-repository), and install the chosen framework's declared peer dependencies. The examples' `package.json` files provide working dependency sets. The packages expose ESM and TypeScript declarations; use public `import` entry points, not CommonJS `require` or files from `src`, `dist` or the internal modal implementation.

## Configure the host application

1. Supply your own WalletConnect `projectId` and allow the application's actual origin in that project's settings. In the Vite examples, copy `.env.example` to `.env.local`, set `VITE_WC_PROJECT_ID`, and restart the development server. The ID is public application configuration; no wallet private key or recovery phrase belongs here.
2. Provide application metadata with a name, description, absolute HTTP(S) URL and icon array. For RainbowKit, pass `appName` and `appUrl` to `connectorsForWallets`. For Onboard, supply `appMetadata` or explicit module `metadata`.
3. Configure the EVM chain IDs and usable RPC endpoints. Core takes numeric `chains` and `rpcMap`; wagmi derives them from its configured chains with an optional `rpcMap` override; Onboard derives them from its chain entries, which use hexadecimal IDs such as `0x1`. Use the existing application chain setup when appropriate.
4. Create a stable provider or connector configuration rather than creating another instance on every render. If independent core/wagmi/Onboard instances need separate persisted sessions, give them distinct, stable `storagePrefix` values.
5. Start connection only from the user's Connect action, using the framework's normal connection API or `provider.connect()`. Display pending, cancellation and error states; prevent repeated host clicks while pending. Connecting does not automatically sign or send transactions.

Imports and core construction are safe without `window`, but interactive wallet use requires a browser. Supply metadata URLs explicitly for server rendering; the runnable Vite examples use `window.location.origin` and need adaptation before copying into server-executed code. Keep the consuming framework's own client/server boundaries intact.

The default UI requires native `HTMLDialogElement.showModal()`. Its inline styles and embedded image data URL must be permitted by the application's Content Security Policy. See the [core UI requirements](../packages/core/README.md#discovery-and-session-scope) if the host needs a custom UI.

## Preserve the connection lifecycle

| Host action or condition | Required behavior |
| --- | --- |
| Connect | Use the chosen adapter or `provider.connect({ chainId })`. A matching Robinhood injected provider is preferred; otherwise the SDK pairs through WalletConnect with its dedicated Robinhood dialog. |
| Cancel pending connection | Close the SDK dialog or press Escape. Custom controls can call `provider.cancel()` or the wagmi connector's `cancelConnect()`. Core cancellation rejects with code `4001`; wagmi maps it to its normal user-rejection error. Cancellation does not revoke an established connection or dismiss an injected wallet's own permission prompt. |
| Retry after rejection, cancellation or error | Settle the old host request, close any error dialog, and start a fresh request from a new user action. Do not automatically reopen permission prompts. Core shares matching concurrent attempts; the wagmi adapter rejects a second pending attempt. |
| Recover after reload | Use the framework's reconnect flow or `provider.isAuthorized()`. This checks previously approved state without requesting account permission and may initialize remote transport. `eth_accounts` alone only reads the current instance's cache. |
| Account or chain changes | Use the framework's reactive state. With core, subscribe to `accountsChanged`, `chainChanged` and `disconnect`; update application state and remove listeners on disposal. An empty account list means access is gone. |
| Disconnect | Use the framework's disconnect API or `provider.disconnect()`. This clears local state and disconnects this transport's approved remote session. It does not revoke injected-wallet permissions. |
| Dispose a core instance | `provider.destroy()` releases its UI and listeners while preserving an approved persisted session for recovery by a later instance. It is not a logout action; the destroyed instance cannot reconnect. |

Core `connect()` returns a numeric `chainId`; EIP-1193 `chainChanged` and `eth_chainId` use hexadecimal strings. Before connection, `getChainId()` reflects the configured initial chain, not wallet approval. See the [core API](../packages/core/README.md#api) for complete methods, events and session semantics.

## Avoid common integration mistakes

- **One pairing UI:** leave the SDK's dialog enabled when using the supplied adapters. Do not add a generic WalletConnect/AppKit pairing modal around it. RainbowKit's chooser and the SDK dialog have separate roles; the chooser is inert during SDK pairing.
- **Custom UI is a complete responsibility:** for integrations exposing `showModal: false`, subscribe to `display_uri` before connecting, provide QR/link rendering and cancellation, and clear sensitive pairing data after cancellation or completion. Import `getRobinhoodUri` from the core to construct the app link, and open it only on an explicit click. Follow the [custom UI contract](../packages/core/README.md#custom-connection-ui).
- **Wallet identity:** discovery uses `com.robinhood.wallet` EIP-6963 metadata or `isRobinhoodMobileWallet`. Do not rename an arbitrary injected provider or a generic WalletConnect connector to Robinhood. These identity hints are not cryptographic vendor authentication.
- **Network approval:** adding a chain ID does not establish wallet support. A remote session must approve the requested chain, accounts and methods. Robinhood Chain mainnet `4663` and testnet `46630` each need their own device/network evidence.
- **Sensitive data:** keep pairing URIs, session keys and wallet account information out of analytics, logs, screenshots and error reports. A public WalletConnect project ID does not make pairing material public.
- **Dependency risk:** read the [dependency notes](dependency-notes.md), especially for the documented inherited Onboard advisories. Passing integration tests is not a security audit.

## Verify and describe the result

Use the selected example to verify the normal framework flow and run the consuming application's build and type checks. For changes to this repository, follow [CONTRIBUTING.md](../CONTRIBUTING.md); the packed-package matrix supports `wagmi-v2`, `wagmi-v3`, `rainbowkit` and `onboard` cases.

Check user-triggered connection, cancellation, retry, pending-state cleanup, disconnect, restored sessions, account/chain events and other wallet entries. UI work also needs desktop/narrow-viewport, keyboard and focus checks. The [vanilla fixture](../examples/vanilla/fixture.ts) offers a synthetic transport for repeatable UI checks; its QR cannot pair a real wallet.

Report the exact framework versions and checks performed. Keep synthetic tests, browser relay checks and physical-wallet results separate. Physical iOS/Android pairing, app routing, signatures and transaction submission remain unverified in the [verification record](verification.md); do not present a rendered QR or a successful build as proof of them. Real wallet approval and signing belong to a separately authorized manual test.
