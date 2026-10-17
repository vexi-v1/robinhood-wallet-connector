import { BrowserProvider, type Eip1193Provider, type JsonRpcSigner } from 'ethers';
import { RobinhoodProvider, type RobinhoodProviderOptions } from '@vexi/robinhood-wallet';

// Compile-only contracts; no permission or signing request runs during a build.
export async function publicEthersContract(options: RobinhoodProviderOptions) {
  const provider = new RobinhoodProvider(options);
  const eip1193: Eip1193Provider = provider;
  const client = new BrowserProvider(eip1193, 'any');
  await provider.connect();
  const signer: JsonRpcSigner = await client.getSigner();
  await provider.disconnect();
  client.destroy();
  provider.destroy();
  return signer;
}
