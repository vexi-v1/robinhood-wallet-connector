import { createWalletClient, custom } from 'viem';
import { RobinhoodProvider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

export function createWalletConnection(options: RobinhoodProviderOptions) {
  const provider = new RobinhoodProvider(options);
  // Permission requests must never be retried automatically after rejection.
  const client = createWalletClient({ transport: custom(provider, { retryCount: 0 }) });
  return {
    provider,
    client,
    async readState() {
      const [accounts, chainId] = await Promise.all([client.getAddresses(), client.getChainId()]);
      return { count: accounts.length, chainId };
    },
    dispose() { provider.destroy(); },
  };
}
