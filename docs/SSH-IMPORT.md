# SSH session import (fork preview)

This fork adds **read-only remote Codex conversation import** to the existing picker, slash command, and deferred `codex_import` agent tool. It does not replace the active local plugin automatically. No npm release is part of this change.

## Scope

- Local/import/export behavior stays local by default. Auto-import does not connect to SSH sources.
- Remote sources are explicitly configured. The UI selects a source id; it cannot submit a host, executable, SSH options, password, or shell script.
- The source is read-only: only `sessions/**/rollout-*.jsonl` and `.jsonl.zst` are enumerated/read. No auth files, Codex config, SQLite databases, Skills, MCP settings or instructions are copied.
- Remote JSONL and concatenated/checksummed Zstandard rollouts are decoded with byte limits. Corrupt compression aborts the snapshot; oversized individual files are skipped with a count. Count/aggregate/time limits fail explicitly instead of importing a silently incomplete snapshot.
- Import history is not remote execution. A `cwdMappings` entry explicitly selects a local working directory. Unmapped sessions get no cwd (history only). A continuation uses the normal DSH execution environment, not SSH.
- The local Codex exporter deliberately excludes SSH-imported sessions in this first version. There is no remote writeback.

## Requirements

**Local:** system OpenSSH `ssh` on PATH and working key/agent or SSH-config authentication. Node with native Zstandard decoding, or `zstd` on PATH for compressed rollouts.

**Remote:** choose an explicit platform. `posix` (default) requires Python 3 and `O_NOFOLLOW`/directory-fd support. `windows` requires Windows OpenSSH, Windows PowerShell and the Python launcher `py -3`; it rejects reparse points/junctions and pins opened paths while reading. Both run a fixed Python program through stdin and do not install files on the remote.

Before using the plugin, connect to the intended alias yourself with system SSH and verify the host fingerprint. The plugin forces `BatchMode=yes` and `StrictHostKeyChecking=yes`; it never prompts for a password or silently accepts a new host key. It reuses the owner's SSH configuration, including any intentionally configured proxy or identity settings.

## Configure sources

Add `sshSources` to the existing plugin row's config using DSH's normal configuration management. Do not create a duplicate plugin row. Example only (replace placeholders locally; never commit personal hostnames, paths, keys or session data):

```yaml
sshSources:
  lab:
    label: Development server
    host: my-ssh-alias
    platform: posix         # windows for Windows OpenSSH + py -3
    codexHome: ~/.codex
    # port: 22              # optional; otherwise SSH config/default applies
    cwdMappings:
      - from: /srv/projects
        to: 'C:\Projects'
    timeoutMs: 60000
    maxFiles: 1000
    maxTotalBytes: 268435456
    maxSessionBytes: 67108864
```

`sshSources` is a named object. Source ids allow ASCII letters/numbers, `_` and `-`, up to 64 characters, starting with a letter/number. Keep ids stable after importing. `host` accepts a conservative alias/hostname or `user@host`; use SSH config for identity files/proxies rather than putting credentials into plugin configuration. Optional `label` defaults to the id. Unsupported config fields are rejected.

`codexHome` must be an absolute POSIX path (`platform: posix`), a drive-absolute path such as `C:\Users\User\.codex` (`platform: windows`), or `~/…`, without `..` traversal. Windows UNC/device roots are rejected. Symlinked/reparse source ancestors, sessions root, directories and files are not followed. Move/select the real directory if your Codex home is symlinked.

Mappings use longest **normalized component prefix**; `/srv/projects` does not match `/srv/projects-other`. `from` is absolute in the source platform; Windows origins use case-insensitive drive-path matching and accept either slash style. `to` must be an absolute local path. Windows-unsafe suffix components are rejected rather than normalized into a different directory. An unmapped path is not guessed or created. Mappings do not copy project files. After the first import, the persisted session cwd is immutable: changing a mapping for an existing session is reported and import/preview refuses to silently remap it. Keep the old mapping or use a new source id for a separate import.

