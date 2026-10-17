import { robinhoodWalletConnectors } from '@vexi/robinhood-wallet-dynamic';
import type { DynamicContextProps } from '@dynamic-labs/sdk-react-core';
import type { RobinhoodProviderOptions } from '@vexi/robinhood-wallet';
export function contract(options: RobinhoodProviderOptions): DynamicContextProps['settings'] {
  return { environmentId: 'synthetic', walletConnectors: [robinhoodWalletConnectors(options)], initialAuthenticationMode: 'connect-only' };
}
