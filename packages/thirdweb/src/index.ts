import { ProviderRpcError, RobinhoodProvider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';
import { EIP1193, type Account, type Wallet, type WalletEmitterEvents } from 'thirdweb/wallets';

export type RobinhoodThirdwebWallet = Wallet<'com.robinhood.wallet'> & {
  getProvider(): RobinhoodProvider;
  cancelConnect(): void;
  destroy(): void;
};

/** A stable thirdweb wallet whose connection lifecycle belongs to the core SDK. */
export function robinhoodWallet(options: RobinhoodProviderOptions): RobinhoodThirdwebWallet {
  const provider = new RobinhoodProvider(options);
  type Events = WalletEmitterEvents<'com.robinhood.wallet'>;
  const listeners = new Map<keyof Events, Set<(value: any) => void>>();
  let active: Wallet | undefined;
  let pending: Promise<Account> | undefined;
  let subscriptions: (() => void)[] = [];
  let generation = 0;
  let destroyed = false;

  function emit<K extends keyof Events>(event: K, value: Events[K]) {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      try { listener(value); } catch { /* Host callbacks must not interrupt cleanup. */ }
    }
  }
  function detach() {
    for (const unsubscribe of subscriptions) unsubscribe();
    subscriptions = [];
    const previous = active;
    active = undefined;
    return previous;
  }
  function check(token: number) {
    if (destroyed || token !== generation || !provider.connected) {
      throw new ProviderRpcError(4001, 'Connection cancelled.');
    }
  }
  function connect(parameters: Parameters<Wallet<'com.robinhood.wallet'>['connect']>[0], restore: boolean): Promise<Account> {
    if (destroyed) return Promise.reject(new ProviderRpcError(4900, 'Wallet has been destroyed.'));
    if (pending) return pending;
    if (active?.getAccount()) {
      if (restore || !parameters.chain) return Promise.resolve(active.getAccount()!);
      return provider.connect({ chainId: parameters.chain.id }).then(() => {
        const account = active?.getAccount();
        if (!account) throw new ProviderRpcError(4900, 'Wallet is disconnected.');
        return account;
      });
    }
    const token = ++generation;
    const operation = (async () => {
      if (restore) {
        if (!await provider.isAuthorized()) throw new ProviderRpcError(4900, 'No saved Robinhood connection.');
      } else {
        await provider.connect({ chainId: parameters.chain?.id });
      }
      check(token);
      // Use passive adoption: thirdweb's connect() retries eth_requestAccounts on some errors.
      // A fresh adapter also preserves chain subscriptions after disconnect/reconnect.
      const next = EIP1193.fromProvider({
        walletId: 'com.robinhood.wallet',
        provider: {
          request: (args) => args.method === 'wallet_revokePermissions'
            ? Promise.resolve(null) : provider.request(args),
          on: provider.on.bind(provider),
          removeListener: provider.removeListener.bind(provider),
        },
      });
      try {
        const account = await next.autoConnect(parameters);
        check(token);
        active = next;
        subscriptions = [
          next.subscribe('accountChanged', (value) => emit('accountChanged', value)),
          next.subscribe('accountsChanged', (value) => emit('accountsChanged', value)),
          next.subscribe('chainChanged', (value) => emit('chainChanged', value)),
          next.subscribe('disconnect', (value) => {
            ++generation;
            detach();
            void provider.disconnect().catch(() => {});
            emit('disconnect', value);
          }),
        ];
        emit('onConnect', parameters);
        return account;
      } catch (error) {
        await next.disconnect();
        throw error;
      }
    })().catch(async (error) => {
      // Cancellation can race the core's connect event, before thirdweb adopts it.
      if (!active && provider.connected) await provider.disconnect();
      throw error;
    });
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = undefined; }).catch(() => {});
    return operation;
  }

  return {
    id: 'com.robinhood.wallet',
    getProvider: () => provider,
    getConfig: () => undefined,
    getAccount: () => active?.getAccount(),
    getChain: () => active?.getChain(),
    connect: (parameters) => connect(parameters, false),
    autoConnect: (parameters) => connect(parameters, true),
    subscribe(event, listener) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(listener);
      return () => { set.delete(listener); };
    },
    async switchChain(chain) {
      if (!active) throw new ProviderRpcError(4900, 'Wallet is disconnected.');
      // Core enforces configured chains; do not fall through to thirdweb's automatic add-chain path.
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chain.id.toString(16)}` }] });
    },
    cancelConnect() { ++generation; provider.cancel(); },
    async disconnect() {
      ++generation;
      const previous = detach();
      try { await provider.disconnect(); }
      finally {
        await previous?.disconnect();
        emit('disconnect', undefined);
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ++generation;
      const previous = detach();
      provider.destroy();
      void previous?.disconnect();
      listeners.clear();
    },
  };
}