Default budget: 60 seconds per snapshot, 1000 rollout files, 256 MiB transferred and retained decoded data, 64 MiB per rollout. Catalog and preview take fresh snapshots as well. Increase limits only for trusted sources and available memory/disk. The current importer reads staged files into memory; this is bounded, not streaming conversion.

## Use

Open **Codex Sync → Import from Codex**, select the configured SSH source, choose conversations, and click **Preview**. The UI shows the source cwd and mapped local directory/history-only status. The Import button stays disabled until a preview succeeds for exactly that source, selection and filters. Changes invalidate the preview. Preview is a fresh read, not a transactional freeze; a remote thread can change before the final import.

Commands:

```text
/import-codex --sources
/import-codex --source lab --list
/import-codex --source lab --dry-run --limit 20
/import-codex --source lab --ids ssh-codex-3-lab-THREAD_ID
/import-codex --source lab --all --dry-run
/import-codex --source lab --all
```

Prefer copying ids from the catalog rather than constructing them. Remote ids use `ssh-codex-<source-id-length>-<source-id>-<thread-id>`; this is disjoint from local `codex-*` ids and unambiguous even if ids contain hyphens. A thread imported from different sources is intentionally a separate DSH session. Re-import from the same source appends new history idempotently using the existing importer.

The deferred agent tool exposes `sources`, `catalog`, `preview`, `import` with the same operation. Agent catalog results bound projects/sessions and report truncation; `offset` pages projects. The GUI is preferable for projects with over 50 conversations. Commands/tools should preview before writing; only the UI enforces the preview button gate. SSH writes require selected `ids` or explicit `all: true`/`--all`.

## Data and failure handling

A random snapshot directory is created under the user's OS temporary directory and removed after the operation, after subprocess pipes/readers have drained. Directories/files request modes 0700/0600; Windows uses the account's inherited temp ACLs rather than POSIX mode enforcement. No snapshot is stored in the checkout or profile. As with any temporary-file cleanup, a power loss/process crash can leave an abandoned directory; remove abandoned `dsh-codex-ssh-*` directories only after verifying no operation is active.

Host timeout, cancellation, incomplete protocol, bad host key, failed authentication, missing source root and aggregate limits surface as failures. Remote failures never fall back to importing local sessions. Import writes are serialized across command, HTTP and tool callers. Cancellation stops new writes after the next checked boundary; completed writes are not rolled back, and a batch is not an atomic transaction. Retrying normally is idempotent.

Catalog/preview/import each reads the remote again. An actively written rollout can include a partial final JSONL line; the existing parser tolerates malformed lines. For a strict archival snapshot, pause Codex writes or import a stable source copy. Saved titles from SQLite are not read (upstream PR #6 is not bundled here). Remote errors/logs should be treated as untrusted data, never as commands or model instructions.

## Validation and release gate

Hermetic tests use synthetic data and fake SSH processes: strict arguments, protocol corruption, cancellation/timeout cleanup, decoded/wire limits, compressed multiple frames/checksums, dual-copy deduplication, continuation order, namespace separation, cwd mapping and shared UI/command/tool operations. POSIX Python filesystem/symlink fixtures are skipped on Windows; they still need Linux CI or a Linux acceptance run. Windows fixtures execute the real Win32/Python reader locally, including junction/root rejection, byte preservation, budgets and cleanup. A real Windows OpenSSH catalog + three-session dry-run was also exercised with a 4 MiB per-rollout bound: 19 projects, 27 visible sessions, 25 oversized skips, zero persistence writes and cleaned temporary storage. The full source was not imported. One initial transfer was truncated and safely rejected; later repeated reads passed. Live GUI and Linux fixture acceptance remain separate.

Follow the repository release gate: local tests → packed artifact acceptance in an isolated/non-production DSH profile → user confirmation → GitHub code push; npm publication needs separate authorization. Do not replace the user's active desktop plugin just to run the tests.
