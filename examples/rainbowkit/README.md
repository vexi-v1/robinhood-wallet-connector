# rainbowkit example

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

The status line uses wagmi's connection status, including `reconnecting` during reload recovery. A cached account button can appear before recovery finishes; wait for `connected` before treating the connection as ready. Use the native RainbowKit account menu to disconnect.

The generic Browser Wallet entry uses a targetless wagmi injected connector, retaining RainbowKit's name and icon. It restores only after that entry was explicitly connected. RainbowKit's default generic entry targets the detected provider and can otherwise restore the same injected approval alongside the Robinhood connector, leaving a second active connection after Robinhood disconnects. The WalletConnect entry remains available. Packed tests cover both Robinhood-only approval and explicit generic-wallet connection.
