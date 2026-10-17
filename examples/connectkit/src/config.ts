import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { robinhoodWalletForConnectKit } from '@vexi/robinhood-wallet-wagmi';
import type { RobinhoodWalletParameters } from '@vexi/robinhood-wallet-wagmi';

export function createWalletConfig(options: RobinhoodWalletParameters) {
  return createConfig({
    chains: [mainnet],
    connectors: [robinhoodWalletForConnectKit(options), injected()],
    transports: { [mainnet.id]: http() },
    ssr: true,
  });
}
