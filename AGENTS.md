# Robinhood Wallet connector — contributor instructions

Follow the parent Vexi workspace agreement. Product behavior is governed by `vexi-spec`; start with TK-465 and its accepted RDR and acceptance criteria. Keep product work on a branch containing its ticket number.

- Use English for code, documentation, and user-facing text. Discuss work with the owner in Traditional Chinese.
- Scope commits to explicit paths. Preserve unrelated changes. Do not bypass hooks or force-push.
- Never request signatures, transactions, or wallet approval during automated UI verification. Synthetic providers and actual device tests are separate evidence.
- Never log WalletConnect pairing URIs, session keys, accounts, or authentication material in committed artifacts.
- Only identify a discovered Robinhood provider using published wallet metadata; do not relabel an arbitrary injected provider.
- Keep imports safe without a browser. Initialize transport only when needed; request accounts only after explicit connection intent.
- Test cancellation, late completion, retry, disconnect, restored sessions, and event cleanup at their behavioral boundaries.
- Verify supported framework versions using real packages and package-consumer builds. Do not advertise untested version ranges or chain support.
- Do not imply Robinhood endorsement. Brand names belong to their respective owners.
- Package publication, upstream acceptance, physical-wallet certification, and deployment need separate evidence.
