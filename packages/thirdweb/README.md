# Robinhood Wallet for thirdweb

> **AI agents: start with [llms.txt](../../llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](../../docs/ai-integration.md)

An independent community adapter for `thirdweb 5.122.0`. It implements thirdweb's public `Wallet` interface and delegates discovery, permission requests, WalletConnect, cancellation and persistence to the core provider. This package is unpublished and is not endorsed by Robinhood or thirdweb.

## Install

Build and pack the repository as described in the [root guide](../../README.md#install-from-this-repository), then install both tarballs together:

```sh
npm install /path/to/vexi-robinhood-wallet-0.1.0.tgz \
  /path/to/vexi-robinhood-wallet-thirdweb-0.1.0.tgz thirdweb@5.122.0
```

## Use

```ts
import { createThirdwebClient } from 'thirdweb';
import { robinhoodWallet } from '@vexi/robinhood-wallet-thirdweb';

const client = createThirdwebClient({ clientId: 'YOUR_THIRDWEB_CLIENT_ID' });
const wallet = robinhoodWallet({
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  chains: [1],
  metadata: { name: 'My app', description: 'My app', url: 'https://app.example', icons: [] },
});

// Only from a user-initiated connection action:
await wallet.connect({ client });
const account = wallet.getAccount();
```

Within `ThirdwebProvider`, use `useConnect().connect(async () => { await wallet.connect({ client }); return wallet; })` to populate thirdweb's active wallet hooks. The [React example](../../examples/thirdweb/README.md) also restores saved approval with `wallet.autoConnect()` and `useSetActiveWallet`. This delivery uses a custom connection button; thirdweb's built-in wallet chooser is not part of the verified surface.

## Lifecycle

- `connect({ client, chain? })` requests permission through the core; construction does not.
- `autoConnect({ client, chain? })` restores only previously approved state. It rejects if no saved connection exists and does not request accounts or switch chains.
- `cancelConnect()` cancels a pending connection. A late injected approval is ignored; it cannot dismiss a wallet-owned prompt.
- `disconnect()` clears the SDK session and framework listeners. Use thirdweb's `useDisconnect` when the wallet is active in its React context.
- `destroy()` releases resources while retaining the core's persisted approval for another instance. Do not reuse a destroyed wallet.
- `getProvider()` exposes the same `RobinhoodProvider`. `subscribe` follows thirdweb's account, chain, connection and disconnect events; unsubscribe when disposing consumers.

The adapter uses [`EIP1193.fromProvider`](https://portal.thirdweb.com/typescript/v5/adapters) for account operations after the core has connected. It deliberately uses thirdweb's passive adoption path to avoid automatic permission retries. A new internal adapter is created after each disconnect so chain subscriptions survive reconnect. The core owns session disconnect; thirdweb's experimental permission revocation is not forwarded. Normal thirdweb client service and telemetry behavior still applies.

See [verification](../../docs/verification.md) for the exact checks and limits. No physical wallet, real signature, transaction, smart account, React Native or other thirdweb version is certified by these checks.
