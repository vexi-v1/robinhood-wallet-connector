# Robinhood Wallet Connector

> **AI agents: start with [llms.txt](llms.txt).** [Raw text](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) · [Full documentation](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms-full.txt) · [Integration guide](docs/ai-integration.md)

**Connect Robinhood Wallet to mainstream frontend wallet SDKs.**

An open-source integration toolkit for dApp developers, with adapters for **wagmi v2/v3, RainbowKit, and Web3-Onboard**, integrations for **AppKit and ConnectKit** through wagmi, and **ethers v6 and viem** through a framework-independent **EIP-1193 provider**. Additional adapters cover **thirdweb**, **Dynamic React**, and **Privy headless SIWE**. Use it to add a recognizable Robinhood Wallet entry and a dedicated connection dialog to your application.

Built and maintained by **[Vexi Lab](https://vexi-protocol.ai) (an onchain options protocol)**. This is an independent community project, **not an official Robinhood SDK**, and is not affiliated with or endorsed by Robinhood.

A matching injected Robinhood provider is used when available; otherwise, the SDK offers a QR code and an explicit **Open Robinhood Wallet** action through WalletConnect. Each integration includes usage documentation and a runnable example below.

## Packages

| Package | Purpose | Integration |
| --- | --- | --- |
| `@vexi/robinhood-wallet` | Framework-independent EIP-1193 provider and connection UI | [Core API](packages/core/README.md) |
| `@vexi/robinhood-wallet-wagmi` | wagmi connector | [Guide](packages/wagmi/README.md) · [v2 example](examples/wagmi-v2) · [v3 example](examples/wagmi-v3) |
| `@vexi/robinhood-wallet-rainbowkit` | Robinhood entry for `connectorsForWallets` | [Guide](packages/rainbowkit/README.md) · [Example](examples/rainbowkit) |
| `@vexi/robinhood-wallet-onboard` | Standard Web3-Onboard wallet module | [Guide](packages/web3-onboard/README.md) · [Example](examples/onboard) |
| `@vexi/robinhood-wallet-thirdweb` | thirdweb Wallet and React hooks | [Guide](packages/thirdweb/README.md) · [Example](examples/thirdweb) |
| `@vexi/robinhood-wallet-dynamic` | Dynamic custom EVM connector | [Guide](packages/dynamic/README.md) · [Example](examples/dynamic) |
| `@vexi/robinhood-wallet-privy` | Privy headless SIWE helper | [Guide](packages/privy/README.md) · [Example](examples/privy) |

The core owns its connection lifecycle and native HTML dialog. It uses `@walletconnect/sign-client` directly and does not depend on AppKit modal internals or patches to a framework wallet chooser. Construction and imports do not request accounts or launch a wallet.

## AI agent documentation

For coding assistants integrating a Robinhood Wallet connector into a TypeScript or React dApp:

| Start here | What it provides |
| --- | --- |
| [llms.txt](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms.txt) | A compact project summary and direct links to plain-text documentation |
| [Integration guide](docs/ai-integration.md) | Adapter selection, installation, configuration, public entry points and common mistakes |
| [llms-full.txt](https://raw.githubusercontent.com/vexi-v1/robinhood-wallet-connector/main/llms-full.txt) | The integration documentation in a single generated text file |
| [AGENTS.md](AGENTS.md) | Repository contribution rules, including documentation maintenance |

The files are public and can be fetched without a GitHub login. Follow the guide for the framework you use; the documented support matrix and verification limits apply to agent-generated integrations too. When working from a pinned commit, read the documentation from that same commit.

## Install from this repository

These packages have **not been published to npm**. Build and pack the repository, then install the generated tarballs in your application. Node.js 22.12 or newer is required for this development workflow.

```sh
npm ci
npm run build
mkdir -p artifacts
npm pack --workspaces --pack-destination artifacts
```

For a standalone provider, install the core tarball:

```sh
npm install /path/to/artifacts/vexi-robinhood-wallet-0.1.0.tgz
```

Install all required local SDK packages in the **same install command**, so npm can resolve their unpublished dependencies:

| Integration | Required tarballs |
| --- | --- |
| ethers v6 / viem | `vexi-robinhood-wallet-0.1.0.tgz` |
| wagmi / AppKit / ConnectKit | `vexi-robinhood-wallet-0.1.0.tgz`, `vexi-robinhood-wallet-wagmi-0.1.0.tgz` |
| RainbowKit | Core and wagmi tarballs above, plus `vexi-robinhood-wallet-rainbowkit-0.1.0.tgz` |
| Web3-Onboard | Core tarball, plus `vexi-robinhood-wallet-onboard-0.1.0.tgz` |
| thirdweb / Dynamic / Privy | Core tarball, plus the matching `vexi-robinhood-wallet-thirdweb-0.1.0.tgz`, `vexi-robinhood-wallet-dynamic-0.1.0.tgz` or `vexi-robinhood-wallet-privy-0.1.0.tgz` |

For example, in an existing wagmi v2 application:

```sh
npm install \
  /path/to/artifacts/vexi-robinhood-wallet-0.1.0.tgz \
  /path/to/artifacts/vexi-robinhood-wallet-wagmi-0.1.0.tgz \
  wagmi@2.19.5 @wagmi/core@2.22.1 viem@2.57.7
```

Use your own WalletConnect project ID and allow the application origin in its project settings. The project ID is browser configuration; the SDK never needs a private key or recovery phrase.

## Use with wagmi

```ts
import { createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { robinhoodWallet } from '@vexi/robinhood-wallet-wagmi';

export const config = createConfig({
  chains: [mainnet],
  connectors: [robinhoodWallet({
    projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
    metadata: {
      name: 'My app',
      description: 'My app description',
      url: 'https://my-app.example',
      icons: [],
    },
  })],
  transports: { [mainnet.id]: http() },
});
```

Use the resulting connector with wagmi's normal connection hooks or actions. A user selecting **Connect** starts the permission request. The adapter exposes `cancelConnect()` for custom host controls. The runnable examples include the React provider setup.

As with wagmi's built-in connectors, a `chainId` passed to `connect` is a preference: if switching to it fails while the wallet remains connected, the connection stays on the wallet's chain. User rejection, cancellation, disconnection or destruction still rejects the connection attempt. A previously approved session is recovered on reconnect, and by `connect` itself, without a new approval.

## Use with RainbowKit

```ts
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { robinhoodWallet } from '@vexi/robinhood-wallet-rainbowkit';

const connectors = connectorsForWallets([
  { groupName: 'Recommended', wallets: [robinhoodWallet] },
  { groupName: 'Other wallets', wallets: [injectedWallet, walletConnectWallet] },
], {
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID',
  appName: 'My app',
  appUrl: 'https://my-app.example',
});
```

Pass `connectors` to wagmi's `createConfig`. Selecting Robinhood opens the SDK's native modal above the RainbowKit chooser. The underlying page becomes inert while the modal is open; Close or Escape cancels the SDK attempt. After an error, close the dialog and select Robinhood again to start a fresh request. Other wallets remain ordinary RainbowKit entries.

The adapter consumes application metadata from `walletConnectParameters.metadata`; other generic WalletConnect options are not forwarded. RainbowKit can reorder installed and recent wallets according to its own settings.

## Use with Web3-Onboard

```ts
import Onboard from '@web3-onboard/core';
import { robinhoodModule } from '@vexi/robinhood-wallet-onboard';

const onboard = Onboard({
  wallets: [robinhoodModule({ projectId: 'YOUR_WALLETCONNECT_PROJECT_ID' })],
  chains: [{
    id: '0x1',
    token: 'ETH',
    label: 'Ethereum',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
  }],
  appMetadata: { name: 'My app', description: 'My app description', explore: 'https://my-app.example' },
});

// Call from your Connect button's handler.
async function connectWallet() {
  await onboard.connectWallet();
}
```

Onboard supplies the configured chains, RPC endpoints, and application metadata to the module. Its interface exposes the EIP-1193 provider and the same `RobinhoodProvider` as `instance`. When Onboard reconnects through `eth_requestAccounts`, the provider recovers the previously approved session instead of starting a new pairing.

The tested Onboard dependency tree includes inherited critical and high-severity registry advisories. Review the [dependency notes](docs/dependency-notes.md) before adopting this integration; a passing framework test is not a security certification.

## Use with AppKit, ConnectKit, ethers v6 and viem

These integrations reuse the existing packages, connection dialog and session lifecycle. Each guide includes installation instructions and a runnable application.

| Application | Integration | Guide and example |
| --- | --- | --- |
| Reown AppKit + React | Pass `robinhoodWallet(options)` to `new WagmiAdapter({ connectors })`, then share `adapter.wagmiConfig` with `WagmiProvider` | [AppKit](examples/appkit/README.md) |
| ConnectKit + React | Include `robinhoodWalletForConnectKit(options)` in the wagmi configuration wrapped by `ConnectKitProvider` | [ConnectKit](examples/connectkit/README.md) |
| ethers v6, without a React requirement | Wrap the core provider in `new BrowserProvider(provider, 'any')` | [ethers v6](examples/ethers/README.md) |
| viem, without a React requirement | Use `createWalletClient({ transport: custom(provider, { retryCount: 0 }) })` | [viem](examples/viem/README.md) |

AppKit and ConnectKit retain their own wallet choosers; the SDK owns Robinhood pairing and cancellation. The direct ethers/viem examples include user-triggered connection, restoration, state events and cleanup. Do not call ethers `getSigner()` or viem `requestAddresses()` during render or a passive account check: they can request permission.

## Use with thirdweb, Dynamic and Privy

| Platform | Public entry point | Integration |
| --- | --- | --- |
| thirdweb | `robinhoodWallet(options)` from `@vexi/robinhood-wallet-thirdweb` | Standard Wallet with `ThirdwebProvider` and `useConnect`; [guide](packages/thirdweb/README.md) |
| Dynamic React | `robinhoodWalletConnectors(options)` from `@vexi/robinhood-wallet-dynamic` | Custom connector in `DynamicContextProvider.settings.walletConnectors`; [guide](packages/dynamic/README.md) |
| Privy | `createRobinhoodPrivyLogin(provider, handlers)` from `@vexi/robinhood-wallet-privy` | Separate connect and sign-in actions using `useLoginWithSiwe`; [guide](packages/privy/README.md) |

These packages reuse the same core discovery, transport, dialog and session behavior. Dynamic uses connect-only mode in its example. Privy uses headless authentication: it does not add a Robinhood entry to Privy's built-in chooser or populate `useWallets()`. The Privy example requests a signature only after **Sign in with Privy** is explicitly selected. Live authentication remains unverified.

## Framework versions

The SDK peer versions and example dependency versions are pinned to the baselines below. The verification record distinguishes completed checks from pending work; these entries are not broad version-range or physical-wallet compatibility claims.

| Integration | Declared baseline |
| --- | --- |
| wagmi v2 | `wagmi 2.19.5`, `@wagmi/core 2.22.1`, `viem 2.57.7` |
| wagmi v3 | `wagmi 3.7.7`, `@wagmi/core 3.6.5`, `viem 2.57.7` |
| RainbowKit | `@rainbow-me/rainbowkit 2.2.11`, wagmi v2 baseline above |
| Web3-Onboard | `@web3-onboard/core 2.24.1`, `@web3-onboard/common 2.4.2` |
| AppKit React + wagmi | `@reown/appkit 1.8.24`, `@reown/appkit-adapter-wagmi 1.8.24`, wagmi v3 baseline, React `19.3.1` |
| ConnectKit | `connectkit 1.9.2`, wagmi v2 baseline, React / React DOM `18.3.1` |
| ethers v6 | `ethers 6.17.0`, core SDK only |
| viem | `viem 2.57.7`, core SDK only |
| thirdweb | `thirdweb 5.122.0`, React / React DOM `19.3.1` |
| Dynamic React | `@dynamic-labs/sdk-react-core`, `@dynamic-labs/ethereum-core`, `@dynamic-labs/wallet-connector-core` `5.12.0`, viem `2.57.7`, React `19.3.1` |
| Privy headless SIWE | `@privy-io/react-auth 3.50.0`, viem `2.57.7`, React `19.3.1` |

RainbowKit's listed baseline uses wagmi v2. The separate wagmi v3 example does not establish RainbowKit compatibility with wagmi v3.

ConnectKit's baseline uses React 18 to respect its declared peers. AppKit's fresh dependency resolution requires wagmi core v3; its wagmi v2 combination is not supported by this example. AppKit's other adapters/framework bindings and other ethers/viem versions are outside these checks.

## Connection and verification boundaries

The desktop layout presents a locally generated QR code; narrow viewports use a bottom sheet with the same explicit app-opening action. The SDK does not infer that an app is installed from viewport size. It never signs or sends a transaction automatically. A later application request can ask the connected wallet to approve a supported operation.

The dialog renders inside a shadow root, so the host page's CSS cannot restyle its QR code or controls. In browsers with constructable stylesheets it needs no inline `<style>` element, so it also works under a `style-src 'self'` Content Security Policy; the embedded icon still needs `img-src data:`.

Configured EVM chain IDs are application inputs, not proof of wallet support. Remote sessions must approve the requested chain, account, and method. Robinhood Chain mainnet `4663` and testnet `46630` require separate device and network evidence; neither is certified by this delivery.

Physical Robinhood Wallet pairing, iOS/Android app routing, signatures, and transaction submission remain unverified. Synthetic tests, package builds, and a rendered QR code do not establish those outcomes. See [verification](docs/verification.md) for recorded evidence and the device checklist.

## Develop and review

```sh
npx playwright install chromium
npm run test:all
```

The full suite builds and type-checks all seven SDK packages, runs core and documentation checks, then tests all twelve examples as packed consumers and in desktop/narrow browser viewports. The matrix installs real framework dependencies in isolated temporary applications and uses synthetic wallets. It does not request real wallet approval. Use `BROWSER_CHANNEL=chrome npm run test:all` for an installed Chrome browser; see the contributor guide for selected-case commands.

See [architecture](docs/architecture.md), [verification](docs/verification.md), and [upstream assessment](docs/upstream-contributions.md). Package publication, upstream inclusion, deployment, and physical-wallet certification are separate delivery stages.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, examples, compatibility checks and pull request guidance.

## License and wallet identity

Project code is covered by the [MIT license](LICENSE). Robinhood's name, icon, and other third-party marks remain the property of their owners; this license does not grant rights to those marks or imply endorsement. The bundled icon's source and SHA-256 are recorded in [architecture](docs/architecture.md#asset-provenance).
