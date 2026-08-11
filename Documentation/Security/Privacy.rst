.. include:: /Includes.rst.txt

.. _security-privacy:

============================
Privacy and trust boundaries
============================

.. _security-data-flow:

Local data flow
===============

The extension extracts text from the configured area of the currently open
DOM and passes it with questions to Chrome's built-in Prompt API. Inference
runs on the visitor's device. According to Chrome, model-use data is not sent
to Google or a third party.

No question, page context or answer is sent to an application-service
endpoint. The extension defines no chat endpoint, database table, cookie,
local storage, analytics or telemetry. Dialogue state exists only in browser
memory and is destroyed on reset or navigation, including back/forward-cache
restoration.

Chrome itself manages model download, updates, storage and eviction. Site
operators must evaluate Chrome deployment and browser governance separately
from the extension.

.. _security-form-assistant-flow:

The form assistant's outbound query
===================================

The form assistant plugin is the one place where a request does leave the
browser, and it has to be described as such rather than covered by the sentence
above. Deriving the parameters stays on the device; running the form does not.
The query goes from the visitor's browser directly to the configured data
source, which therefore sees the visitor's IP address, the parameters of the
query and — for the shipped demonstration form — the place name being resolved.

It goes there directly and not through the site, so the site never sees it
either. Nothing is stored anywhere: the result exists in browser memory and is
replaced by the next query.

The tool is also offered to the browser's model context where the browser
provides one. An agent that accepts the offer can then run the query, and the
result it receives is content this page does not vouch for; the registration
says so through its ``untrustedContentHint`` annotation.

.. _security-prompts:

Prompt and content boundaries
=============================

The administrator system prompt is the fixed policy layer. An editor can add
a supplemental instruction, but cannot replace the administrator layer. The
selected page document is serialized as source data. The default prompt tells
the model not to follow instructions found inside that data.

These controls reduce prompt-injection risk but cannot guarantee model
behavior. Do not place secrets in publicly rendered page content or prompts.
Do not use model answers as authorization, legal, medical or financial
decisions without appropriate independent controls.

.. _security-output:

Output and fallback rendering
=============================

Model output is rendered with DOM APIs only. A restricted Markdown subset —
emphasis, inline code, fenced code, lists, headings and block quotes — is
recognised and built from ``createElement`` and text nodes; every other
character stays literal text. No markup string is ever assembled and no HTML
is ever parsed, so the model cannot inject elements or attributes of its
choosing. Headings are emitted below the assistant's own heading level.

Link-like output is accepted only for validated HTTP(S) URLs, whether written
as a bare URL or in Markdown link syntax, and receives a visible new-tab
indication. Other schemes remain inert text.

Fallback content is normal TYPO3-rendered content selected by an editor. Only
an enabled record is accepted; hidden, deleted and cyclic references produce no
fallback output. A record on another page is permitted, so one shared element
can serve as the fallback for many pages. Access restrictions still apply: the
record is rendered through TYPO3's ``RECORDS`` object, which honors the usual
enable fields including access groups and time-based publishing.

.. _security-csp:

Content Security Policy
=======================

The extension loads its JavaScript module, CSS and icon from the TYPO3 site
and performs no application network request. A typical
``Content-Security-Policy`` can therefore keep ``script-src`` and
``style-src`` restricted to the site's own assets and does not need an
external ``connect-src`` destination for the extension.

The exact policy belongs to the integrating site. Verify that TYPO3's emitted
module and stylesheet are permitted; do not add ``unsafe-inline`` or broad
external hosts for this plugin. Chrome's internal model management is browser
functionality rather than an extension endpoint.

.. _security-operator-responsibilities:

Operator responsibilities
=========================

Before public use:

- Confirm that selected page content may be processed on visitor devices.
- Explain the feature and Chrome dependency in the site's privacy information
  where required by the applicable policy or law.
- Name the data source of every form assistant plugin in that same privacy
  information: the query reaches it directly from the visitor's browser, so it
  is a third-party recipient of the visitor's address regardless of what the
  site itself stores.
- Choose a fallback that remains useful without exposing restricted content.
- Maintain TYPO3, the extension, Chrome and operating systems with security
  updates.
- Repeat the :ref:`browser-setup-smoke-test` after relevant browser changes.
