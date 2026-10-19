import { createWalletClient, custom, type Address } from 'viem';
import { RobinhoodProvider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

export async function publicViemContract(options: RobinhoodProviderOptions) {
  const provider = new RobinhoodProvider(options);
  const client = createWalletClient({ transport: custom(provider, { retryCount: 0 }) });
  const accounts: readonly Address[] = await client.requestAddresses();
  const chainId: number = await client.getChainId();
  await provider.disconnect();
  provider.destroy();
  return { accounts, chainId };
}
