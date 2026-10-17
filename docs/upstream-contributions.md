# Upstream contribution assessment

Assessed **2026-10-17** for **TK-465 / RDR-0097 / F-APP-011**. The owner requested appropriate upstream forks and pull requests where justified. This document records the technical need, public contribution rules, and current delivery state; it does not claim an upstream submission or acceptance.

## Functional integration

All three integrations can be delivered through public extension contracts without changing upstream source:

| Framework | Public integration point | Repository deliverable |
| --- | --- | --- |
| wagmi | `createConnector` from `@wagmi/core` | `@vexi/robinhood-wallet-wagmi` |
| RainbowKit | A custom `Wallet` factory passed to `connectorsForWallets` | `@vexi/robinhood-wallet-rainbowkit` |
| Web3-Onboard | An independently supplied `WalletInit` module | `@vexi/robinhood-wallet-onboard` |

The independent SDK owns its transport and connection dialog. No demonstrated framework defect requires a fork or patch for these extension points. A fork would therefore serve a future upstream submission, rather than being a runtime dependency of the SDK.

## Upstream requirements and assessment

### wagmi

The [connector contribution guide](https://wagmi.sh/dev/creating-connectors) requires a connector request before a proposed built-in connector and states that the contributing team must sponsor wagmi. It also expects maintenance ownership, tests, documentation, and a changeset. These are upstream acceptance conditions; they do not prevent applications from using this independent connector.

Assessment: deliver and validate the external adapter first. A built-in `@wagmi/connectors` contribution needs the maintainers' acceptance of the request and an actual sponsorship/maintenance arrangement. Neither sponsorship nor upstream approval has been established by this work. Do not submit a patch that implies Robinhood itself owns or endorses this community SDK.

### RainbowKit

RainbowKit documents [custom wallets](https://rainbowkit.com/docs/custom-wallets), while warning that the custom wallet API may change. Its [contribution guide](https://github.com/rainbow-me/rainbowkit/blob/main/.github/CONTRIBUTING.md) requests a feature discussion before adding new wallets or other significant features.

Assessment: the external custom wallet already supplies the requested entry and dedicated connection flow. A built-in entry should follow maintainer discussion and establish a distributable dependency, maintenance owner, and device evidence. The SDK intentionally does not depend on private RainbowKit Back-navigation state; no private-controller patch is proposed.

### Web3-Onboard

The [contribution guide](https://web3onboard.thirdweb.com/docs/overview/contribution-guide) explicitly permits separate wallet modules without changing its main code. Official module contributions target `develop` and include a package README, documentation/demo updates, and the required version/checklist work.

Assessment: a standalone module is sufficient for application integration. An official module PR is a plausible later contribution once the dependency is publicly installable and physical-device evidence is available. The current unpublished packages cannot be added as public registry dependencies for an upstream consumer.

## Current state and next decision

The SDK packages are unpublished, and the repository has no recorded public package release or physical-wallet certification. No upstream fork, issue, pull request, sponsorship commitment, or acceptance is claimed by this assessment. A reviewable PR to the independent SDK's own repository is separate from an external upstream submission.

Before pursuing built-in upstream distribution, assemble the package release identifier, exact peer compatibility report, real-device evidence, owner/maintenance contact, and the maintainer discussion required by the target project. Then prepare only the contribution accepted in that scope. Repository access and dependency availability must allow upstream maintainers and CI to reproduce it.

No external message or package publication is performed by this document. The root delivery coordinator retains the decision to create any justified fork or contribution using the owner's authorized scope and the recorded evidence.
