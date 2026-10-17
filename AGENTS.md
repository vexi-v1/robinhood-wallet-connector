# Guidance for coding assistants

This is a standalone SDK repository. Read [README.md](README.md) for installation and public APIs, and [CONTRIBUTING.md](CONTRIBUTING.md) for setup, repository layout, checks and pull requests. All development instructions are maintained in this repository.

- Use English for code, comments, documentation and interface text.
- Keep changes focused and preserve unrelated working-tree changes. Do not bypass hooks or force-push.
- Keep imports safe without a browser. Initialize transport only when needed; request accounts only after explicit connection intent.
- Identify Robinhood providers using the documented discovery metadata. Never relabel an arbitrary injected provider.
- Cover cancellation, late completion, retry, disconnect, restored sessions and event cleanup when changing those behaviors.
- Validate compatibility using the real framework packages and packed consumers. Do not claim support for untested versions or networks.
- Use synthetic wallets for automated checks. Do not approve real wallet prompts, request signatures or send transactions during automated UI tests.
- Keep pairing URIs, session keys, account information and authentication material out of logs, screenshots and committed artifacts.
- Preserve the distinction between synthetic tests, browser checks and physical-device results when updating verification records.
- Do not imply Robinhood endorsement. Keep third-party asset attribution and license notices intact.
