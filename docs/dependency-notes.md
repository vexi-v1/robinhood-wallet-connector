# Dependency audit notes

The 2026-10-17 verification used actual npm tarballs and the exact framework baselines below. Functional builds and lifecycle tests passed, but the framework consumers do not all have clean dependency audits. This is not a security audit or a production-readiness certification.

The sanitized [audit evidence](evidence/2026-10-17/dependency-audit.json) records versions, package hashes, dependency paths, advisory URLs, and counts from `npm audit --json`. Counts include propagated package entries, not unique vulnerabilities or demonstrated exploits. Framework audits include their development dependencies; the standalone core install includes only its runtime dependencies.

| Consumer | Exact baseline | Moderate | High | Critical |
| --- | --- | ---: | ---: | ---: |
| Standalone core | SDK 0.1.0, SignClient 2.26.0, qrcode 1.5.4 | 0 | 0 | 0 |
| wagmi v3 | wagmi 3.7.7, core 3.6.5, Viem 2.57.7 | 0 | 0 | 0 |
| wagmi v2 | wagmi 2.19.5, core 2.22.1, Viem 2.57.7 | 22 | 1 | 0 |
| RainbowKit | RainbowKit 2.2.11 and the wagmi v2 baseline | 24 | 1 | 0 |
| Web3-Onboard | core 2.24.1, common 2.4.2 | 4 | 5 | 3 |

## Inherited framework dependencies

The wagmi v2 and RainbowKit consumers install the broader framework connector dependency tree. Findings include `query-string 7.1.3 → decode-uri-component 0.2.2` ([decoding denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr)), MetaMask SDK/utilities paths containing `uuid 8.3.2` and `9.0.1` ([buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq)), and older WalletConnect/AppKit dependencies containing `viem 2.23.2` / `isows 1.0.6 → ws 8.18.0` ([memory disclosure](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), [memory exhaustion](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)). The SDK's standalone core and the separate wagmi v3 consumer had zero reported findings in these installs.

Web3-Onboard's inherited findings include:

- `@web3-onboard/core 2.24.1 → bnc-sdk 4.6.9 → crypto-es 1.2.7`: a [critical PBKDF2 advisory](https://github.com/advisories/GHSA-mpj8-q39x-wq5h). The three critical package entries include propagation through the dependency chain.
- `@web3-onboard/core 2.24.1` and `@web3-onboard/common 2.4.2 → joi 17.9.1`: [regular-expression denial of service](https://github.com/advisories/GHSA-6h2x-m376-mqjq), plus the additional advisory entries preserved in the evidence.
- Onboard's `viem 2.12.0 → ws 8.13.0`: [HTTP-header denial of service](https://github.com/advisories/GHSA-3h5v-q93c-6h6q) and the newer WebSocket advisories above.
- `@web3-onboard/core 2.24.1 → nanoid 4.0.2`: [integer overflow](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) and additional generator advisories.
- `svelte-i18n 4.0.1 → esbuild 0.19.12`: a [development-server advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99); the example's Vite build itself uses esbuild 0.28.2.
- Onboard's `svelte 3.59.2`: [DOM-clobbering XSS](https://github.com/advisories/GHSA-rcqx-6q8c-2c42) and additional SSR/escaping advisory entries.

No force-fix, dependency override, or unsupported major framework upgrade was applied. In particular, RainbowKit 2.2.11 declares wagmi v2 support; substituting wagmi v3 would invalidate the tested integration baseline. Consumers need their own dependency and deployment review.

## Onboard bundle and option check

The tested Onboard public API has no `connect.disableUD` analytics switch. Its deprecated `connect.disableUDResolution` option concerns optional Unstoppable Domains resolution; the [source declaration](https://github.com/thirdweb-dev/web3-onboard/blob/03b25b0ade48b7cc8d48dd408741c7e211cf22ac/packages/core/src/types.ts#L275) does not describe telemetry control.

The inspected Onboard source uses `bnc-sdk` in type-only imports. A production build of this exact example with source maps enabled produced 18 maps and 803 source entries; none identified `bnc-sdk` or `crypto-es`. That is a limited observation about this example's generated bundle. It neither removes the installed dependency findings nor proves that another consumer cannot reach affected code, and no configuration option is presented as a security mitigation.
