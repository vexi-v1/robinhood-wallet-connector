import type { EIP1193Provider, WalletInit } from '@web3-onboard/common';
import {
  RobinhoodProvider,
  ROBINHOOD_WALLET,
  type RobinhoodProviderOptions,
} from '@vexi/robinhood-wallet';

export type RobinhoodModuleOptions = Omit<RobinhoodProviderOptions, 'chains' | 'optionalChains' | 'metadata'> & {
  metadata?: RobinhoodProviderOptions['metadata'];
};

/** A standard WalletInit module; importing or selecting it never requests accounts. */
export function robinhoodModule(options: RobinhoodModuleOptions): WalletInit {
  return () => {
    let provider: RobinhoodProvider | undefined;
    return {
      label: ROBINHOOD_WALLET.name,
      getIcon: async () => ROBINHOOD_WALLET.iconUrl,
      async getInterface({ chains, appMetadata }) {
        if (!provider) {
          const chainIds = chains.map((chain) => Number(chain.id));
          if (chainIds.length === 0 || chainIds.some((chainId) => !Number.isSafeInteger(chainId) || chainId <= 0)) {
            throw new Error('Robinhood Wallet requires at least one valid EVM chain.');
          }
          provider = new RobinhoodProvider({
            ...options,
            chains: chainIds,
            rpcMap: {
              ...Object.fromEntries(chains.filter((chain) => chain.rpcUrl).map((chain) => [Number(chain.id), chain.rpcUrl])),
              ...options.rpcMap,
            },
            metadata: options.metadata ?? {
              name: appMetadata?.name ?? 'Application',
              description: appMetadata?.description ?? '',
              url: appMetadata?.explore ?? (typeof window === 'undefined' ? '' : window.location.origin),
              icons: appMetadata?.icon ? [appMetadata.icon] : [],
            },
          });
        }
        // Onboard's overloaded request declarations describe the same EIP-1193
        // runtime protocol. It calls eth_requestAccounts after this method returns.
        return { provider: provider as unknown as EIP1193Provider, instance: provider };
      },
    };
  };
}

export default robinhoodModule;
