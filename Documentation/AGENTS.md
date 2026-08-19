<!-- Managed by agent: keep sections and order; edit content, not structure. Last updated: 2026-08-19 -->

# AGENTS.md -- Documentation

## Overview

TYPO3 RST manual rendered with the `typo3docs` theme (`guides.xml`). Structure:
`Index.rst` (start page), `User/` (BrowserSetup, FormAssistant),
`Administration/` (Configuration), `Security/` (Privacy), `Images/`
(brand SVG), `Includes.rst.txt` (shared directives).

## Setup

No local toolchain is required for edits. `guides.xml` carries project
title/version/release (release mirrors `ext_emconf.php`) and the GitHub
edit links. `Tests/Repository/documentation.sh` asserts required content in
these files -- run it after any documentation change.

## Commands

```bash
bash Tests/Repository/documentation.sh   # content contract (run from repo root)
```

## Code style

- RST with TYPO3 documentation directives; follow the `.editorconfig` in this
  directory.
- Keep documented claims in sync with the code: `documentation.sh` pins exact
  phrases (Chrome 148, 22 GB, fallback behaviour, privacy statement, CC BY 4.0
  licensing of the docs, the Netresearch attribution block in `Index.rst`).
- Never place symlinks inside `Documentation/` -- the docs renderer (Flysystem)
  rejects symbolic links, which is why `CLAUDE.md` here is a regular file.

## Security

`Security/Privacy.rst` is the normative privacy statement (on-device inference,
no data leaves the page, Content-Security-Policy guidance). Changes to it need
matching changes in README and, where behaviour changes, in the code and tests
-- not the other way round.

## PR checklist

- [ ] `bash Tests/Repository/documentation.sh` passes
- [ ] Version/release in `guides.xml` matches `ext_emconf.php` when releasing
- [ ] No symlinks added under `Documentation/`
- [ ] New pages linked from the relevant `Index.rst` toctree

## Examples

`User/BrowserSetup.rst` is the reference for user-facing pages: concrete
requirements (flags, model download, `chrome://on-device-internals`) with
verifiable statements instead of marketing prose.

## When stuck

Contract failures name the missing phrase and file. Rendering questions:
docs.typo3.org renders from `Documentation/` using `guides.xml`; keep the
schema reference intact.
