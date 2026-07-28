# Design: TYPO3 Browser AI Assistant POC

**Date:** 2026-07-28  
**Repository:** `netresearch/t3x-nr-browser-ai`  
**Composer package:** `netresearch/nr-browser-ai`  
**TYPO3 extension key:** `nr_browser_ai`

## Goal

Provide a public TYPO3 frontend plugin that answers questions and follow-up
questions exclusively from the content of the currently open page. Inference
runs locally through Chrome's Prompt API and its browser-managed Gemini Nano
model.

The POC supports TYPO3 12.4, 13.4 and 14.3. Its context boundary must allow
future providers for descendants, a page-tree branch or the full website
without replacing the chat or browser-AI integration.

## Product assessment

The POC is useful because page-grounded questions are an explicit Prompt API
use case, current-page content is a bounded source for evaluating answer
quality, and on-device inference avoids an application inference service.

The feature is progressive enhancement rather than a general search
replacement. API, operating-system, hardware, free-storage and initial-download
requirements make a complete unsupported-client path mandatory.

## POC scope

Included:

- public TYPO3 frontend plugin;
- Prompt API availability detection;
- user-initiated model setup and download progress;
- current-page DOM context with default selector `main`;
- editor override for the selector;
- short multi-turn dialogue with streaming, abort and reset;
- administrator-configured system prompt;
- editor-configured supplemental instruction;
- editor choice between a referenced fallback content element and no output;
- safe response rendering;
- in-memory-only conversation data.

Excluded:

- other pages, crawling, website indices, embeddings and retrieval;
- AI-generated context compression;
- cloud or application-server inference fallback;
- conversation persistence or analytics;
- autonomous actions based on model output.

## Architecture

TYPO3 renders Fluid markup, configuration and the optional fallback content.
It exposes no AI endpoint. The browser implementation consists of:

1. `DomPageContextProvider`, behind a `PageContextProvider` interface;
2. `AiCapabilityService`, behind a `LanguageModelAdapter` interface;
3. `LanguageModelSession`, responsible for model lifecycle and quota;
4. `ChatController`, responsible for UI state and user interaction;
5. `SafeResponseRenderer`, responsible for untrusted model output.

The chosen context approach reads the rendered DOM. A server-generated TYPO3
context was rejected for the POC because it couples extraction to content
types and can omit rendered third-party plugin content.

## Configuration

Administrator TypoScript settings:

- complete system prompt with a supplied default;
- default context selector `main`;
- context and dialogue thresholds;
- optional global UI defaults.

Editor plugin settings:

- supplemental prompt instruction;
- optional selector override;
- title and introduction;
- fallback mode `contentElement` or `none`;
- fallback `tt_content` reference.

The fallback reference must reject direct and indirect self-reference.

## Frontend state machine

- `checking`: neutral initialization;
- `downloadable`: explanation and explicit setup button;
- `downloading`: progress, with duplicate initialization disabled;
- `ready`: history, input and submit;
- `streaming`: incremental output and abort;
- `error-retryable`: explanation and retry;
- `unavailable`: selected fallback content or hidden root.

A downloadable model is not treated as permanently unavailable. Model creation
is only triggered after user activation.

## Current-page context

The provider:

1. finds and clones the configured root;
2. removes the assistant root, scripts, styles, navigation, forms, hidden
   content and explicitly excluded nodes;
3. converts headings, paragraphs, lists, tables and meaningful image
   descriptions into structured text;
4. preserves section order;
5. normalizes whitespace;
6. measures context use before append;
7. drops low-value sections and then truncates only at section boundaries;
8. reports partial context in the UI.

No LLM summarization is used for context reduction in the POC.

## Prompt and dialogue

The model session receives the administrator system prompt, page metadata,
editor supplemental instruction and the page content as a clearly delimited
untrusted source document.

The supplied default prompt requires answers grounded in the document,
explicitly reports missing information and ignores instructions found inside
the source document. Administrators can replace the semantic system prompt;
technical limits and response safety remain enforced in code.

The page context is appended once. Follow-up turns contain only user questions.
The controller monitors `contextUsage / contextWindow` and requires a reset
before reliable context is exhausted. Reset destroys the previous session and
extracts the current DOM again.

## Privacy

- no page or dialogue data is sent to TYPO3, Google or another application
  service;
- no telemetry endpoint is included;
- conversation state lives only in tab memory;
- no cookies, Web Storage, IndexedDB or TYPO3 persistence is used;
- sessions are destroyed on reset and page exit.

Chrome's browser-managed model download is distinct from transmitting page or
dialogue data.

## Security

- page content and model output are untrusted;
- source data is delimited from instructions;
- no model output is assigned to `innerHTML`;
- output formatting is built from explicit DOM nodes;
- generated links accept only `http:` and `https:`;
- model output never triggers navigation, form submission or another action;
- frontend assets work with a restrictive CSP.

## Accessibility and branding

- complete keyboard operation and stable focus;
- named controls and understandable focus order;
- restrained live regions for progress, generation and errors;
- visible focus, non-color-only states and `prefers-reduced-motion`;
- Netresearch extension icon at `Resources/Public/Icons/Extension.svg`;
- brand tokens use `#2F99A4`, accent `#FF4D00` sparingly and text
  `#585961`;
- component styling inherits site fonts where possible, with Raleway/Open Sans
  as the documented typography intent rather than mandatory remote downloads.

## Verification

Automated tests use an adapter instead of a real local model:

- DOM extraction, cleanup and section truncation;
- availability and download states;
- streaming, abort, reset and quota;
- fallback selection and recursion protection;
- malicious model HTML and URLs;
- TYPO3 rendering and TypoScript/FlexForm configuration;
- keyboard and accessibility checks.

A manual smoke test in a supported Chrome verifies the real model download and
inference path.

## Acceptance criteria

1. The extension installs and renders on TYPO3 12.4, 13.4 and 14.3.
2. Setup and download progress are understandable.
3. Questions and follow-ups use the current page as their only source.
4. Missing information is stated instead of invented.
5. Dialogue, abort, reset and quota boundaries work.
6. Page and dialogue data are not sent to an application service or persisted.
7. Unsupported clients render the configured fallback exactly.
8. Model output cannot inject active DOM content.
9. Core flows are keyboard-operable and pass the defined automated matrix.

## Future context providers

`PageContextProvider` is the only entry point for additional knowledge scopes.
Selection, retrieval, compression, freshness and citations for descendants,
tree branches and full-site indices require a separate design.

## Primary references

- [Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Chrome built-in AI do and don't](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts)
- [Chrome session management](https://developer.chrome.com/docs/ai/session-management)
- [TYPO3 frontend assets](https://docs.typo3.org/m/typo3/reference-coreapi/main/en-us/ApiOverview/Assets/Index.html)
