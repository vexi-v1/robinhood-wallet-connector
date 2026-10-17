# Guidance for coding assistants

This is a standalone SDK repository. Start with [llms.txt](llms.txt) for the documentation map and [the integration guide](docs/ai-integration.md) for using the SDK. Read [README.md](README.md) for installation and public APIs, and [CONTRIBUTING.md](CONTRIBUTING.md) for setup, repository layout, checks and pull requests. All development instructions are maintained in this repository.

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

## Keep agent documentation current

- In the same pull request as changes to public exports, options, connection behavior, installation, package versions, supported frameworks, publication status or verification claims, update the affected canonical guides and review `llms.txt` and `docs/ai-integration.md`. Update their summaries and links whenever the change affects them; explain any not-applicable decision in the PR.
- Keep the `llms.txt` entry visible near the top of the root and package READMEs. Its links must lead to existing public documentation; use raw text URLs for files that agents should fetch directly.
- Treat `llms-full.txt` as generated output. After editing included documentation, run `npm run docs:generate`, commit the generated update, and run `npm run docs:check` before committing. Do not hand-edit the generated file. CI checks freshness and documentation links.
- When adding or moving a guide or example, update `llms.txt` and the source list in `scripts/llms-docs.mjs` if the document belongs in the full-text bundle.
- Keep GitHub About/topics and package metadata consistent with implemented support. Describe proposed integrations as proposals; never advertise planned adapters as available or unpublished packages as registry releases.
