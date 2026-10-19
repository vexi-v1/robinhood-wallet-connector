# Robinhood Wallet with viem

Use the core `@vexi/robinhood-wallet` EIP-1193 provider as a viem **2.57.7** custom transport. This TypeScript browser example needs no React, wagmi or extra SDK adapter package.

## Run the example

From the repository root:

```sh
npm ci
npm run build
cd examples/viem
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID, allow this origin in the project settings, then:
npm run dev
```

For a separate application, install the unpublished SDK tarballs together using the [installation guide](../../README.md#install-from-this-repository). The `file:` dependencies here are for development from this checkout, not npm registry releases.

## Integration

```ts
import { createWalletClient, custom } from 'viem';
import { RobinhoodProvider } from '@vexi/robinhood-wallet';

const wallet = new RobinhoodProvider({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', chains: [1],
  rpcMap: { 1: 'https://ethereum-rpc.publicnode.com' },
  metadata: { name: 'My app', description: 'My app description', url: 'https://my-app.example', icons: [] },
});
const walletClient = createWalletClient({ transport: custom(wallet, { retryCount: 0 }) });

// Call only from the user's Connect action.
async function connectWallet() {
  await wallet.connect({ chainId: 1 });
  return walletClient.getAddresses();
}
// On startup, recover prior approval without requesting accounts.
async function restoreWallet() { return wallet.isAuthorized(); }
async function disconnectWallet() { await wallet.disconnect(); }
function cancelConnection() { wallet.cancel(); }
```

`walletClient.requestAddresses()` is another explicit connection entry point, forwarding `eth_requestAccounts`. It does not select a chain; use `wallet.connect({ chainId })` when a particular configured chain is required. `getAddresses()` only reads the current cache; use `isAuthorized()` to recover persisted approval. Read `getChainId()` after connection/restoration; before approval the core chain reflects application configuration.

Disable custom-transport retries with `retryCount: 0` so failed permission requests are not repeated automatically. This example does not hoist a fixed `account` or `chain` into the client: later application operations must supply current account/chain configuration and validate the wallet's state. A fixed client account becomes stale after account changes. Use a separate `createPublicClient({ transport: http(...) })` for application reads that should work while disconnected.

Observe `accountsChanged`, `chainChanged` and `disconnect` on **`wallet`**. The custom transport forwards requests; it does not manage an application's reactive state or disposal. Remove listeners and call `wallet.destroy()` on disposal, or `wallet.disconnect()` to log out. Do not treat disposing the client or dropping its reference as a disconnect.

The [client setup](src/client.ts) and [app](src/main.ts) demonstrate pending controls, cancellation, recovery, state refresh and cleanup. No signing or transaction methods run automatically.

Upstream references: [viem wallet client](https://viem.sh/docs/clients/wallet), [custom EIP-1193 transport](https://viem.sh/docs/clients/transports/custom).

## Verification boundary

Run `node scripts/framework-matrix.mjs viem` from the repository root to install packed SDK tarballs with the exact dependencies in this example, compile its public types, build it and run synthetic lifecycle checks. See the [verification record](../../docs/verification.md) for completed results. Do not infer support for other versions, frameworks, networks or physical wallets.

Connection does not request a signature or send a transaction. Real iOS/Android pairing, handoff and signing remain unverified. Keep pairing material and account information out of logs, screenshots and analytics. This is a community integration, not an official Robinhood SDK or endorsement.
