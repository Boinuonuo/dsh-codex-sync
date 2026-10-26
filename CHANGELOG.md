# Changelog

## 1.6.3-ssh.0 — local fork preview (unreleased)

- Add configured read-only SSH session sources, bounded temporary snapshots, strict host-key verification, and plain/concatenated-Zstandard rollout support.
- Share source discovery/catalog/preview/import between the picker, slash command and deferred agent tool; remote import errors never fall back to local import.
- Map remote project paths only through explicit local cwd mappings; history-only defaults, disjoint source-specific session ids, continuation ordering, cancellation and mapping-drift checks.
- Keep auto-import/export local-only, preserve upstream tests, add Windows-compatible tests and adversarial regression coverage. Exclude upstream private deployment notes from the npm artifact.
- Add explicit Windows OpenSSH sources (`platform: windows`), fixed PowerShell/`py -3` launch, pinned no-reparse Win32 reading, drive-path mappings and binary protocol tests.
- Real Windows SSH catalog/dry-run verified read-only with bounded rollouts and zero persistence writes. No npm publication or production-profile installation; live GUI acceptance and Linux filesystem tests remain separate gates.

## 1.6.2 — 2026-10-05

- Import sessions in the installed DSH current format and support handle-based persistence, incremental assistant replies, new turns, and idempotent re-imports (PR #3).
- Preserve standard function-call arguments; add regression coverage for string, object, empty, legacy and custom-tool inputs.
- Admit the verified official DSH MCP client 0.2.0-rc.2 peer and document npm/CLI versus Desktop versions and text-only reverse-export scope.
- Support checksummed Zstandard compression on Node 20 via the zstd CLI, isolate MCP test fixtures, and clean up timers on failures.
- Retain backups and validate repaired legacy artifacts before writing. Repair validation used temporary copies only.
- CI: Node 20/22 each pass 61 tests; install the exact packed source into official DSH 0.2.0-rc.2 without compatibility exemptions.

Based on main merge commit 2274ee86923b56f84db29d266625abd09761093e. No new application logic beyond that verified commit.
