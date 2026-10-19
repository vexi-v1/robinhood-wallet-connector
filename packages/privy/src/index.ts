import { ProviderRpcError, type RobinhoodProvider } from '@vexi/robinhood-wallet';
import type { useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
import { getAddress, stringToHex } from 'viem';

export type RobinhoodPrivyHandlers = Pick<ReturnType<typeof useLoginWithSiwe>, 'generateSiweMessage' | 'loginWithSiwe'>
  & Pick<ReturnType<typeof usePrivy>, 'logout'>;

/** Call login only from an explicit sign-in action, after connecting the provider. */
export function createRobinhoodPrivyLogin(provider: RobinhoodProvider, handlers: RobinhoodPrivyHandlers) {
  let pending = false;
  let generation = 0;
  let destroyed = false;
  let removeListeners: (() => void) | undefined;
  const invalidate = () => { ++generation; removeListeners?.(); };
  return {
    cancel: invalidate,
    destroy() { destroyed = true; invalidate(); },
    async login() {
      if (destroyed) throw new ProviderRpcError(4900, 'Login controller has been destroyed.');
      if (pending) throw new ProviderRpcError(-32002, 'A sign-in request is already pending.');
      if (!provider.connected) throw new ProviderRpcError(4900, 'Connect Robinhood Wallet before signing in.');
      pending = true;
      const token = ++generation;
      const events = ['accountsChanged', 'chainChanged', 'disconnect'];
      for (const event of events) provider.on(event, invalidate);
      const cleanup = () => {
        for (const event of events) provider.removeListener(event, invalidate);
        if (removeListeners === cleanup) removeListeners = undefined;
      };
      removeListeners = cleanup;
      const check = () => {
        if (destroyed || token !== generation || !provider.connected) {
          throw new ProviderRpcError(4001, 'Sign-in cancelled because the connection changed.');
        }
      };
      try {
        const address = getAddress((await provider.getAccounts())[0]);
        const chainId = await provider.getChainId();
        check();
        const message = await handlers.generateSiweMessage({ address, chainId: `eip155:${chainId}` });
        check();
        const signature = await provider.request<string>({ method: 'personal_sign', params: [stringToHex(message), address] });
        check();
        const user = await handlers.loginWithSiwe({
          message, signature, walletClientType: 'robinhood',
          connectorType: provider.transport === 'walletConnect' ? 'wallet_connect_v2' : 'injected',
        });
        // A submitted authentication request cannot be withdrawn. Clear a late session.
        if (destroyed || token !== generation || !provider.connected) {
          await handlers.logout();
          check();
        }
        return user;
      } finally {
        pending = false;
        cleanup();
      }
    },
  };
}
