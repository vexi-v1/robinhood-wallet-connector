import { createConnector, ChainNotConfiguredError } from '@wagmi/core';
import { getAddress, numberToHex, ResourceUnavailableRpcError, SwitchChainError, UserRejectedRequestError } from 'viem';
import {
  discoverRobinhood,
  ProviderRpcError,
  RobinhoodProvider,
  ROBINHOOD_WALLET,
  type RobinhoodProviderOptions,
} from '@vexi/robinhood-wallet';

export type RobinhoodWalletParameters = Omit<
  RobinhoodProviderOptions,
  'chains' | 'optionalChains'
>;

type Connected = { accounts: readonly `0x${string}`[]; chainId: number };

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

function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

/** EIP-1193 4001, or WalletConnect's USER_REJECTED (5000) passed through by a custom transport. */
function isUserRejection(error: unknown): boolean {
  return error instanceof UserRejectedRequestError || errorCode(error) === 4001 || errorCode(error) === 5000;
}

function asError(error: unknown, message: string): Error {
  return error instanceof Error ? error : new Error(message, { cause: error });
}

function isConnectionLoss(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === 'object' && !seen.has(error)) {
    if (errorCode(error) === 4900 || errorCode(error) === 4100) return true;
    seen.add(error);
    error = 'cause' in error ? error.cause : undefined;
  }
  return false;
}

function rethrowConnectionError(error: unknown): never {
  if (error instanceof UserRejectedRequestError || error instanceof ResourceUnavailableRpcError) throw error;
  if (isUserRejection(error)) throw new UserRejectedRequestError(asError(error, 'Connection rejected.'));
  if (errorCode(error) === ResourceUnavailableRpcError.code) throw new ResourceUnavailableRpcError(asError(error, 'Connection already pending.'));
  throw error;
}

/** No transport, account request, or dialog is started during configuration. */
export function robinhoodWallet(parameters: RobinhoodWalletParameters) {
  return createConnector<RobinhoodProvider, { cancelConnect(): void }>((config) => {
    let provider: RobinhoodProvider | undefined;
    let listenersAttached = false;
    let intent = 0;
    let pending: { chainId?: number; promise: Promise<Connected>; reject(error: unknown): void } | undefined;
    const cancelPending = (error: unknown) => {
      ++intent;
      const previous = pending;
      pending = undefined;
      previous?.reject(error);
    };

    const onAccountsChanged = (value: unknown) => {
      const accounts = addresses(value);
      if (accounts.length === 0) {
        cancelPending(new ProviderRpcError(4900, 'Wallet disconnected before connection completed.'));
        config.emitter.emit('disconnect');
      }
      else config.emitter.emit('change', { accounts });
    };
    const onChainChanged = (value: unknown) => {
      config.emitter.emit('change', { chainId: chainNumber(value) });
    };
    const onDisconnect = () => {
      cancelPending(new ProviderRpcError(4900, 'Wallet disconnected before connection completed.'));
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

    const switchChain = async ({ chainId }: { chainId: number }) => {
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
        if (isUserRejection(error)) throw new UserRejectedRequestError(asError(error, 'Chain switch rejected.'));
        throw new SwitchChainError(error as Error);
      }
    };

    const ensureCurrent = (wallet: RobinhoodProvider, expectedIntent: number) => {
      if (intent !== expectedIntent || !wallet.connected) throw new ProviderRpcError(4900, 'Wallet disconnected before connection completed.');
    };
    const establish = async (wallet: RobinhoodProvider, chainId: number | undefined, expectedIntent: number, isReconnecting?: boolean): Promise<Connected> => {
      if (isReconnecting) {
        const authorized = await wallet.isAuthorized();
        if (intent !== expectedIntent) throw new ProviderRpcError(4900, 'Connection ended before session recovery completed.');
        if (!authorized) throw new Error('Robinhood Wallet has no approved session to reconnect.');
      }
      const result = await wallet.connect();
      ensureCurrent(wallet, expectedIntent);
      const current = chainNumber(result.chainId);
      // An unavailable preferred chain can fall back to the connected wallet's chain. A lost or
      // cancelled connection cannot: its result must never be filled from a later connection.
      if (chainId !== undefined && chainId !== current) {
        try {
          await switchChain({ chainId });
        } catch (error) {
          ensureCurrent(wallet, expectedIntent);
          if (error instanceof UserRejectedRequestError) {
            // wagmi records this connection as failed, so the provider must not keep it either.
            cancelPending(error);
            await wallet.disconnect();
            throw error;
          }
          if (isConnectionLoss(error)) throw error;
        }
      }
      const [accounts, liveChainId] = await Promise.all([wallet.getAccounts(), wallet.getChainId()]);
      ensureCurrent(wallet, expectedIntent);
      if (!accounts.length) throw new ProviderRpcError(4100, 'Robinhood Wallet no longer exposes an approved account.');
      return { accounts: addresses(accounts), chainId: chainNumber(liveChainId) };
    };

    return {
      id: ROBINHOOD_WALLET.id,
      name: ROBINHOOD_WALLET.name,
      icon: ROBINHOOD_WALLET.iconUrl,
      rdns: ROBINHOOD_WALLET.rdns,
      type: 'robinhoodWallet',
      async connect({ chainId, isReconnecting, withCapabilities } = {}) {
        const wallet = getProvider();
        let shared = pending;
        // A repeated request shares the pending one; a different chain cannot join it.
        if (shared && shared.chainId !== chainId) {
          throw new ResourceUnavailableRpcError(new Error('A Robinhood Wallet connection is already pending.'));
        }
        if (!shared) {
          let resolve!: (result: Connected) => void;
          let reject!: (error: unknown) => void;
          const promise = new Promise<Connected>((res, rej) => { resolve = res; reject = rej; });
          const current = { chainId, promise, reject };
          shared = pending = current;
          void establish(wallet, chainId, ++intent, isReconnecting).then(
            (result) => { if (pending === current) pending = undefined; resolve(result); },
            (error) => { if (pending === current) pending = undefined; reject(error); },
          );
        }
        try {
          const { accounts, chainId: connectedChainId } = await shared.promise;
          return {
            accounts: (withCapabilities
              ? accounts.map((address) => ({ address, capabilities: {} }))
              : accounts) as never,
            chainId: connectedChainId,
          };
        } catch (error) {
          rethrowConnectionError(error);
        }
      },
      async disconnect() {
        cancelPending(new ProviderRpcError(4900, 'Wallet disconnected before connection completed.'));
        if (!provider) return;
        provider.cancel();
        detach();
        await provider.disconnect();
      },
      cancelConnect() {
        cancelPending(new ProviderRpcError(4001, 'Connection cancelled.'));
        provider?.cancel();
      },
      async getProvider() {
        return getProvider();
      },
      async getAccounts() {
        return addresses(await getProvider().getAccounts());
      },
      async getChainId() {
        const wallet = getProvider();
        if (!wallet.connected) {
          // Like wagmi's injected connector, report an in-app wallet's current chain before connecting,
          // so a host such as RainbowKit asks for no needless switch. eth_chainId needs no permission.
          const injected = await discoverRobinhood(new AbortController().signal, 0);
          if (injected) {
            try {
              return chainNumber(await injected.request({ method: 'eth_chainId' }));
            } catch {
              // Fall back to the configured chain below.
            }
          }
        }
        return chainNumber(await wallet.getChainId());
      },
      async isAuthorized() {
        return getProvider().isAuthorized();
      },
      switchChain,
      onAccountsChanged,
      onChainChanged,
      onDisconnect,
    };
  });
}

export default robinhoodWallet;
