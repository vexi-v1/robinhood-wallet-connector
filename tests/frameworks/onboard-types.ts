import Onboard from '@web3-onboard/core';
import type { WalletInit } from '@web3-onboard/common';
import { robinhoodModule } from '@vexi/robinhood-wallet-onboard';

const wallet: WalletInit = robinhoodModule({
  projectId: '00000000000000000000000000000000',
  metadata: { name: 'Type contract', description: '', url: 'https://example.test', icons: [] },
});

// Compile-only contract: initialization is covered separately without real wallet approval.
export function publicOnboardContract() {
  return Onboard({ wallets: [wallet], chains: [{ id: '0x1', label: 'Ethereum', token: 'ETH', rpcUrl: 'https://example.test/rpc' }] });
}
