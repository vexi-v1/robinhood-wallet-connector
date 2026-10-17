# onboard example

Run the package build from the repository root first: `npm install && npm run build`.
Then, from this directory:

```sh
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID to your own WalletConnect project ID.
# Allow this example's origin in that project's dashboard.
npm run dev
```

The project ID is a public application identifier, not a wallet secret. Never enter a recovery phrase or private key. The example requests accounts only when you press Connect. Ethereum mainnet is configured as an example, not as a promise of wallet support. No transaction is sent automatically.

`npm run build` performs a real TypeScript and Vite production build. The repository's framework matrix separately packs and installs the published package layout instead of relying on these local file links.

This example requires explicit reconnection after reload. It does not enable Onboard's automatic connection options, which can call `eth_requestAccounts`; hiding the host modal is not a guarantee of passive restoration. The core provider's `isAuthorized()` is the passive restoration API. The full browser suite verifies that this example never prompts on page load.
