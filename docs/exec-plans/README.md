<!-- SPDX-License-Identifier: GPL-2.0-or-later -->
<!-- SPDX-FileCopyrightText: Netresearch DTT GmbH -->
# Execution plans

Working directory for multi-step agent task plans.

- `active/` -- plans currently being executed (create on demand)
- `completed/` -- finished plans kept for reference (create on demand)

Keep one Markdown file per plan; delete or move to `completed/` when done.
Architecture facts belong in `../ARCHITECTURE.md`, decisions in
`../decisions/` -- not here.
