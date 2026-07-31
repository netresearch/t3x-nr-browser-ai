.. include:: /Includes.rst.txt

.. _start:

==========================
Netresearch Browser AI
==========================

Netresearch Browser AI adds a frontend question-and-answer dialogue grounded in
content of the currently open page. Chrome 148 or newer runs Gemini Nano on
the visitor's device through the built-in Prompt API.

The proof of concept has no application LLM endpoint, no chat persistence and
no telemetry. A provider boundary is ready for later page-tree or whole-site
context, but the implemented scope is deliberately the current page only.

.. important::

   Browser built-in AI availability depends on Chrome, the desktop platform,
   hardware, storage and model state. Always configure an appropriate fallback
   or choose explicitly to render no fallback.

.. _manual-sections:

Manual sections
===============

.. card-grid::
   :columns: 1
   :columns-md: 3
   :gap: 4
   :card-height: 100

   .. card:: Administration

      Install the extension and configure the plugin, prompts and context.

      .. card-footer:: :ref:`administration`
         :button-style: btn btn-primary stretched-link

   .. card:: Browser setup

      Check Chrome requirements, download the model and run a smoke test.

      .. card-footer:: :ref:`browser-setup`
         :button-style: btn btn-primary stretched-link

   .. card:: Privacy and security

      Understand local processing, trust boundaries, CSP and responsibilities.

      .. card-footer:: :ref:`security`
         :button-style: btn btn-primary stretched-link

.. toctree::
   :hidden:
   :maxdepth: 2

   Administration/Index
   User/Index
   Security/Index

.. _manual-requirements:

Requirements
============

The extension supports TYPO3 12.4, 13.4 and 14.3 with PHP 8.2 through 8.5.
TYPO3 12.4 support is compatibility-only and requires a maintained,
security-patched distribution for production use.

The model requires Chrome 148 or newer on a supported desktop platform. See
:ref:`browser-setup-requirements` for the current Chrome requirements.

.. _manual-license:

License and support
===================

The extension is licensed under GPL-2.0-or-later. Report defects through the
`GitHub issue tracker
<https://github.com/netresearch/t3x-nr-browser-ai/issues>`__.
Report vulnerabilities privately as described in the repository's
``SECURITY.md`` file.

Developed and maintained by
`Netresearch DTT GmbH <https://www.netresearch.de/>`__.
