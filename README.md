# nr-browser-ai

On-device AI assistant for TYPO3 frontend pages powered by Chrome built-in AI
and Gemini Nano — by [Netresearch DTT GmbH](https://www.netresearch.de/).

> Status: approved POC design and implementation planning.

## Scope

The frontend plugin answers a short dialogue from the content of the currently
open page. Inference runs locally in a supported browser. Unsupported clients
receive an editor-configured fallback content element or no plugin output.

## Project documents

- [Approved POC design](docs/superpowers/specs/2026-07-28-nr-browser-ai-poc-design.md)
- [Implementation plan](docs/superpowers/plans/2026-07-28-nr-browser-ai-poc.md)

## Target platforms

- TYPO3 12.4, 13.4 and 14.3
- PHP 8.2 through 8.5
- Chrome Prompt API with a locally managed Gemini Nano model

## DDEV development environment

Prerequisites are Docker Engine 20.10 or newer, Docker Compose 2 or newer,
and DDEV 1.25 or newer. Start the environment and install all disposable
TYPO3 projects with:

```bash
ddev start
ddev install-all
```

The overview is available at <https://nr-browser-ai.ddev.site/>. The TYPO3
frontends are available at `https://v12.nr-browser-ai.ddev.site/`,
`https://v13.nr-browser-ai.ddev.site/`, and
`https://v14.nr-browser-ai.ddev.site/`; append `typo3/` for each backend.
The backend credentials are `admin` / `Joh316!!`.

Run `ddev install-v12`, `ddev install-v13`, or `ddev install-v14` to refresh
one environment. The generated TYPO3 projects and databases live in persistent
Docker volumes and are not committed.

## Support and security

TYPO3 12.4 is retained for extension API compatibility only. The public
community packages are end-of-life and currently blocked by Composer security
advisories. Production use on TYPO3 12.4 requires a maintained ELTS or
otherwise security-patched distribution and Composer repository selected and
licensed by the project owner. Compatibility testing against public 12.4
packages does not make that dependency graph secure.

TYPO3 13.4 and 14.3 are the normal supported quality graphs. Task 10 in the
implementation plan adds their full Netresearch TYPO3-aware PHPStan, Rector,
CGL, unit and functional gates.

## License

The implementation is intended to be released under GPL-2.0-or-later.

Copyright (c) 2026 [Netresearch DTT GmbH](https://www.netresearch.de/).
