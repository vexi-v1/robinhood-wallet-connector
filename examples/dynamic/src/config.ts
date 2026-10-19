import { robinhoodWalletConnectors } from '@vexi/robinhood-wallet-dynamic';
import type { RobinhoodProviderOptions } from '@vexi/robinhood-wallet';
import type { DynamicContextProps } from '@dynamic-labs/sdk-react-core';

export function createSettings(environmentId: string, options: RobinhoodProviderOptions): DynamicContextProps['settings'] {
  return {
    environmentId,
    initialAuthenticationMode: 'connect-only',
    walletConnectors: [robinhoodWalletConnectors(options)],
  };
}
