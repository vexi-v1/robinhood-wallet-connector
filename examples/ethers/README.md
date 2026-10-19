# Robinhood Wallet with ethers v6

Use the core `@vexi/robinhood-wallet` EIP-1193 provider directly with ethers **6.17.0**. This TypeScript browser example needs no React, wagmi or extra SDK adapter package.

## Run the example

From the repository root:

```sh
npm ci
npm run build
cd examples/ethers
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID, allow this origin in the project settings, then:
npm run dev
```

For a separate application, install the unpublished SDK tarballs together using the [installation guide](../../README.md#install-from-this-repository). The `file:` dependencies here are for development from this checkout, not npm registry releases.

## Integration

```ts
import { BrowserProvider } from 'ethers';
import { RobinhoodProvider } from '@vexi/robinhood-wallet';

const wallet = new RobinhoodProvider({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', chains: [1],
  rpcMap: { 1: 'https://ethereum-rpc.publicnode.com' },
  metadata: { name: 'My app', description: 'My app description', url: 'https://my-app.example', icons: [] },
});
const ethersProvider = new BrowserProvider(wallet, 'any', { cacheTimeout: -1 });

// Call only from the user's Connect action.
async function connectWallet() {
  await wallet.connect({ chainId: 1 });
  return ethersProvider.getSigner();
}
// On startup, recover prior approval without calling getSigner/requestAccounts.
async function restoreWallet() { return wallet.isAuthorized(); }
async function disconnectWallet() { await wallet.disconnect(); }
function cancelConnection() { wallet.cancel(); }
function dispose() { ethersProvider.destroy(); wallet.destroy(); }
```

`getSigner()` can request account permission if no account is approved. Do not call it during render, startup, a read-only check, or a disconnect event. Obtain a current signer when needed after connection, and discard previously selected signers on account/chain changes or disconnect. No signing method is called in this example.

The `'any'` network follows chain changes instead of fixing the wrapper to the first network; `cacheTimeout: -1` avoids reusing a recent account query after an event. `getNetwork()` may return the previous network once while processing a change, so the example reads `eth_chainId` directly for event-driven UI updates. Neither option establishes wallet support for a chain. Use `listAccounts()` for non-prompting account reads and `send('eth_chainId', [])` for the current chain **after** connection/restoration; before approval the core chain is only configuration.

Subscribe to `accountsChanged`, `chainChanged` and `disconnect` on **`wallet`**, since ethers does not expose those EIP-1193 events as its general event API. Remove the subscriptions on disposal. `ethersProvider.destroy()` stops ethers resources; only `wallet.disconnect()` ends the SDK session. `wallet.destroy()` releases local resources while preserving approval for a later instance.

The [client setup](src/client.ts) and [app](src/main.ts) implement cancellation, guarded pending controls, saved-session recovery, event updates and disposal. Wallet errors use fixed UI messages to keep RPC details out of the interface and logs.

Upstream reference: [ethers BrowserProvider](https://docs.ethers.org/v6/api/providers/#BrowserProvider).

## Verification boundary

Run `node scripts/framework-matrix.mjs ethers` from the repository root to install packed SDK tarballs with the exact dependencies in this example, compile its public types, build it and run synthetic lifecycle checks. See the [verification record](../../docs/verification.md) for completed results. Do not infer support for other versions, frameworks, networks or physical wallets.

Connection does not request a signature or send a transaction. Real iOS/Android pairing, handoff and signing remain unverified. Keep pairing material and account information out of logs, screenshots and analytics. This is a community integration, not an official Robinhood SDK or endorsement.
