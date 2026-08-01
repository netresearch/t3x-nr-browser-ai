# GitHub Pages demo — design

Date: 2026-08-01
Status: approved

## Goal

A public page that demonstrates the assistant and explains the extension to two
audiences at once: prospective customers deciding whether the idea is worth
anything, and developers deciding whether to install it.

The page runs the real bundle. It is not a mock-up and contains no simulated
model output.

## Why this shape

The assistant answers from the current page's DOM. A page that explains the
extension therefore doubles as the assistant's source document: visitors ask the
page about itself, and the answer is grounded in the copy they just read. The
demo and the documentation are the same artifact.

## Hosting

GitHub Pages on `netresearch/t3x-nr-browser-ai`, deployed by a workflow. Pages is
not yet enabled on the repository; the Actions deployment path enables it.

Build output is never committed. A `pages` workflow builds the bundle, assembles
`public/` and uploads it as the Pages artifact.

Everything is served same-origin: the bundle, the stylesheet, the icon and the
fonts. The page issues no third-party request. Hotlinking Google Fonts would
contradict the extension's own privacy posture and is a settled GDPR problem for
a German company, so Raleway and Open Sans ship as self-hosted WOFF2 from
`@fontsource` packages copied in during the build.

## Structure

One page, narrowing from pitch to detail.

1. **Hero** — what it is in one sentence, with the honest status line.
2. **Live demo** — the assistant, grounded in this page.
3. **Requirements** — Chrome 148+, ~22 GB free storage, model download.
4. **Features** — the eight capability claims, each traceable to code or docs.
5. **Integration** — plugin insertion, FlexForm fields, TypoScript constants, CSP.
6. **Privacy** — mirroring `Documentation/Security/Privacy.rst`.
7. **Footer** — Netresearch branding.

## Behaviour without a model

Most visitors will never see the chat work. They get exactly what production
gives them: the extension's own fallback, holding a short explanation of what
they would have seen, plus the requirements section. Nothing on the page is
simulated, and no screenshot is presented as real model output.

## Claims and their sources

Every factual claim on the page traces to something in the repository:

| Claim | Source |
| --- | --- |
| Answers only from the current page | `Configuration/TypoScript/constants.typoscript` |
| No server endpoint, no persistence, no telemetry | `Documentation/Security/Privacy.rst` |
| Inference on device; per Chrome, not sent to Google | `Privacy.rst`, attributed as Chrome's statement |
| Administrator prompt vs editor supplement | `AssistantController`, `LanguageModelSession` |
| Page content treated as untrusted data | default system prompt |
| Output as text nodes; only validated HTTP(S) links | `SafeResponseRenderer` |
| Fallback modes `none` / `contentElement` | `FallbackContentRenderer` |
| Keyboard lifecycle and answer announcement | `ChatController`, E2E suite |

Install instructions state the truth: the package is not on Packagist and has no
release, so a VCS repository entry is required today.

## Honesty constraints

The extension is `0.1.0`, `state => beta`, and its scope is the current page. The
page carries that visibly rather than burying it. No marketing superlatives, no
invented metrics, no claim that cannot be traced to the table above.

## Testing

- `TemplateContract.test.ts` gains the demo page: its element hooks and label
  attributes must match `Show.html`, so the demo cannot silently drift from the
  component it demonstrates.
- One Playwright case loads the built page, asserts the unsupported path renders
  the fallback, and requires zero axe violations.

## Out of scope

German translation of the page, a recorded session, and any change to the
extension's runtime behaviour.
