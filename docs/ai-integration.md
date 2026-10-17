# Robinhood Wallet integration guide for AI coding agents

Use this guide to add Robinhood Wallet to an existing frontend application. This repository provides a standalone EIP-1193 provider and adapters for wagmi v2/v3, RainbowKit and Web3-Onboard. AppKit and ConnectKit reuse the wagmi connector; ethers v6 and viem wrap the core provider directly. Separate adapters cover thirdweb Wallet, Dynamic React custom connectors and Privy headless SIWE.

Built by **[Vexi Lab](https://vexi-protocol.ai) (an onchain options protocol)**. This is an independent community project, not an official Robinhood SDK, and is not affiliated with or endorsed by Robinhood.

## Choose an integration

Inspect the application's existing wallet framework and dependency versions before choosing a package. Match the exact [supported framework baselines](../README.md#framework-versions); do not infer support for other versions or frameworks from shared dependencies.

| Existing application | Public entry point | Guide and runnable source |
| --- | --- | --- |
| wagmi v2 | `import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi'` | [Adapter guide](../packages/wagmi/README.md), [example setup](../examples/wagmi-v2/README.md), [React app](../examples/wagmi-v2/src/main.tsx) |
| wagmi v3 | Same wagmi entry point | [Adapter guide](../packages/wagmi/README.md), [example setup](../examples/wagmi-v3/README.md), [React app](../examples/wagmi-v3/src/main.tsx) |
| RainbowKit with wagmi v2 | `import { robinhoodWallet } from '@vexi/robinhood-wallet-rainbowkit'` | [Adapter guide](../packages/rainbowkit/README.md), [example setup](../examples/rainbowkit/README.md), [React app](../examples/rainbowkit/src/main.tsx) |
| Web3-Onboard | `import { robinhoodModule } from '@vexi/robinhood-wallet-onboard'` | [Module guide](../packages/web3-onboard/README.md), [example setup](../examples/onboard/README.md), [app source](../examples/onboard/src/main.ts) |
| AppKit React + wagmi v3 | `robinhoodWallet` from `@vexi/robinhood-wallet-wagmi`, passed to `WagmiAdapter` | [AppKit guide](../examples/appkit/README.md), [configuration](../examples/appkit/src/config.ts), [React app](../examples/appkit/src/main.tsx) |
| ConnectKit + wagmi v2 + React 18 | `robinhoodWalletForConnectKit` from `@vexi/robinhood-wallet-wagmi` | [ConnectKit guide](../examples/connectkit/README.md), [configuration](../examples/connectkit/src/config.ts), [React app](../examples/connectkit/src/main.tsx) |
| ethers v6 | Core `RobinhoodProvider` wrapped in ethers `BrowserProvider` | [ethers guide](../examples/ethers/README.md), [client setup](../examples/ethers/src/client.ts), [app](../examples/ethers/src/main.ts) |
| viem | Core `RobinhoodProvider` passed to viem `custom` | [viem guide](../examples/viem/README.md), [client setup](../examples/viem/src/client.ts), [app](../examples/viem/src/main.ts) |
| thirdweb | `robinhoodWallet` from `@vexi/robinhood-wallet-thirdweb` | [Adapter guide](../packages/thirdweb/README.md), [React example](../examples/thirdweb/README.md) |
| Dynamic React 5.12.0 | `robinhoodWalletConnectors` from `@vexi/robinhood-wallet-dynamic` | [Adapter guide](../packages/dynamic/README.md), [React example](../examples/dynamic/README.md) |
| Privy headless SIWE | `createRobinhoodPrivyLogin` from `@vexi/robinhood-wallet-privy` | [Helper guide](../packages/privy/README.md), [React example](../examples/privy/README.md) |
| Vanilla browser or a host that accepts an EIP-1193 provider | `import { RobinhoodProvider } from '@vexi/robinhood-wallet'` | [Core API](../packages/core/README.md), [example setup](../examples/vanilla/README.md), [app source](../examples/vanilla/main.ts) |

The wagmi, RainbowKit and thirdweb packages all export `robinhoodWallet` with different APIs. The thirdweb factory returns a standard Wallet; for wagmi and RainbowKit: call the wagmi factory with options and put its result in `createConfig({ connectors })`; pass the RainbowKit factory without calling it in a `connectorsForWallets` wallet group. Call `robinhoodModule(options)` for `Onboard({ wallets })`. ConnectKit 1.9.2 needs `robinhoodWalletForConnectKit(options)`: it uses the same provider with the chooser's injected-compatible routing hint, which does not mean an installed wallet was detected. The general `robinhoodWallet` type is displayed as unavailable by that chooser. Keep the application's other wallet entries and provider wrappers intact.

The AppKit example covers its React + wagmi v3 path only. Its broad optional connector dependency currently resolves to a release requiring wagmi core v3; the wagmi v2 combination failed a fresh build. ConnectKit uses React 18 and wagmi v2 to match its declared peers. No separate AppKit, ConnectKit, ethers or viem SDK package is needed. AppKit's other framework bindings/adapters remain outside the verified integrations. thirdweb uses a custom connection button and active-wallet hooks. Dynamic targets its React 5.12.0 SDK, not its newer JavaScript SDK. Privy uses `useLoginWithSiwe` after an independent core connection; its built-in chooser and `useWallets()` do not receive this wallet. RainbowKit uses the documented wagmi v2 baseline; the separate wagmi v3 example does not extend that claim.

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
| Core / ethers v6 / viem | `@vexi/robinhood-wallet` |
| wagmi / AppKit / ConnectKit | Core + `@vexi/robinhood-wallet-wagmi` |
| RainbowKit | Core + wagmi adapter + `@vexi/robinhood-wallet-rainbowkit` |
| Web3-Onboard | Core + `@vexi/robinhood-wallet-onboard` |
| thirdweb | Core + `@vexi/robinhood-wallet-thirdweb` |
| Dynamic React | Core + `@vexi/robinhood-wallet-dynamic` |
| Privy headless SIWE | Core + `@vexi/robinhood-wallet-privy` |

Use the exact tarball filenames and installation example in the [installation guide](../README.md#install-from-this-repository), and install the chosen framework's declared peer dependencies. The examples' `package.json` files provide working dependency sets. The packages expose ESM and TypeScript declarations; use public `import` entry points, not CommonJS `require` or files from `src`, `dist` or the internal modal implementation.

## Configure the host application

1. Supply your own WalletConnect `projectId` and allow the application's actual origin in that project's settings. In the Vite examples, copy `.env.example` to `.env.local`, set `VITE_WC_PROJECT_ID`, and restart the development server. The ID is public application configuration; no wallet private key or recovery phrase belongs here.
2. Provide application metadata with a name, description, absolute HTTP(S) URL and icon array. For RainbowKit, pass `appName` and `appUrl` to `connectorsForWallets`. For Onboard, supply `appMetadata` or explicit module `metadata`.
3. Configure the EVM chain IDs and usable RPC endpoints. Core takes numeric `chains` and `rpcMap`; wagmi derives them from its configured chains with an optional `rpcMap` override; Onboard derives them from its chain entries, which use hexadecimal IDs such as `0x1`. Use the existing application chain setup when appropriate.
4. Create a stable provider or connector configuration rather than creating another instance on every render. If independent core/wagmi/Onboard instances need separate persisted sessions, give them distinct, stable `storagePrefix` values.
5. For thirdweb, Dynamic or Privy, also supply the platform's own client/environment/app ID. Use the pinned peers in its guide. Dynamic's enabled networks must match the core configuration; its declarations require bundler module resolution. Privy requires wallet authentication enabled in the dashboard.
6. Start connection only from the user's Connect action, using the framework's normal connection API or `provider.connect()`. Display pending, cancellation and error states; prevent repeated host clicks while pending. Connecting does not automatically sign or send transactions.

Imports and core construction are safe without `window`, but interactive wallet use requires a browser. Supply metadata URLs explicitly for server rendering; the runnable Vite examples use `window.location.origin` and need adaptation before copying into server-executed code. Keep the consuming framework's own client/server boundaries intact.

The default UI requires native `HTMLDialogElement.showModal()` and Shadow DOM. It renders in a shadow root under one `<rhw-connector>` element, so the host page's CSS does not restyle it. Where constructable stylesheets are supported, it needs no inline `<style>` element, so a `style-src 'self'` Content Security Policy works; the embedded icon still needs `img-src data:`. See the [core UI requirements](../packages/core/README.md#discovery-and-session-scope) if the host needs a custom UI.

## Preserve the connection lifecycle

| Host action or condition | Required behavior |
| --- | --- |
| Connect | Use the chosen adapter or `provider.connect({ chainId })`. A previously approved, persisted session is recovered first, without a new approval. Otherwise a matching Robinhood injected provider is preferred, and failing that the SDK pairs through WalletConnect with its dedicated Robinhood dialog. Core `connect({ chainId })` requires that chain; the wagmi and RainbowKit adapters treat a requested chain as a preference, as wagmi's built-in connectors do. A failed preferred switch can fall back only while the same connection remains active; user rejection, cancellation, disconnection or destruction still rejects the connection attempt. |
| Cancel pending connection | Close the SDK dialog or press Escape. Custom controls can call `provider.cancel()` or the wagmi connector's `cancelConnect()`. Core cancellation rejects with code `4001`; wagmi maps it to its normal user-rejection error. A wallet rejection that WalletConnect reports as `USER_REJECTED` also arrives as `4001`. The connection promise settles even if saved-session recovery is waiting on a stalled wallet response. Cancellation does not revoke an established connection, interrupt its requests, or dismiss an injected wallet's own permission prompt. In particular, `cancelConnect()` during the adapter's preferred-chain switch rejects the unfinished adapter attempt but keeps the already-approved core session; use `disconnect()` to clear that session. |
| Retry after rejection, cancellation or error | Settle the old host request, close any error dialog, and start a fresh request from a new user action. Do not automatically reopen permission prompts. Core shares matching concurrent attempts; the wagmi adapter shares a repeated pending connect and rejects one for a different chain with `ResourceUnavailableRpcError`. |
| Recover after reload | Use the framework's reconnect flow, `provider.isAuthorized()`, or an explicit Connect. Recovery checks previously approved state without requesting account permission and may initialize remote transport; it keeps the session's approved chain and account selection, and revokes a session that approves none of the configured chains. `eth_accounts` alone only reads the current instance's cache. |
| Account or chain changes | Use the framework's reactive state. With core, subscribe to `accountsChanged`, `chainChanged` and `disconnect`; update application state and remove listeners on disposal. An empty account list means access is gone. |
| Disconnect | Use the framework's disconnect API or `provider.disconnect()`. This clears local state and disconnects this transport's approved remote session and its pairing. Wallet-side revocation is best effort: the promise resolves after local cleanup even when the wallet cannot be reached. It does not revoke injected-wallet permissions. |
| Dispose a core instance | `provider.destroy()` releases its UI and listeners while preserving an approved persisted session for recovery by a later instance. It is not a logout action; the destroyed instance cannot reconnect. |

Core `connect()` returns a numeric `chainId`; EIP-1193 `chainChanged` and `eth_chainId` use hexadecimal strings. Before connection, the core `getChainId()` reflects the configured initial chain, not wallet approval; the wagmi connector's `getChainId()` reports an in-app Robinhood wallet's current chain when one is present, read with `eth_chainId` and no permission request. See the [core API](../packages/core/README.md#api) for complete methods, events and session semantics.

## Avoid common integration mistakes

- **One pairing UI:** leave the SDK's dialog enabled when using the supplied adapters. RainbowKit, AppKit and ConnectKit provide host choosers; the SDK owns Robinhood's remote pairing dialog. Do not add another QR handler for this connector or use AppKit `customWallets` as a substitute for installing the connector.
- **One wagmi config:** AppKit's React provider must receive `adapter.wagmiConfig`; ConnectKit consumes its surrounding `WagmiProvider` configuration. Preserve other wallet entries. Do not mix the two different wagmi baselines or assume ConnectKit supports React 19.
- **Generic wallet restoration:** the RainbowKit example keeps its Browser Wallet entry on a targetless wagmi connector, so it restores only its own explicit connection. A generic connector targeting the same injected provider can otherwise restore Robinhood's approval as a second connection. Verify that disconnect does not leave such a duplicate active; see the [example](../examples/rainbowkit/README.md).
- **Direct clients:** ethers `getSigner()` and viem `requestAddresses()` can request account permission. Use them only after explicit intent. Read accounts passively with `listAccounts()` / `getAddresses()` and restore through core `isAuthorized()`. Use `custom(provider, { retryCount: 0 })`; clear cached signer/account selections on events and disconnect. Subscribe to EIP-1193 events on the core provider and remove listeners on disposal. An ethers wrapper's `destroy()` does not disconnect the SDK session.
- **Authentication requires separate intent:** Dynamic's example uses connect-only mode. Privy's helper must be called only from an explicit sign-in action; `login()` requests a signature and does not connect the wallet. Cancel stale flows on account/chain changes and teardown. A submitted login cannot be withdrawn; late completion is signed out. Keep wallet disconnect and application logout policies explicit.
- **Custom UI is a complete responsibility:** for integrations exposing `showModal: false`, subscribe to `display_uri` before connecting, provide QR/link rendering and cancellation, and clear sensitive pairing data after cancellation or completion. Import `getRobinhoodUri` from the core to construct the app link, and open it only on an explicit click. Follow the [custom UI contract](../packages/core/README.md#custom-connection-ui).
- **Wallet identity:** discovery uses `com.robinhood.wallet` EIP-6963 metadata or `isRobinhoodMobileWallet`. Do not rename an arbitrary injected provider or a generic WalletConnect connector to Robinhood. These identity hints are not cryptographic vendor authentication.
- **Network approval:** adding a chain ID does not establish wallet support. A remote session must approve the requested chain, accounts and methods. Switching between chains the session approved is local and shows no wallet prompt; a chain the session did not approve is rejected with `4901`. Robinhood Chain mainnet `4663` and testnet `46630` each need their own device/network evidence.
- **Sensitive data:** keep pairing URIs, session keys and wallet account information out of analytics, logs, screenshots and error reports. A public WalletConnect project ID does not make pairing material public.
- **Dependency risk:** read the [dependency notes](dependency-notes.md), especially for the documented inherited Onboard advisories. Passing integration tests is not a security audit.

## Verify and describe the result

Use the selected example to verify the normal framework flow and run the consuming application's build and type checks. For changes to this repository, follow [CONTRIBUTING.md](../CONTRIBUTING.md). `npm run test:all` runs the SDK/core/documentation checks and all twelve packed/browser cases: `vanilla`, `wagmi-v2`, `wagmi-v3`, `rainbowkit`, `onboard`, `appkit`, `connectkit`, `ethers`, `viem`, `thirdweb`, `dynamic` and `privy`. Install Playwright Chromium first, or set `BROWSER_CHANNEL=chrome`. The Vanilla and Onboard examples require explicit reconnection after reload; other examples restore saved approval automatically. Both paths recover saved approval without another permission prompt. Neither behavior may request account permission on page load.

Check user-triggered connection, cancellation, retry, pending-state cleanup, disconnect, restored sessions, account/chain events and other wallet entries. UI work also needs desktop/narrow-viewport, keyboard and focus checks. The [vanilla fixture](../examples/vanilla/fixture.ts) offers a synthetic transport for repeatable UI checks; its QR cannot pair a real wallet.

Report the exact framework versions and checks performed. Keep synthetic tests, browser relay checks and physical-wallet results separate. Physical iOS/Android pairing, app routing, signatures and transaction submission remain unverified in the [verification record](verification.md); do not present a rendered QR or a successful build as proof of them. Real wallet approval and signing belong to a separately authorized manual test.
