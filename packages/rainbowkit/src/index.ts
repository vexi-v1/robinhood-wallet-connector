import type { Wallet, WalletDetailsParams, RainbowKitWalletConnectParameters } from '@rainbow-me/rainbowkit';
import { createConnector } from 'wagmi';
import { ROBINHOOD_WALLET, type ProviderMetadata } from '@vexi/robinhood-wallet';
import { robinhoodWallet as createRobinhoodConnector } from '@vexi/robinhood-wallet-wagmi';

export interface RobinhoodWalletOptions {
  projectId: string;
  appName?: string;
  appDescription?: string;
  appUrl?: string;
  appIcon?: string;
  walletConnectParameters?: RainbowKitWalletConnectParameters;
}

/** Add this factory directly to connectorsForWallets({ wallets: [...] }). */
export function robinhoodWallet(options: RobinhoodWalletOptions): Wallet {
  const supplied = options.walletConnectParameters?.metadata;
  const metadata: ProviderMetadata = {
    name: supplied?.name ?? options.appName ?? 'Application',
    description: supplied?.description ?? options.appDescription ?? '',
    url: supplied?.url || options.appUrl || (typeof window === 'undefined' ? '' : window.location.origin),
    icons: supplied?.icons ?? (options.appIcon ? [options.appIcon] : []),
  };
  return {
    id: ROBINHOOD_WALLET.id,
    name: ROBINHOOD_WALLET.name,
    rdns: ROBINHOOD_WALLET.rdns,
    iconUrl: ROBINHOOD_WALLET.iconUrl,
    iconBackground: '#ccff00',
    downloadUrls: {
      mobile: ROBINHOOD_WALLET.downloadUrl,
      qrCode: ROBINHOOD_WALLET.downloadUrl,
    },
    // The provider owns one native top-layer dialog. Native RainbowKit QR/mobile
    // hooks would start a second view with no public cancellation signal on Back.
    createConnector(walletDetails: WalletDetailsParams) {
      const factory = createRobinhoodConnector({ projectId: options.projectId, metadata, showModal: true });
      return createConnector((config) => ({ ...factory(config), ...walletDetails }));
    },
  };
}

export default robinhoodWallet;
