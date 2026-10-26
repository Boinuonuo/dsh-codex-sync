# Changelog

## 1.6.3-ssh.1 — fork preview (not published to npm)

- Add bilingual SSH source management from Codex Sync settings and the import picker, including the empty state. Create/edit/delete sources without hand-editing YAML; show validation, stale-revision and persistence failures.
- Persist only through Harness configuration management, preserving other plugin settings. Save/delete never connects to SSH or imports sessions. Keep source ids stable and refuse rebinding imported history to another target.
- Add an explicit metadata-only connection test: verify SSH authentication, remote Python and the safe sessions root, without enumerating rollouts or transferring conversation bodies.
- Share source operations with the deferred `codex_sources` tool; use optimistic revisions and same-origin JSON management requests. Existing local import/export and manual remote preview/import remain separate.

## 1.6.3-ssh.0 — fork preview (not published to npm)

- Add configured read-only SSH session sources, bounded temporary snapshots, strict host-key verification, and plain/concatenated-Zstandard rollout support.
- Share source discovery/catalog/preview/import between the picker, slash command and deferred agent tool; remote import errors never fall back to local import.
- Map remote project paths only through explicit local cwd mappings; history-only defaults, disjoint source-specific session ids, continuation ordering, cancellation and mapping-drift checks.
- Keep auto-import/export local-only, preserve upstream tests, add Windows-compatible tests and adversarial regression coverage. Exclude upstream private deployment notes from the npm artifact.
- Add explicit Windows OpenSSH sources (`platform: windows`), fixed PowerShell/`py -3` launch, pinned no-reparse Win32 reading, drive-path mappings and binary protocol tests.
- Real Windows SSH catalog/dry-run verified read-only with bounded rollouts and zero persistence writes. Admit exact DSH MCP client 0.2.1-rc.3 after validating the unchanged bridge and the new tool schema against the installed runtime contracts. No npm publication; live GUI acceptance and Linux filesystem tests remain separate gates.

## 1.6.2 — 2026-10-05

- Import sessions in the installed DSH current format and support handle-based persistence, incremental assistant replies, new turns, and idempotent re-imports (PR #3).
- Preserve standard function-call arguments; add regression coverage for string, object, empty, legacy and custom-tool inputs.
- Admit the verified official DSH MCP client 0.2.0-rc.2 peer and document npm/CLI versus Desktop versions and text-only reverse-export scope.
- Support checksummed Zstandard compression on Node 20 via the zstd CLI, isolate MCP test fixtures, and clean up timers on failures.
- Retain backups and validate repaired legacy artifacts before writing. Repair validation used temporary copies only.
- CI: Node 20/22 each pass 61 tests; install the exact packed source into official DSH 0.2.0-rc.2 without compatibility exemptions.

Based on main merge commit 2274ee86923b56f84db29d266625abd09761093e. No new application logic beyond that verified commit.
