import { createConnector, ChainNotConfiguredError } from '@wagmi/core';
import { getAddress, numberToHex, SwitchChainError, UserRejectedRequestError } from 'viem';
import {
  RobinhoodProvider,
  ROBINHOOD_WALLET,
  type RobinhoodProviderOptions,
} from '@vexi/robinhood-wallet';

export type RobinhoodWalletParameters = Omit<
  RobinhoodProviderOptions,
  'chains' | 'optionalChains'
>;

function addresses(value: unknown): readonly `0x${string}`[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Robinhood Wallet returned an invalid account list.');
  }
  return value.map((address) => getAddress(address));
}

function chainNumber(value: unknown): number {
  const chainId = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Robinhood Wallet returned an invalid chain ID.');
  }
  return chainId;
}

function rethrowConnectionError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 4001) {
    throw new UserRejectedRequestError(error instanceof Error ? error : new Error('Connection rejected.', { cause: error }));
  }
  throw error;
}

/** No transport, account request, or dialog is started during configuration. */
export function robinhoodWallet(parameters: RobinhoodWalletParameters) {
  return createConnector<RobinhoodProvider, { cancelConnect(): void }>((config) => {
    let provider: RobinhoodProvider | undefined;
    let listenersAttached = false;
    let connecting = false;

    const onAccountsChanged = (value: unknown) => {
      const accounts = addresses(value);
      if (accounts.length === 0) config.emitter.emit('disconnect');
      else config.emitter.emit('change', { accounts });
    };
    const onChainChanged = (value: unknown) => {
      config.emitter.emit('change', { chainId: chainNumber(value) });
    };
    const onDisconnect = () => {
      config.emitter.emit('disconnect');
    };
    const onDisplayUri = (uri: unknown) => {
      if (typeof uri === 'string') {
        config.emitter.emit('message', { type: 'display_uri', data: uri });
      }
    };
    const attach = () => {
      if (!provider || listenersAttached) return;
      provider.on('accountsChanged', onAccountsChanged);
      provider.on('chainChanged', onChainChanged);
      provider.on('disconnect', onDisconnect);
      provider.on('display_uri', onDisplayUri);
      listenersAttached = true;
    };
    const detach = () => {
      if (!provider || !listenersAttached) return;
      provider.removeListener('accountsChanged', onAccountsChanged);
      provider.removeListener('chainChanged', onChainChanged);
      provider.removeListener('disconnect', onDisconnect);
      provider.removeListener('display_uri', onDisplayUri);
      listenersAttached = false;
    };
    const getProvider = () => {
      if (!provider) {
        const rpcMap = Object.fromEntries(config.chains.map((chain) => [chain.id, chain.rpcUrls.default.http[0]]));
        provider = new RobinhoodProvider({
          ...parameters,
          chains: config.chains.map((chain) => chain.id),
          rpcMap: { ...rpcMap, ...parameters.rpcMap },
        });
      }
      attach();
      return provider;
    };

    return {
      id: ROBINHOOD_WALLET.id,
      name: ROBINHOOD_WALLET.name,
      icon: ROBINHOOD_WALLET.iconUrl,
      rdns: ROBINHOOD_WALLET.rdns,
      type: 'robinhoodWallet',
      async connect({ chainId, isReconnecting, withCapabilities } = {}) {
        const wallet = getProvider();
        if (isReconnecting && !(await wallet.isAuthorized())) {
          throw new Error('Robinhood Wallet has no approved session to reconnect.');
        }
        if (connecting) {
          throw new Error('A Robinhood Wallet connection is already pending.');
        }
        connecting = true;
        try {
          const result = await wallet.connect(chainId === undefined ? undefined : { chainId });
          const accounts = addresses(result.accounts);
          return {
            accounts: (withCapabilities
              ? accounts.map((address) => ({ address, capabilities: {} }))
              : accounts) as never,
            chainId: chainNumber(result.chainId),
          };
        } catch (error) {
          rethrowConnectionError(error);
        } finally {
          connecting = false;
        }
      },
      async disconnect() {
        if (!provider) return;
        provider.cancel();
        detach();
        await provider.disconnect();
      },
      cancelConnect() {
        provider?.cancel();
      },
      async getProvider() {
        return getProvider();
      },
      async getAccounts() {
        return addresses(await getProvider().getAccounts());
      },
      async getChainId() {
        return chainNumber(await getProvider().getChainId());
      },
      async isAuthorized() {
        return getProvider().isAuthorized();
      },
      async switchChain({ chainId }) {
        const chain = config.chains.find((candidate) => candidate.id === chainId);
        if (!chain) throw new SwitchChainError(new ChainNotConfiguredError());
        try {
          const wallet = getProvider();
          await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] });
          if ((await wallet.getChainId()) !== chainId) {
            throw new Error('Robinhood Wallet did not confirm the requested chain.');
          }
          return chain;
        } catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 4001) {
            throw new UserRejectedRequestError(error instanceof Error ? error : new Error('Chain switch rejected.', { cause: error }));
          }
          throw new SwitchChainError(error as Error);
        }
      },
      onAccountsChanged,
      onChainChanged,
      onDisconnect,
    };
  });
}

export default robinhoodWallet;
