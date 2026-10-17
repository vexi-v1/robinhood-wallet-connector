import { type Wallet } from '@rainbow-me/rainbowkit';
import { injectedWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConnector } from 'wagmi';
import { injected } from 'wagmi/connectors';

/** Keep the generic wallet available, but restore it only after it was explicitly selected. */
export function browserWallet(): Wallet {
  return {
    ...injectedWallet(),
    createConnector(details) {
      // A targetless wagmi connector tracks its own connection intent. A targeted
      // generic provider would also restore an approval made through Robinhood.
      return createConnector((config) => ({ ...injected()(config), ...details }));
    },
  };
}
