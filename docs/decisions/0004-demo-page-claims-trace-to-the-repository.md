# ADR-0004: Every claim on the demo page traces to a source in this repository

## Status

Accepted

## Date

2026-08-01

## Context

The GitHub Pages demo is the first thing most people see of the extension, and
it makes factual claims about privacy and behaviour. A demo page is also the
easiest place for a claim to drift: the code changes, the page does not, and
the page is what people quote back.

## Decision

No claim goes on the page that cannot be pointed at a file in this repository.
The mapping as built:

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

The claim about on-device inference is attributed to Chrome rather than
asserted by us, because it is Chrome's statement about Chrome's model.

The page states the extension's actual state — version and `state` from
`ext_emconf.php`, and the fact that its scope is the current page — visibly
rather than in a footnote. Install instructions state what is true at the
time: while the package was not on Packagist and had no release, the page said
a VCS repository entry was required.

No marketing superlatives, no invented metrics, no claim that is not in the
table.

## Consequences

`TemplateContract.test.ts` covers the demo page: its element hooks and label
attributes must match `Show.html`, so the demo cannot silently drift from the
component it demonstrates. One Playwright case loads the built page, asserts
the unsupported path renders the fallback, and requires zero axe violations.

Adding a claim means adding a row and naming its source. If no source exists,
the claim does not go on the page.
