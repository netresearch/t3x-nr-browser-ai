<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- .ddev

## Overview

DDEV project `nr-browser-ai` (PHP 8.3, apache-fpm, MariaDB 11.8) hosting three
parallel TYPO3 installations -- v12, v13, v14 -- that all mount this extension
from `/var/www/nr_browser_ai` (bind mount defined in
`docker-compose.web.yaml`; `no_project_mount: true` in `config.yaml`).
`web-build/` adds a Dockerfile and the landing `index.html`;
`commands/web/` holds the custom commands.

## Setup

```bash
ddev start
ddev install-all      # install v12 + v13 + v14 (or install-v12/-v13/-v14 individually)
npm ci                # host-side frontend toolchain
```

Landing page: `https://nr-browser-ai.ddev.site/`. Admin credentials for the
installed backends come from the environment block in
`docker-compose.web.yaml`.

## Commands

```bash
ddev install-all      # all supported TYPO3 environments
ddev install-v12 | ddev install-v13 | ddev install-v14
ddev setup            # set up all nr-browser-ai TYPO3 environments
ddev describe         # URLs and service state
```

`commands/web/_install-typo3` is the shared installer the version commands
delegate to -- change installation behaviour there, not in the three wrappers.

## Code style

Custom commands are bash with DDEV's `## Description/Usage/Example` header
comments; keep `set -euo pipefail`. Version-specific differences belong in the
`install-v*` wrappers, shared logic in `_install-typo3`.

## Security

The credentials in `docker-compose.web.yaml` (DB root, TYPO3 admin) are
throwaway local-development values -- never reuse them anywhere non-local and
never point this stack at real data. DDEV is for local debugging; CI results
are authoritative.

## PR checklist

- [ ] `ddev install-all` still completes after installer changes
- [ ] All three TYPO3 versions render the extension's plugins
- [ ] New environment variables documented in this file

## Examples

`commands/web/install-all` shows the wrapper pattern: delegate to the
per-version scripts, then print what was installed and where.

## When stuck

`ddev logs` and `ddev ssh` for the web container. If the extension does not
show up in an installation, verify the bind mount target
`/var/www/nr_browser_ai` inside the container.
