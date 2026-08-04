# Contributing

Thank you for improving Netresearch Browser AI. Please discuss large scope or
architecture changes in a GitHub issue before implementation.

## Development setup

```bash
git clone https://github.com/netresearch/t3x-nr-browser-ai.git
cd t3x-nr-browser-ai
ddev start
ddev install-all
npm ci
```

Do not commit a root `composer.lock`: this repository is a TYPO3 extension
library and its CI resolves the supported dependency matrix. The frontend
`package-lock.json` is committed to make the asset build reproducible.

## Required checks

```bash
composer ci:test:php:cgl
composer ci:test:php:phpstan
composer ci:test:php:unit
typo3DatabaseDriver=pdo_sqlite composer ci:test:php:functional
bash Tests/Repository/metadata.sh
bash Tests/Repository/documentation.sh
npm run ci
npm run test:js:coverage
npm run test:e2e
git diff --exit-code Resources/Public
```

Keep source TypeScript and CSS in `Resources/Private/`; commit the matching
compiled files in `Resources/Public/`. Never add an application LLM endpoint,
chat persistence or telemetry without an explicit architecture and privacy
review.

Use Conventional Commits, sign the commit and include the DCO sign-off:

```text
feat: describe the user-visible change

Signed-off-by: Your Name <you@example.com>
```

Open a pull request against `main`, explain manual Chrome verification and
wait for all required checks and review conversations to complete.

## Commit Signing

All commits must be cryptographically signed and carry a DCO sign-off: `git commit -S --signoff`. The `require-signed-commits` ruleset on the default branch enforces the signature (the "Verified" badge on GitHub); the DCO check enforces the `Signed-off-by` trailer — these are two different things and both are required. Quickest setup is SSH signing: register your SSH key as a *signing key* on your GitHub account, then `git config gpg.format ssh && git config user.signingkey ~/.ssh/<key>.pub`.
