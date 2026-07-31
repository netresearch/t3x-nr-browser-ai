# Security policy

## Supported versions

The latest release receives security fixes on TYPO3 13.4 and 14.3. TYPO3 12.4
is retained for API compatibility testing only; production use requires a
maintained ELTS or otherwise security-patched distribution.

## Reporting a vulnerability

Do not disclose a vulnerability in a public issue. Use GitHub's
[private vulnerability reporting](https://github.com/netresearch/t3x-nr-browser-ai/security/advisories/new).
Include the affected version, reproduction steps, impact and any proposed
mitigation. Netresearch will acknowledge the report and coordinate disclosure.

## Trust boundaries

The extension has no LLM application endpoint and stores no questions,
selected page context or answers. Chrome owns the on-device model lifecycle.
Page content and editor instructions are untrusted model input; the fixed
administrator prompt tells the model not to follow instructions found there.
Model output is inserted using DOM text nodes and validated HTTP(S) links.

The chosen fallback is normal TYPO3-rendered content and therefore remains
inside the site's existing content and rendering trust boundary. Review the
full [privacy and security documentation](Documentation/Security/Privacy.rst).
