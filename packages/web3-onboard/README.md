# Robinhood Wallet for Web3-Onboard

> **AI integration docs:** [llms.txt](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/docs/ai-integration.md)

A Robinhood Wallet module for Web3-Onboard with the toolkit's dedicated connection dialog. Web3-Onboard originated at Blocknative and is now maintained at `thirdweb-dev/web3-onboard`.

Built and maintained by **[Vexi Lab](https://vexi-protocol.ai) (an onchain options protocol)**. This is an independent community project, **not an official Robinhood SDK**, and is not affiliated with or endorsed by Robinhood.

These packages are not published to npm. Follow the [tarball installation guide](https://github.com/vexi-v1/robinhood-wallet-connector#install-from-this-repository) before using this adapter.

```ts
import Onboard from '@web3-onboard/core';
import { robinhoodModule } from '@vexi/robinhood-wallet-onboard';

const onboard = Onboard({
  wallets: [robinhoodModule({ projectId: 'YOUR_WALLETCONNECT_PROJECT_ID' })],
  chains: [{
    id: '0x1',
    label: 'Ethereum',
    token: 'ETH',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
  }],
  appMetadata: { name: 'My app', description: 'My app description', explore: 'https://my-app.example' },
});

// Invoke from a user's Connect button.
const wallets = await onboard.connectWallet();
```

The module derives chain IDs and RPC URLs from Onboard's configured chains. Metadata defaults to `appMetadata`, or can be supplied explicitly to `robinhoodModule`. `getInterface` returns a stable EIP-1193 `provider` and exposes the same `RobinhoodProvider` as `instance`; it does not request accounts until Onboard calls `eth_requestAccounts`.

Robinhood's dedicated native dialog owns remote pairing cancellation. Close it and select Robinhood again to retry. A matching injected Robinhood provider is used when present. Other wallet modules remain independent. Supply a public WalletConnect project ID with the app origin allowed in its dashboard; never supply a private key or recovery phrase.

Onboard reconnects through `eth_requestAccounts`, including with `connect.autoConnectLastWallet`. The provider first recovers the session the user approved earlier, so a reload does not open a new pairing or leave the old session behind. If that session has expired or been removed, the request opens a new pairing dialog, including during an automatic reconnect. A wallet rejection is reported with code `4001`, which Onboard shows as a rejected connection with its retry action.

Compatibility baseline: `@web3-onboard/core` **2.24.1**, `@web3-onboard/common` **2.4.2**. See the standalone app in `examples/onboard` and the packed-package framework matrix.

Configuring a network does not establish wallet support for it. No transaction is sent automatically.
