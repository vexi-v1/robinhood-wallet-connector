import { BrowserProvider } from 'ethers';
import { RobinhoodProvider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

export function createWalletConnection(options: RobinhoodProviderOptions) {
  const provider = new RobinhoodProvider(options);
  // Follow wallet chain changes and avoid briefly reusing cached account results.
  const client = new BrowserProvider(provider, 'any', { cacheTimeout: -1 });
  return {
    provider,
    client,
    async readState() {
      // getNetwork() may return the prior network once while processing a change.
      const [accounts, chainId] = await Promise.all([client.listAccounts(), client.send('eth_chainId', [])]);
      return { count: accounts.length, chainId: Number(chainId) };
    },
    dispose() {
      client.destroy();
      provider.destroy();
    },
  };
}
