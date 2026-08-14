# ADR-0002: The assistant runs entirely in the browser, on untrusted input

## Status

Accepted

## Date

2026-07-28

## Context

The extension answers questions about the page the visitor is reading. The
obvious implementation gives TYPO3 an AI endpoint: the server holds the API
key, assembles the context and proxies the model call. That shape makes the
site operator a processor of every question a visitor asks, and it makes the
extension useless on a static export.

Chrome's on-device Prompt API removes the need for it. The model runs in the
visitor's browser, so the page never has to leave it.

## Decision

TYPO3 renders Fluid markup, configuration and the optional fallback content.
It exposes no AI endpoint.

The browser side is split behind interfaces so the model vendor and the context
source can each be replaced:

1. `DomPageContextProvider`, behind a `PageContextProvider` interface;
2. `BrowserLanguageModelAdapter`, behind a `LanguageModelAdapter` interface,
   answering `availability()` and creating sessions;
3. `LanguageModelSession`, owning model lifecycle and quota;
4. `ChatController`, owning UI state and user interaction;
5. `SafeResponseRenderer`, owning untrusted model output.

Context is read from the rendered DOM. A server-generated TYPO3 context was
rejected: it couples extraction to content types and omits rendered
third-party plugin content.

Three properties follow from this and are binding for later changes:

**Nothing is transmitted.** No page or dialogue data reaches TYPO3, Google or
any other application service. There is no telemetry endpoint. Conversation
state lives in tab memory only — no cookies, Web Storage, IndexedDB or TYPO3
persistence — and sessions are destroyed on reset and on page exit. Chrome's
browser-managed model download is a separate thing from transmitting page or
dialogue data.

**Page content and model output are both untrusted.** Source data is delimited
from instructions. No model output is assigned to `innerHTML`; formatting is
built from explicit DOM nodes. Generated links accept `http:` and `https:`
only. Model output never triggers navigation, form submission or any other
action. The assets work under a restrictive CSP.

**A missing model is a state, not a failure.** The frontend state machine
distinguishes `checking`, `downloadable`, `downloading`, `ready`, `streaming`,
`error-retryable` and `unavailable`. A downloadable model is not treated as
permanently unavailable, and model creation is triggered only after user
activation.

## Consequences

The extension cannot serve browsers without the Prompt API, which is why the
`unavailable` state renders operator-chosen fallback content instead of an
error. The fallback `tt_content` reference must reject direct and indirect
self-reference.

Adding a server endpoint later would invalidate the privacy statement in
`Documentation/Security/Privacy.rst` and the claims on the demo page, so it is
a decision that supersedes this ADR rather than an extension of it.
