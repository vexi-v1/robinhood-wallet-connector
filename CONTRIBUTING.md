# Contributing

This repository contains the provider, connection UI, framework adapters, examples and tests. You can develop it from a single checkout.

For integration help, start with [llms.txt](llms.txt) and the [AI integration guide](docs/ai-integration.md).

## Set up a checkout

Use Node.js 22.12 or newer and npm. CI runs the build, type check and unit tests on Node.js 22.12.0 and 24, and the packed framework matrix on 24.

```sh
git clone https://github.com/vexi-v1/robinhood-wallet-connector.git
cd robinhood-wallet-connector
npm ci
npm run build
npm run typecheck
npm test
```

The packages are currently unpublished. For installation in another application, follow the [tarball installation guide](README.md#install-from-this-repository).

## Repository layout

| Directory | Contents |
| --- | --- |
| `packages/core` | EIP-1193 provider, discovery, WalletConnect transport and connection dialog |
| `packages/wagmi` | wagmi v2/v3 connector |
| `packages/rainbowkit` | RainbowKit wallet entry |
| `packages/web3-onboard` | Web3-Onboard wallet module |
| `examples` | Vanilla, wagmi v2/v3, RainbowKit and Onboard applications |
| `tests` | Synthetic provider, transport, modal and framework consumer checks |
| `scripts/framework-matrix.mjs` | Packed-package compatibility checks |
| `docs` | Architecture, verification records, dependency notes and upstream contribution guidance |
| `llms.txt` | Curated documentation index for AI agents |
| `llms-full.txt` | Generated full-text integration documentation |
| `scripts/llms-docs.mjs` | Documentation bundle generation, freshness and link checks |

Rebuild the packages after changing their source; examples consume their generated exports.

## Run an example

After the root build, enter the example directory and follow its README. For example:

```sh
cd examples/wagmi-v3
npm install
cp .env.example .env.local
# Set VITE_WC_PROJECT_ID in .env.local to your WalletConnect project ID.
npm run dev
```

Allow the example's actual origin in your WalletConnect project settings, then restart the dev server after changing environment variables. The project ID is a public application identifier. Never enter a recovery phrase or private key.

The vanilla example also provides `fixture.html`, which uses a synthetic transport for layout and keyboard checks without a live project ID. Its QR cannot pair a wallet. See the [vanilla example](examples/vanilla/README.md) for details.

## Validate a change

For provider or adapter changes, run the root build, type check and unit tests above. The type check also covers the test files. Test the affected integrations against packed packages:

```sh
node scripts/framework-matrix.mjs
# Or select one or more cases:
node scripts/framework-matrix.mjs wagmi-v2 wagmi-v3
```

Available cases are `wagmi-v2`, `wagmi-v3`, `rainbowkit` and `onboard`. The script downloads real npm framework dependencies into separate temporary applications, builds them, and runs synthetic lifecycle tests. It prints the location of `report.json` and the install/build/test logs. These checks do not need a live WalletConnect project ID or an approved wallet.

Add regression coverage when changing connection behavior, particularly cancellation, late results, session recovery, account/chain events and teardown. Browser presentation changes also need desktop and narrow-viewport checks. Use the [verification guide](docs/verification.md) to record what was actually tested; a rendered QR does not prove successful mobile pairing.

For documentation-only changes, check links, examples, JSON records and whitespace. A full wallet test run is unnecessary when executable code and package configuration are unchanged.

## Maintain the AI documentation

Documentation is part of the change. Whenever public APIs, options, connection behavior, installation, package versions, supported frameworks, publication status or verification claims change, update the affected guides in the same PR and review `llms.txt` and `docs/ai-integration.md`. If their content remains accurate, explain that in the PR checklist.

`llms.txt` is a short, curated map with direct text links. `llms-full.txt` is generated from the canonical guides listed in `scripts/llms-docs.mjs`; edit those guides instead of the generated file. Include new or moved documentation in the index and bundle source list when relevant, then run:

```sh
npm run docs:generate
npm run docs:check
```

Commit the resulting `llms-full.txt` update with its source changes. The documentation commands use Node.js built-ins and do not require installing wallet dependencies. CI rejects stale generated content and broken local or same-repository documentation links. It does not establish that external websites are reachable or that an API description matches runtime behavior; review those separately.

Keep the README's agent entry points prominent and package keywords and GitHub About accurate. Publishing an index improves navigation; it does not guarantee search ranking or automatic adoption by an AI service.

## Submit a pull request

Create a focused branch and describe the problem, resulting behavior and checks you ran. Keep code, comments and public text in English. Update the relevant API documentation and examples when their behavior changes. Discuss substantial API or dependency changes in a repository issue before implementing them.

Keep credentials and wallet pairing material out of commits, logs and screenshots. Preserve third-party license and asset attribution. Consult the [dependency notes](docs/dependency-notes.md) before changing framework versions, and the [upstream contribution guide](docs/upstream-contributions.md) when proposing an integration to another project.
