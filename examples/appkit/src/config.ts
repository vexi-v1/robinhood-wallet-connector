import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet } from '@reown/appkit/networks';
import { http } from 'wagmi';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';
import type { RobinhoodWalletParameters } from '@vexi/robinhood-wallet-wagmi';

// Explicit metadata keeps this configuration usable during server rendering.
export function createAdapter(options: RobinhoodWalletParameters) {
  return new WagmiAdapter({
    projectId: options.projectId,
    networks: [mainnet],
    connectors: [robinhoodWallet(options)],
    transports: { [mainnet.id]: http() },
    ssr: true,
  });
}
