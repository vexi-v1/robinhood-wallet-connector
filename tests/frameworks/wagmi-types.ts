import { createConfig, connect, disconnect, http } from '@wagmi/core';
import { mainnet } from 'viem/chains';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';

const connector = robinhoodWallet({
  projectId: '00000000000000000000000000000000',
  metadata: { name: 'Type contract', description: '', url: 'https://example.test', icons: [] },
});
const config = createConfig({ chains: [mainnet], connectors: [connector], transports: { [mainnet.id]: http() }, ssr: true });

// Compile-only contracts. Do not call this function: runtime tests use a synthetic provider.
export async function publicWagmiContract() {
  const connection = await connect(config, { connector });
  const address: `0x${string}` = connection.accounts[0];
  const capable = await connect(config, { connector, withCapabilities: true });
  const capableAddress: `0x${string}` = capable.accounts[0].address;
  await disconnect(config);
  return [address, capableAddress];
}
