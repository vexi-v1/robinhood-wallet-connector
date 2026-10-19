# Dynamic example

> **AI agents: start with [llms.txt](../../llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](../../docs/ai-integration.md)

Uses Dynamic React SDK 5.12.0 with React / React DOM 19.3.1 and viem 2.57.7. Register the custom connector with `DynamicContextProvider`, then select Robinhood in `DynamicWidget`. The environment must enable the same EVM networks as the core options. `connect-only` mode prevents automatic SIWE authentication. Dynamic labels this SDK generation as its legacy React SDK; its newer JavaScript SDK is a separate, untested integration.

## Run locally

Use Node.js 22.12 or newer. These packages are unpublished; build the repository first:

```sh
# Repository root
npm ci
npm run build
cd examples/dynamic
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID and VITE_DYNAMIC_ENVIRONMENT_ID.
npm run dev
```

Use your own WalletConnect project ID and Dynamic environment ID. They are distinct public application identifiers. Configure the allowed application origin in the relevant dashboards, then restart Vite after editing environment variables. Never put a private key, recovery phrase or server secret in a Vite environment variable.

To consume this integration outside the repository, install the packed core and `dynamic` adapter together using the [package guide](../../packages/dynamic/README.md). Local `file:` dependencies in this example are for repository development.

## Behavior

Construction and imports do not request accounts. Connection starts from an explicit button or wallet selection; only the core's matching Robinhood provider or its WalletConnect transport is used. Close the Robinhood dialog or press Escape to cancel, then retry deliberately. Reload recovery uses saved approval without another account request. Disconnect clears that saved session; teardown releases listeners.

This example requests no signature or transaction. Automated checks use synthetic wallets only.

The application displays connection state without logging account details or pairing material. See the [adapter API](../../packages/dynamic/README.md) and [verification record](../../docs/verification.md) for coverage and limitations. A successful build or synthetic connection does not prove live platform authentication, relay pairing, physical-device routing or network support. No Robinhood endorsement is implied.
