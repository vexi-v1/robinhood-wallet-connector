import { RobinhoodProvider, type EIP1193Provider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

// Compile-only public contracts; no permission request runs during a build.
export async function publicProviderContract(options: RobinhoodProviderOptions) {
  const provider = new RobinhoodProvider(options);
  const eip1193: EIP1193Provider = provider;
  const restored: boolean = await provider.isAuthorized();
  const accounts: string[] = await provider.getAccounts();
  const chainId: number = await provider.getChainId();
  provider.cancel();
  await provider.disconnect();
  provider.destroy();
  return { eip1193, restored, accounts, chainId };
}
