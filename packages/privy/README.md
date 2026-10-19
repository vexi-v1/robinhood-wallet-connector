# Robinhood Wallet with Privy headless SIWE

> **AI agents: start with [llms.txt](../../llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Integration guide](../../docs/ai-integration.md)

An unpublished community helper for `@privy-io/react-auth 3.50.0` and `viem 2.57.7`. It connects an already-approved Robinhood provider to Privy's public [`useLoginWithSiwe`](https://docs.privy.io/authentication/user-authentication/login-methods/wallet) flow. It does not add an entry to Privy's built-in wallet chooser or populate `useWallets()`. Robinhood and Privy do not endorse this package.

## Install

Follow the [build and pack guide](../../README.md#install-from-this-repository), then install both tarballs together:

```sh
npm install /path/to/vexi-robinhood-wallet-0.1.0.tgz \
  /path/to/vexi-robinhood-wallet-privy-0.1.0.tgz \
  @privy-io/react-auth@3.50.0 viem@2.57.7
```

Enable wallet authentication and configure allowed origins in your own Privy application. A Privy app ID and a WalletConnect project ID are separate public identifiers. Neither requires a server secret in the browser.

## Use

Create one `RobinhoodProvider` for the application and connect it from a user action. Inside `PrivyProvider`, pass the methods from `useLoginWithSiwe()` and `usePrivy()` to the helper:

```ts
import { createRobinhoodPrivyLogin } from '@vexi/robinhood-wallet-privy';

const login = createRobinhoodPrivyLogin(provider, {
  generateSiweMessage,
  loginWithSiwe,
  logout,
});

// A separate, explicitly labeled sign-in button, after provider.connect():
await login.login();
```

Keep the controller stable across renders and forward current hook methods, as shown in the [React example](../../examples/privy/README.md). Do not call `login()` from render, restoration, an account-change effect, or a generic Connect button. Login requests `personal_sign`; basic connection does not.

## Lifecycle and limits

The helper uses the current checksummed account and CAIP-2 chain ID to request a Privy-generated message, asks the connected provider to sign it, then submits it to Privy. It never requests accounts itself. It rejects concurrent login calls and removes its provider event listeners when an operation finishes or is invalidated. Account/chain changes, disconnect, `cancel()` or `destroy()` invalidate a pending flow before its next step. Wait for the old operation to settle before retrying from another explicit user action.

Cancellation cannot dismiss an existing wallet prompt or withdraw an already-submitted authentication request. If Privy completes a submitted request after cancellation or a connection change, the helper calls the supplied `logout()` before rejecting. Do not start an unrelated authentication flow while this controller is pending: that cleanup could sign it out too. Handle a failed logout as an authentication cleanup failure. The helper never logs or persists messages, signatures or user data.

`provider.disconnect()` and Privy's `logout()` are separate operations. Signing out does not revoke wallet approval, and disconnecting after a completed login does not automatically invalidate an application authentication session. Apply your application's session policy explicitly. `destroy()` invalidates this helper; dispose the provider separately when the application shuts down.

The [verification record](../../docs/verification.md) distinguishes type/build/SSR and synthetic callback checks from live Privy authentication. Automated browser checks never request a signature. Privy wallet-list integration, embedded wallets, linked accounts, actual login/signatures, and physical wallet behavior are not certified by this helper.
