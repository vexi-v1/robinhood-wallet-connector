# Robinhood Wallet with Reown AppKit

Use the existing `@vexi/robinhood-wallet-wagmi` connector through AppKit's public `WagmiAdapter`. The AppKit chooser lists Robinhood; the core SDK owns its remote pairing dialog and session. No additional SDK adapter package is required.

Baseline: `@reown/appkit` and `@reown/appkit-adapter-wagmi` **1.8.24**, `wagmi` **3.7.7**, `@wagmi/core` **3.6.5**, `viem` **2.57.7**, React **19.3.1**. This example covers AppKit's React + wagmi integration; it does not establish compatibility with AppKit's ethers adapter, other framework bindings, wagmi v2 or non-EVM adapters.

AppKit's broad optional `@wagmi/connectors` range can resolve to a release requiring wagmi core v3. This baseline uses wagmi v3 throughout; a fresh install with wagmi v2 failed on the upstream `@wagmi/core/tempo` export and is not claimed as supported.

## Run the example

From the repository root:

```sh
npm ci
npm run build
cd examples/appkit
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID, allow this origin in the project settings, then:
npm run dev
```

For a separate application, install the unpublished SDK tarballs together using the [installation guide](../../README.md#install-from-this-repository). The `file:` dependencies here are for development from this checkout, not npm registry releases.

## Integration

```ts
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';

const projectId = 'YOUR_WALLETCONNECT_PROJECT_ID';
const metadata = { name: 'My app', description: 'My app description', url: 'https://my-app.example', icons: [] };
const adapter = new WagmiAdapter({
  projectId,
  networks: [mainnet],
  connectors: [robinhoodWallet({ projectId, metadata })],
  ssr: true,
});
// Initialize once in the browser's application entry point.
const modal = createAppKit({
  adapters: [adapter], networks: [mainnet], projectId, metadata,
  features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
});
// From an explicit user action:
async function openWalletChooser() { await modal.open(); }
```

Wrap the application in `WagmiProvider` with **`adapter.wagmiConfig`** and `QueryClientProvider`. Do not create a second wagmi config for AppKit. Keep existing custom connectors in the adapter's `connectors` array. AppKit supplies its ordinary wallet entries; this integration does not rename them. The [configuration](src/config.ts) and [React app](src/main.tsx) show the complete wiring.

The SDK connector retains its own `robinhood` ID and `robinhoodWallet` type. AppKit maps it to an external connector. A `customWallets` catalog entry alone would not install this transport or lifecycle implementation. Leave `showModal` enabled and do not add another QR handler for the Robinhood connector.

Close or Escape in the SDK dialog cancels pairing; retry from AppKit after the previous request settles. Use wagmi's account state and disconnect/reconnect flows. Cancellation cannot dismiss a separate injected wallet permission prompt; it prevents late completion from adopting that connection. Explicit metadata keeps SDK configuration safe during SSR; the Vite app's `window.location.origin` and `createAppKit` setup belong at the browser boundary in an SSR application.

Upstream references: [AppKit React setup](https://docs.reown.com/appkit/react/core/installation), [AppKit options](https://docs.reown.com/appkit/react/core/options), and the tested [WagmiAdapter source](https://github.com/reown-com/appkit/blob/v1.8.24/packages/adapters/wagmi/src/client.ts).

## Verification boundary

Run `node scripts/framework-matrix.mjs appkit` from the repository root to install packed SDK tarballs with the exact dependencies in this example, compile its public types, build it and run synthetic lifecycle checks. See the [verification record](../../docs/verification.md) for completed results. Do not infer support for other versions, frameworks, networks or physical wallets.

Connection does not request a signature or send a transaction. Real iOS/Android pairing, handoff and signing remain unverified. Keep pairing material and account information out of logs, screenshots and analytics. This is a community integration, not an official Robinhood SDK or endorsement.
