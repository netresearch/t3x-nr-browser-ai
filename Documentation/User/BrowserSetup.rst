.. include:: /Includes.rst.txt

.. _browser-setup:

========================
Chrome and model setup
========================

The Prompt API shipped in Chrome 148. Model availability is controlled by the
browser and device, not by TYPO3 or this extension.

.. _browser-setup-requirements:

Requirements
============

Chrome documents these client requirements:

- Chrome 148 or newer.
- Windows 10/11, macOS 13 or newer, Linux, or Chromebook Plus with ChromeOS
  platform 16389 or newer.
- At least 22 GB free storage before download. Chrome may remove the model if
  available storage falls below 10 GB.
- A GPU with more than 4 GB VRAM, or a CPU environment with at least 16 GB RAM
  and four CPU cores.
- An unmetered network for the initial model download.

The extension requests text input and output in English and, where applicable,
German, Spanish, French or Japanese. The page language selects the output
language; unsupported page languages fall back to English.

See Chrome's primary documentation for the
`Prompt API <https://developer.chrome.com/docs/ai/prompt-api>`__ and
`built-in model debugging
<https://developer.chrome.com/docs/ai/debug-built-in-model>`__.

.. _browser-setup-download:

Download states
===============

Open a page containing the plugin. The initial status can be:

- **Ready**: the model is available and questions can be submitted.
- **Download required**: select **Set up model**. This click supplies the user
  activation required before ``LanguageModel.create()``.
- **Downloading**: keep the page open while Chrome reports progress.
- **Unavailable**: the configured fallback content element or no output is
  displayed.

Chrome can download the model separately when an origin first creates a
session. The extension never begins model creation during passive capability
checking.

.. _browser-setup-debugging:

Troubleshooting
===============

Open ``chrome://on-device-internals`` in Chrome to inspect model status, model
size and diagnostic information. Recheck storage, platform and hardware if
the API reports that the model is unavailable.

.. _browser-setup-smoke-test:

Real-Chrome smoke test
======================

Use a real supported Chrome installation; browser mocks do not validate model
availability or answers.

1. Confirm the model state in ``chrome://on-device-internals``.
2. Open a frontend page with a distinctive fact inside the configured
   selector and another fact outside it.
3. Select **Set up model** if requested and wait for **Ready**.
4. Ask for the in-scope fact and verify that the answer is streamed.
5. Ask a follow-up question and verify that dialogue context is retained.
6. Ask about the out-of-scope fact and verify that the model says it is absent.
7. Start an answer, select **Abort**, and verify that streaming stops.
8. Select **Reset** and verify that the transcript and model session clear.
9. Test an unsupported client and verify the chosen fallback behavior.

Model output remains probabilistic. A successful smoke test confirms the
integration, not factual correctness for every question.
