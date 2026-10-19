# Robinhood Wallet for Dynamic

> **AI agents: start with [llms.txt](../../llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](../../docs/ai-integration.md)

A custom EVM wallet connector for Dynamic's React SDK `5.12.0`. It extends the public `EthereumWalletConnector` from `@dynamic-labs/ethereum-core` and uses the core Robinhood provider for discovery, WalletConnect and connection lifecycle. This is an unpublished community package without Robinhood or Dynamic endorsement.

## Install

Follow the [build and pack guide](../../README.md#install-from-this-repository), then install both SDK tarballs and the pinned peers:

```sh
npm install /path/to/vexi-robinhood-wallet-0.1.0.tgz \
  /path/to/vexi-robinhood-wallet-dynamic-0.1.0.tgz \
  @dynamic-labs/sdk-react-core@5.12.0 @dynamic-labs/ethereum-core@5.12.0 \
  @dynamic-labs/wallet-connector-core@5.12.0 viem@2.57.7
```

The Dynamic declarations use extensionless re-exports. Use TypeScript's `moduleResolution: "Bundler"` for this integration, as in the runnable example.

## Register the connector

```tsx
import { DynamicContextProvider, DynamicWidget } from '@dynamic-labs/sdk-react-core';
import { robinhoodWalletConnectors } from '@vexi/robinhood-wallet-dynamic';

const RobinhoodConnectors = robinhoodWalletConnectors({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', chains: [1],
  metadata: { name: 'My app', description: 'My app', url: 'https://app.example', icons: [] },
});

function App() {
  return <DynamicContextProvider settings={{
    environmentId: 'YOUR_DYNAMIC_ENVIRONMENT_ID',
    initialAuthenticationMode: 'connect-only',
    walletConnectors: [RobinhoodConnectors],
  }}><DynamicWidget/></DynamicContextProvider>;
}
```

Configure the same enabled EVM networks in Dynamic and the Robinhood options. The factory does not modify other connectors; include it alongside existing connector factories. Do not add a second Robinhood connector under the same key.

`getAddress()` / `connect()` are permission-bearing actions. `getConnectedAccounts()` only restores approved state; `init()` announces readiness without creating a transport. The connector exposes `provider`, `cancelConnect()` and `destroy()` for custom hosts. `endSession()` disconnects and clears listeners. Repeated setup/teardown is supported, and account/chain/disconnect events are translated to Dynamic events. viem wallet clients use `retryCount: 0`.

If logout starts just after saved-session recovery adopts an approved connection, `endSession()` lets that recovery promise settle before clearing the session. Pending requests that have not received approval are still cancelled immediately; logout never requests a new approval.

Dynamic calls its custom SDK routing flag `canConnectViaCustodialService`; the adapter sets that flag to make its own connection UI reachable. This is a framework routing convention, not a claim that Robinhood is custodial or that its mobile app is installed. Provider identity is still checked by the core.

See the [runnable example](../../examples/dynamic/README.md), [upstream custom connector guide](https://github.com/dynamic-labs/public-wallet-connectors/blob/main/CONTRIBUTING.md) and [verification record](../../docs/verification.md). The example uses connect-only mode. Dynamic authentication, embedded wallets, the newer JavaScript SDK, physical devices and actual signing are outside the verified surface.
