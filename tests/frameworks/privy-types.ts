import { createRobinhoodPrivyLogin } from '@vexi/robinhood-wallet-privy';
import type { RobinhoodProvider } from '@vexi/robinhood-wallet';
import type { useLoginWithSiwe, usePrivy } from '@privy-io/react-auth';
export function contract(provider: RobinhoodProvider, siwe: ReturnType<typeof useLoginWithSiwe>, auth: ReturnType<typeof usePrivy>) {
  return createRobinhoodPrivyLogin(provider, { ...siwe, logout: auth.logout });
}
