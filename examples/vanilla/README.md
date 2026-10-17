# Vanilla browser example

Build the packages at the repository root first with `npm ci && npm run build`.
Then run `npm install` and `npm run dev` in this directory. Copy `.env.example`
to `.env.local`, set your public WalletConnect project ID, allow the actual
example origin in your WalletConnect project, and restart the server.

`index.html` uses the real SDK and WalletConnect relay. It requests account
access only after the Connect button; it never requests a signature or transaction.
This minimal example requires another explicit connection after reload. Passive
restoration with `provider.isAuthorized()` is demonstrated in the ethers and viem examples.

`fixture.html` uses the same SDK dialog with an explicitly synthetic transport.
Its inert QR cannot pair any wallet. It is useful for responsive presentation,
keyboard cancellation, focus restoration, and repeatable screenshots. It is
not a physical-wallet or network compatibility test.
