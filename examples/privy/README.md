# Privy example

> **AI agents: start with [llms.txt](../../llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](../../docs/ai-integration.md)

Uses Privy React Auth 3.50.0 with React / React DOM 19.3.1 and viem 2.57.7. The core connects Robinhood independently; a separate **Sign in with Privy** button invokes the public headless SIWE flow. Enable wallet authentication in the Privy dashboard and allow the application origin. The wallet is not added to Privy's chooser or `useWallets()` array. The example disables Privy's own external wallet connectors to keep a single connection owner.

## Run locally

Use Node.js 22.12 or newer. These packages are unpublished; build the repository first:

```sh
# Repository root
npm ci
npm run build
cd examples/privy
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID and VITE_PRIVY_APP_ID.
npm run dev
```

Use your own WalletConnect project ID and Privy app ID. They are distinct public application identifiers. Configure the allowed application origin in the relevant dashboards, then restart Vite after editing environment variables. Never put a private key, recovery phrase or server secret in a Vite environment variable.

To consume this integration outside the repository, install the packed core and `privy` adapter together using the [package guide](../../packages/privy/README.md). Local `file:` dependencies in this example are for repository development.

## Behavior

Construction and imports do not request accounts. Connection starts from an explicit button or wallet selection; only the core's matching Robinhood provider or its WalletConnect transport is used. Close the Robinhood dialog or press Escape to cancel, then retry deliberately. Reload recovery uses saved approval without another account request. Disconnect clears that saved session; teardown releases listeners.

The sign-in button requests a signature. Cancel sign-in invalidates the pending result but cannot dismiss a wallet-owned prompt. If authentication completes after cancellation, the helper signs out the late session. Sign out and wallet disconnect are separate controls. Do not run concurrent authentication flows. No automated UI check clicks the sign-in button.

The application displays connection state without logging account details or pairing material. See the [adapter API](../../packages/privy/README.md) and [verification record](../../docs/verification.md) for coverage and limitations. A successful build or synthetic connection does not prove live platform authentication, relay pairing, physical-device routing or network support. No Robinhood endorsement is implied.
