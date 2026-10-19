import { robinhoodWallet } from '@vexi/robinhood-wallet-thirdweb';
import type { Wallet } from 'thirdweb/wallets';
import type { RobinhoodProviderOptions } from '@vexi/robinhood-wallet';
export function contract(options: RobinhoodProviderOptions) {
  const wallet = robinhoodWallet(options);
  const compatible: Wallet = wallet;
  wallet.cancelConnect();
  return compatible;
}
