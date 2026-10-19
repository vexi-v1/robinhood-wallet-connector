# Robinhood Wallet with ConnectKit

Use `robinhoodWalletForConnectKit` from the existing `@vexi/robinhood-wallet-wagmi` package in the wagmi configuration supplied to ConnectKit. The chooser reads the connector's name and icon; the core SDK owns remote pairing. No additional SDK adapter package is required.

Baseline: `connectkit` **1.9.2**, React / React DOM **18.3.1**, `wagmi` **2.19.5**, `@wagmi/core` **2.22.1**, `viem` **2.57.7**. ConnectKit 1.9.2 declares React 17/18 peers; this example pins React 18 and does not claim React 19 or wagmi v3 compatibility.

## Run the example

From the repository root:

```sh
npm ci
npm run build
cd examples/connectkit
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID, allow this origin in the project settings, then:
npm run dev
```

For a separate application, install the unpublished SDK tarballs together using the [installation guide](../../README.md#install-from-this-repository). The `file:` dependencies here are for development from this checkout, not npm registry releases.

## Integration

```tsx
import { createConfig, http, WagmiProvider } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitButton, ConnectKitProvider } from 'connectkit';
import { robinhoodWalletForConnectKit } from '@vexi/robinhood-wallet-wagmi';

const config = createConfig({
  chains: [mainnet],
  connectors: [
    robinhoodWalletForConnectKit({
      projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
      metadata: { name: 'My app', description: 'My app description', url: 'https://my-app.example', icons: [] },
    }),
    injected(),
  ],
  transports: { [mainnet.id]: http() },
  ssr: true,
});
const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });

export function App() {
  return <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <ConnectKitProvider><ConnectKitButton showBalance={false}/></ConnectKitProvider>
    </QueryClientProvider>
  </WagmiProvider>;
}
```

The helper reuses `robinhoodWallet` and classifies it as `type: 'injected'` for ConnectKit 1.9.2's EIP-1193 connection screen. This is a chooser routing hint, not evidence that the wallet is installed. Its provider still discovers only Robinhood metadata and otherwise opens the SDK's remote dialog. Passing the general `robinhoodWallet` factory directly leaves this ConnectKit chooser in its unavailable state. No upstream source or private wallet catalog is patched.

Keep the application's other connector factories alongside Robinhood when constructing its wagmi config. If using `getDefaultConfig`, pass the combined connector list deliberately: supplying `connectors` overrides that helper's defaults. Do not rename `injected()` or a generic WalletConnect entry to Robinhood. The [configuration](src/config.ts) and [React app](src/main.tsx) retain an ordinary injected entry alongside Robinhood.

Leave the SDK's modal enabled. Selecting Robinhood opens its dialog; Close or Escape cancels the pending request. The chooser may display its rejection state afterward; use its retry or select Robinhood again. Do not create a second pairing UI or depend on ConnectKit's private route state. Account changes, disconnect and restored sessions use wagmi's normal state. For server-rendered applications, retain the framework's client-component boundary and use explicit metadata URLs.

Upstream reference: [ConnectKit setup and provider order](https://family.co/docs/connectkit/getting-started).

## Verification boundary

Run `node scripts/framework-matrix.mjs connectkit` from the repository root to install packed SDK tarballs with the exact dependencies in this example, compile its public types, build it and run synthetic lifecycle checks. See the [verification record](../../docs/verification.md) for completed results. Do not infer support for other versions, frameworks, networks or physical wallets.

Connection does not request a signature or send a transaction. Real iOS/Android pairing, handoff and signing remain unverified. Keep pairing material and account information out of logs, screenshots and analytics. This is a community integration, not an official Robinhood SDK or endorsement.
