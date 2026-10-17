# Verification record

Verification recorded on **2026-10-17**. The original delivery was verified at source `f6958cf6798c0c7e35961e2ee2779af855239249`, merged as `c117311a621af2f7819bdf6a407115733feccd3e` with an identical Git tree. The AI follow-up review changes were verified on their own tree before merge; rows and sections marked follow-up refer to those checks. A command listed under reproduction is an instruction, not evidence that it has passed.

The repository was subsequently renamed to `vexi-v1/robinhood-wallet-connector`, and repository URLs were corrected in package metadata and documentation. Provider and adapter source did not change. Recorded tarball hashes identify the tested artifacts before that metadata correction; newly packed artifacts can have different hashes.

## Recorded checks

| Check | Recorded outcome | Evidence boundary |
| --- | --- | --- |
| All four SDK packages | **Build passed** | TypeScript build of core and three adapters. |
| Core behavioral suite | **63 passed** | Follow-up: discovery 5, modal 13, provider 27, transport 16, storage 2; synthetic EIP-1193 / SignClient fixtures and JSDOM. `npm run typecheck` also type-checks the test files. Passed on Node.js 24.19.0 and on the declared minimum, 22.12.0. The original delivery recorded 40. |
| Packed framework consumers | **4 builds/type contracts and 21 runtime tests passed** | Follow-up, fresh installs of real wagmi v2/v3, RainbowKit and Onboard packages: wagmi v2 5, wagmi v3 5, RainbowKit 7, Onboard 4. Current [tarball hashes and versions](evidence/2026-10-17/follow-up-review.json); the original delivery run (4 builds, 14 runtime tests) is in the [matrix evidence](evidence/2026-10-17/framework-matrix.json). |
| Actual browser flow | **Passed within the scope below** | Original delivery: local examples in a Chromium browser with a real relay proposal and no wallet approval. Follow-up: headless Chromium on the synthetic fixture and on production framework builds with all non-local network blocked. |
| AI code review | **No remaining actionable blocker in reviewed paths** | Cancellation, session ownership, account permissions, asynchronous switching and event reentrancy; regressions recorded in [review evidence](evidence/2026-10-17/review.json). |
| AI follow-up review | **26 confirmed issues fixed; 7 remaining items recorded** | One primary and two independent AI reviews of the core and adapters against real framework and WalletConnect source. Each fix has a regression test or browser measurement, listed in the [follow-up evidence](evidence/2026-10-17/follow-up-review.json). Not a human approval or security audit. |
| Dependency audit | **Core and wagmi v3: zero reported findings; legacy frameworks have findings** | Onboard includes inherited critical findings. See [dependency notes](dependency-notes.md); this is not a security certification. |
| Embedded icon hash | **Matched** recorded SHA-256 | See [asset provenance](architecture.md#asset-provenance). |
| Real mobile wallet pairing, signatures, transactions | **Not performed** | No physical-device or chain certification. |
| npm publication, external upstream acceptance, deployment | **Not performed** | Repository delivery does not establish these states. |

The original delivery's final core tarball SHA-256 was `e635001e95f65fa43bb2fad1831a97b56f6c28af1a6feb6e18f79617ba9d7335`. The follow-up's core tarball SHA-256, packed with the corrected repository metadata, is `b8d7bbc700c994c9fde7daf871eaacbe6cca5a6952512cf7bec8a805238429cc`; adapter hashes and environment versions are in the follow-up evidence. No real pairing URI, session key, account address, or wallet approval is included in the committed evidence.

## Reproduce local checks

```sh
npm ci
npm run build
npm run typecheck
npm test
node scripts/framework-matrix.mjs
```

The framework matrix writes `report.json` plus installation, build, and runtime logs into its printed temporary directory. It packs all SDK packages, computes tarball hashes, creates isolated consumer applications, installs real framework packages, type-checks/builds the examples, and runs synthetic provider lifecycle tests. Its nonempty synthetic project ID keeps connector code in the production bundle; it is not a usable relay credential.

Declared framework baselines are wagmi `2.19.5` / core `2.22.1`, wagmi `3.7.7` / core `3.6.5`, RainbowKit `2.2.11` with wagmi v2, and Web3-Onboard core `2.24.1` / common `2.4.2`. Viem is `2.57.7`. Exact resolved versions and artifacts belong in the final matrix report.

## Observed browser checks

The [browser record](evidence/2026-10-17/browser.json) separates synthetic layout checks from actual relay initialization. Screenshots use a deliberately inert fixture QR and must never be used for wallet pairing.

### Follow-up checks

These ran after the follow-up fixes in headless Chrome for Testing 153. The synthetic fixture page was also served with an aggressive host stylesheet and with `Content-Security-Policy: style-src 'self'`. The framework pages are the packed-consumer production builds, with every request and WebSocket to a host other than `127.0.0.1` blocked. Details are in the [follow-up evidence](evidence/2026-10-17/follow-up-review.json).

| Scenario | Before the fixes | After the fixes |
| --- | --- | --- |
| Fixture, 390×844 and 320×640 | QR displayed 240×280 (squashed); close icon off-center by (9, 7) px from the example's own `button` CSS | QR 240×240; icon centered; backing canvas 840 px at 3× |
| Fixture, 1280×720 at 2× | QR backing canvas 280 px (upscaled) | 560 px |
| Hostile host CSS | QR shrunk to 40×40, title recolored, text uppercased, close button overflowing | No host style reaches the dialog |
| `style-src 'self'` policy | Inline `<style>` blocked; dialog unstyled | No violation; fully styled |
| Keyboard | Covered by unit tests | Initial focus on Close; Tab and Shift+Tab cycle inside the dialog; background inert; Close and Escape restore focus to Connect |
| RainbowKit build, network blocked | Not run | One SDK top-layer dialog over the chooser, which cannot take focus; Escape closes only the SDK dialog; RainbowKit's Retry opens a fresh one |
| Web3-Onboard build, network blocked | Not run | SDK dialog opens; Escape leads to Onboard's "Connection Rejected! Click here to try again" |
| wagmi v3 build at 390×844, network blocked | Not run | Escape returns to disconnected with focus on Connect |

On the wagmi v3 page, which loads only this SDK's connector, the only blocked host was the WalletConnect relay WebSocket. The WalletConnect telemetry and AppKit configuration hosts appeared only on the RainbowKit page, which also includes RainbowKit's own WalletConnect connector.

### Original delivery checks

The checks below were recorded on 2026-10-16 against the original delivery, before the follow-up changes, and were not repeated afterward. The real-relay rows need a project ID and should be re-run before relying on them for the current dialog.

| Scenario | Observed result |
| --- | --- |
| Desktop and narrow fixture | One native top-layer dialog; local canvas QR; Robinhood name, app action, copy and help controls; no horizontal page or dialog overflow. Narrow layout uses a bottom sheet. |
| Fixture keyboard cancellation | Escape closes the dialog, returns the provider to idle and restores focus to the Connect button after its disabled state clears. Focus wrap and stale completion are also covered by modal tests. |
| Vanilla real relay | Ready QR and native Robinhood app action appeared. Cancel rejected the attempt; another Connect produced a fresh ready dialog. |
| RainbowKit real relay | Robinhood appears first in the Recommended group. Selecting it opens the SDK top-layer dialog, making the host chooser inert. Escape returns to the host chooser; its Retry action opens a fresh ready SDK dialog. Closing the chooser returns focus to Connect Wallet. |
| Web3-Onboard real relay | Selecting the module opens the ready SDK dialog. Expiry clears pairing data and shows an actionable error. Close/ Escape returns to the host rejection state; Back to wallets and the host Retry action both lead to a fresh ready SDK dialog. |
| wagmi v3 real relay | Connect opens the ready SDK dialog. Escape returns to disconnected; another Connect opens a fresh ready dialog. The final host focus refinement restores focus to Connect after cancellation and both wagmi examples passed renewed type/build checks. |

The screenshots below were recaptured after the follow-up fixes; the earlier versions, which show the squashed narrow QR and off-center close icon, remain in the repository history.

![Desktop fixture with inert QR](evidence/2026-10-17/desktop-fixture.jpg)

![Narrow fixture with inert QR](evidence/2026-10-17/mobile-fixture.jpg)

## Physical-device validation remains separate

For manual device testing, record the device model, OS, browser, Robinhood Wallet version, app origin, connector commit/tarball hash, and tested chain for each result. Use a dedicated test wallet and do not put addresses, pairing URIs, session keys, or signing material in public evidence.

1. Desktop QR to real iOS and Android wallet: scan, approve, verify account/chain result, reject, cancel, timeout, and retry. Record the error code the host receives for a wallet rejection; the SDK reports WalletConnect's `USER_REJECTED` as `4001`.
2. Same-device app handoff: explicit app-link click, successful return to the dapp, and browser behavior when the wallet is not installed. Note whether a later signing request needs a manual switch back to the wallet; the SDK does not reopen the app for requests.
3. Injected Robinhood in-app browser: discovery, user-triggered permission request, account changes, and rejected/removed authorization. With RainbowKit, confirm that connecting on a non-default configured chain shows no switch prompt.
4. Reload recovery and disconnect: recover only the intended prior approval, including through a Connect action after reload, without a new pairing; disconnect removes it; stale approval cannot revive a cancelled request.
5. Each intended network: approve it, verify actual chain selection, and exercise supported switch/rejection behavior. For WalletConnect, a switch between chains the session approved is local and shows no wallet prompt; confirm the wallet honors the next request on the selected chain. Record each mainnet and testnet separately.
6. Signing and transactions: connection checks do not require either operation. If you test them separately, use a dedicated test wallet, review every wallet prompt, and record the exact method, expected outcome and network.

Until that evidence exists, this project must not advertise physical-wallet certification or universal EVM/Robinhood Chain support.
