# Contributing framework integrations

Applications can integrate this SDK through each framework's public extension API. This guide explains when a separate contribution to a framework may be useful and how to prepare one. The contribution requirements and package status below were reviewed on **2026-10-17**; check the linked upstream guides before submitting a change.

## Functional integration

The integrations use public extension contracts without changing upstream source:

| Framework | Public integration point | Repository deliverable |
| --- | --- | --- |
| wagmi | `createConnector` from `@wagmi/core` | `@vexi/robinhood-wallet-wagmi` |
| RainbowKit | A custom `Wallet` factory passed to `connectorsForWallets` | `@vexi/robinhood-wallet-rainbowkit` |
| Web3-Onboard | An independently supplied `WalletInit` module | `@vexi/robinhood-wallet-onboard` |
| AppKit | Custom wagmi connector in `WagmiAdapter` | [Example](../examples/appkit/README.md), existing wagmi package |
| ConnectKit | `robinhoodWalletForConnectKit` in the config consumed by `ConnectKitProvider` | [Example](../examples/connectkit/README.md), existing wagmi package |
| ethers v6 / viem | `BrowserProvider` / `custom` with EIP-1193 | [ethers](../examples/ethers/README.md) and [viem](../examples/viem/README.md) examples, existing core package |
| thirdweb | Public Wallet interface and EIP-1193 adapter | [Adapter](../packages/thirdweb/README.md), custom React connection button |
| Dynamic React | Public EthereumWalletConnector base and walletConnectors factory | [Adapter](../packages/dynamic/README.md), connect-only example |
| Privy | Public useLoginWithSiwe headless API | [Helper](../packages/privy/README.md), separate sign-in action; no built-in wallet-list entry |

The SDK supplies its own transport and connection dialog. Applications do not need to fork a framework to use these adapters.

## Preparing an upstream contribution

### wagmi

The [connector contribution guide](https://wagmi.sh/dev/creating-connectors) requires a connector request before a proposed built-in connector and states that the contributing team must sponsor wagmi. It also expects maintenance ownership, tests, documentation, and a changeset. These are upstream acceptance conditions; they do not prevent applications from using this independent connector.

A built-in `@wagmi/connectors` contribution should begin with the connector request and the sponsorship and maintenance arrangements required by wagmi. Include tests against the supported wagmi versions and explain how cancellation, reconnection, and account events behave. Describe this package as a community SDK without implying Robinhood ownership or endorsement.

### RainbowKit

RainbowKit documents [custom wallets](https://rainbowkit.com/docs/custom-wallets), while warning that the custom wallet API may change. Its [contribution guide](https://github.com/rainbow-me/rainbowkit/blob/main/.github/CONTRIBUTING.md) requests a feature discussion before adding new wallets or other significant features.

For a built-in wallet entry, start with the maintainer discussion and provide a distributable dependency, a maintainer contact, and real-device evidence. Preserve the SDK's cancellation behavior: the custom wallet uses its own dialog because RainbowKit's Back navigation does not expose a public cancellation signal for this pending proposal. Avoid depending on private RainbowKit controller state.

### Web3-Onboard

The [contribution guide](https://web3onboard.thirdweb.com/docs/overview/contribution-guide) explicitly permits separate wallet modules without changing its main code. Official module contributions target `develop` and include a package README, documentation/demo updates, and the required version/checklist work.

A standalone module is sufficient for application integration. An official module contribution should provide a publicly installable dependency and real-device evidence, then follow the upstream package, documentation, and release requirements. An unpublished package cannot be added as a public registry dependency for an upstream consumer.

## Release and verification status

As of the review date, the SDK packages are unpublished and physical-wallet certification has not been established. No upstream submission, sponsorship commitment, or acceptance is recorded here. Changes merged into this repository do not establish acceptance by a framework or by Robinhood.

Before proposing built-in distribution, prepare:

- A publicly installable package version and reproducible setup instructions.
- The exact framework versions tested, with the compatibility results described in [verification](verification.md).
- Real-device results for connection, cancellation, retry, reconnection, and supported chain behavior.
- A maintainer contact and the discussion or request required by the target project.

Keep the contribution within the scope agreed with the framework maintainers, and make sure their CI can install every dependency and reproduce the checks.
