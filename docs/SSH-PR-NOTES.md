# Read-only SSH Codex history import and source management

## Problem

Users may keep Codex histories on another machine while running Harness locally. They need an explicit one-time pull, not remote writeback or a background synchronization daemon. A source picker without a way to configure its sources is incomplete.

## Proposed feature

- Named, configurable SSH sources for POSIX and Windows OpenSSH hosts.
- Source management from Codex Sync settings and the import picker (including an empty-state entry): create, inspect, edit, delete and explicit connection test.
- Ordinary Harness configuration persistence; optimistic revisions preserve concurrent edits and unrelated plugin settings. A host without configEditor reports read-only capability rather than editing files behind the Loader.
- Metadata-only test checks SSH, Python and the safe sessions root; it does not enumerate/read conversations. Saving does not connect. Deleting does not remove imported history or remote files.
- Read-only bounded rollout snapshots, local conversion and explicit preview/import. No auth/Skills/config/MCP copying, no remote writeback, no automatic SSH import.
- Shared host operations for HTTP/UI and deferred codex_sources/codex_import tools.
- Stable source namespaces and cwd mapping safety; imported ids cannot be rebound to another machine. Import writes and source edits share the write queue.

## Security / compatibility

Fixed scripts over stdin, system OpenSSH, BatchMode and strict known-host verification. No password, key contents, command or arbitrary SSH-option fields. POSIX no-follow file descriptors and Windows pinned no-reparse handles. Source management uses same-origin JSON requests. Configuration never becomes a repository default.

Retain existing local import/export, Skills and MCP behavior. No new runtime dependencies. Existing metadata/artwork are unchanged because this extends the same plugin rather than introducing a new bundle identity.

## Validation

Local regression suites cover source save/delete/test separation, revision conflicts, validation, identity guards, origin restrictions, timeout/cancellation, compression/limits, import idempotency and UI request ownership. Real installed UI: source manager opens, generic synthetic source saves successfully, tool lists the same config, explicit delete confirmation removes it, and the original empty source set is restored. An unsaved authorized Windows draft passed metadata-only connection testing. No production sessions were imported.

Remaining: Linux filesystem fixtures are skipped on Windows; run Linux CI before broad compatibility claims. A hosted Actions run is not implied by a passing local suite. Light-theme screenshot review is not yet complete.

This document is preparation for review, not evidence that an upstream pull request has been submitted. No npm publication is part of this change.
