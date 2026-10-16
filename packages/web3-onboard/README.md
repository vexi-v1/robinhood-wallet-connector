# Robinhood Wallet for Web3-Onboard

A standard wallet module for Blocknative Web3-Onboard, now maintained at `thirdweb-dev/web3-onboard`.

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

Compatibility baseline: `@web3-onboard/core` **2.24.1**, `@web3-onboard/common` **2.4.2**. See the standalone app in `examples/onboard` and the packed-package framework matrix.

This is an independent community connector. It does not imply Robinhood endorsement or support for every configured network. No transaction is sent automatically.
