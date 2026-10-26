import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createImportOperations, compactImportCatalog } from '../lib/import-operations.mjs'
import { importSessionId, mappedImportCwd } from '../lib/import-service.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'cx-operations-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'sessions', '2026', '10', '01')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'rollout-fixture.jsonl')
  const message = (role, text, time = '2026-10-01T00:00:01Z') => JSON.stringify({ type: 'response_item', timestamp: time, payload: { type: 'message', role, content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }] } })
  writeFileSync(file, [JSON.stringify({ type: 'session_meta', payload: { id: 'thread-1', cwd: '/home/dev/project', timestamp: '2026-10-01T00:00:00Z' } }), message('user', 'hello'), message('assistant', 'world')].join('\n') + '\n')
  const metas = new Map(), events = new Map(), attached = []
  const persistence = {
    async list() { return [...metas.values()] },
    async create(meta) { metas.set(meta.id, meta); events.set(meta.id, []) },
    async append(id, next) { events.set(id, [...events.get(id), ...next]) },
    async inspect(id) { return { meta: metas.get(id), events: events.get(id) } },
  }
  const registry = {
    async resolveByPath() { return undefined },
    async create(path) { return { title: 'custom', async attachSession(id) { attached.push({ path, id }) } } },
  }
  const ctx = { get: key => key === 'sessionPersistence' ? persistence : key === 'workspaceRegistry' ? registry : undefined }
  let snapshots = 0
  const snapshot = async (source, cb, { signal }) => { signal?.throwIfAborted(); snapshots++; return cb({ codexHome: root, source, skippedBig: 2, unreadable: 1 }) }
  const config = { sshSources: { lab: { host: 'example.invalid', label: 'Lab', cwdMappings: [{ from: '/home/dev', to: 'C:\\Work' }] }, other: { host: 'other.invalid' } } }
  return { root, file, message, ctx, persistence, config, snapshot, metas, events, attached, snapshots: () => snapshots }
}

test('operations: sources expose no host/options; unknown id fails before snapshot', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  assert.deepEqual(await ops.execute({ action: 'sources' }), { sources: [{ id: 'lab', label: 'Lab', kind: 'ssh' }, { id: 'other', label: 'other', kind: 'ssh' }] })
  await assert.rejects(ops.execute({ action: 'catalog', source: 'missing' }), /Unknown SSH source/)
  assert.equal(f.snapshots(), 0)
})

test('operations: local behavior, remote namespaces, mapped cwd and original catalog grouping', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  const remote = await ops.execute({ action: 'catalog', source: 'lab' })
  assert.deepEqual(remote.source, { id: 'lab', label: 'Lab', kind: 'ssh' })
  assert.equal(remote.projects[0].cwd, '/home/dev/project')
  assert.equal(remote.projects[0].sourceCwd, '/home/dev/project')
  assert.equal(remote.projects[0].mappedCwd, 'C:\\Work\\project')
  const id = remote.projects[0].sessions[0].id
  assert.match(id, /^ssh-codex-/)
  assert.equal(remote.skippedBig, 2)
  assert.equal(remote.unreadable, 1)
  await ops.execute({ action: 'import', source: 'lab', ids: [id] })
  await ops.execute({ action: 'import', ids: ['codex-thread-1'] })
  assert.equal(f.metas.size, 2)
  assert.equal(f.metas.get(id).cwd, 'C:\\Work\\project')
  assert.equal(f.metas.get('codex-thread-1').cwd, '/home/dev/project')
  assert.ok(f.attached.some(entry => entry.id === id && entry.path === 'C:\\Work\\project'))
})

test('operations: remote preview writes nothing, unmapped import has no cwd, repeat import idempotent', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  const preview = await ops.execute({ action: 'preview', source: 'other' })
  assert.equal(preview.ok, true)
  assert.match(preview.text, /history only; no local cwd/)
  assert.equal(f.metas.size, 0)
  assert.equal(f.attached.length, 0)
  const result = await ops.execute({ action: 'import', source: 'other', all: true })
  assert.match(result.text, /imported 1/)
  const meta = [...f.metas.values()][0]
  assert.equal(meta.cwd, undefined)
  const count = f.events.get(meta.id).length
  assert.equal(f.attached.length, 0)
  await ops.execute({ action: 'import', source: 'other', all: true })
  assert.equal(f.metas.size, 1)
  assert.equal(f.events.get(meta.id).length, count)
})

test('operations: SSH update appends only new events and requires ids or explicit all', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  await assert.rejects(ops.execute({ action: 'import', source: 'lab' }), /selected ids/)
  await ops.execute({ action: 'import', source: 'lab', all: true })
  const id = [...f.metas.keys()][0], old = f.events.get(id).length
  appendFileSync(f.file, f.message('user', 'followup', '2026-10-01T00:01:00Z') + '\n' + f.message('assistant', 'reply', '2026-10-01T00:01:01Z') + '\n')
  const result = await ops.execute({ action: 'import', source: 'lab', ids: [id] })
  assert.match(result.text, /updated 1/)
  assert.ok(f.events.get(id).length > old)
})

test('operations: disabled, aborted and malformed requests never connect or write', async t => {
  const f = fixture(t)
  const off = createImportOperations(f.ctx, f.config, f.root, () => false, f.snapshot)
  await assert.rejects(off.execute({ action: 'catalog', source: 'lab' }), /disabled/)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(ops.execute({ action: 'import', source: 'lab', all: true }, { signal: controller.signal }), /abort/i)
  await assert.rejects(ops.execute({ action: 'preview', source: 'lab', ids: 'all' }), /ids/)
  await assert.rejects(ops.execute({ action: 'preview', limit: NaN }), /limit/)
  assert.equal(f.snapshots(), 0)
  assert.equal(f.metas.size, 0)
})

test('operations: concurrent writes serialize and duplicate requests remain idempotent', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  await Promise.all([ops.execute({ action: 'import', source: 'lab', all: true }), ops.execute({ action: 'import', source: 'lab', all: true })])
  assert.equal(f.metas.size, 1)
})

test('mapping: longest prefix, component boundary, POSIX/Windows outputs, no implicit remote cwd', () => {
  const remoteSource = { id: 'lab', cwdMappings: [{ from: '/srv', to: '/work' }, { from: '/srv/project', to: 'D:\\Repo' }] }
  assert.equal(mappedImportCwd('/srv/project/sub', { remoteSource }), 'D:\\Repo\\sub')
  assert.equal(mappedImportCwd('/srv/other', { remoteSource }), process.platform === 'win32' ? '\\work\\other' : '/work/other')
  assert.equal(mappedImportCwd('/srv-other', { remoteSource }), undefined)
  assert.equal(mappedImportCwd('/elsewhere', { remoteSource }), undefined)
  assert.equal(mappedImportCwd('/original', {}), '/original')
  assert.throws(() => mappedImportCwd('/srv/project/a\\..\\outside', { remoteSource }), /safely/)
  assert.notEqual(importSessionId('thread-1', { remoteSource }), importSessionId('thread-1'))
})

test('source ids cannot alias local ids or ambiguous source/raw boundaries', () => {
  assert.notEqual(importSessionId('b-c', { remoteSource: { id: 'a' } }), importSessionId('c', { remoteSource: { id: 'a-b' } }))
  assert.notEqual(importSessionId('thread', { remoteSource: { id: 'a' } }), importSessionId('ssh-a-thread'))
})

test('cwd mappings rank normalized component prefixes, not raw spelling length', () => {
  const remoteSource = { id: 'lab', cwdMappings: [{ from: '/a/////////', to: 'C:\\broad' }, { from: '/a/b', to: 'C:\\specific' }] }
  assert.equal(mappedImportCwd('/a/b/sub', { remoteSource }), 'C:\\specific\\sub')
})

test('existing SSH imports refuse cwd mapping drift before appending or reattaching', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  await ops.execute({ action: 'import', source: 'lab', all: true })
  const id = [...f.metas.keys()][0]
  f.metas.get(id).cwd = 'C:\\old'
  const attachmentCount = f.attached.length
  const result = await ops.execute({ action: 'catalog', source: 'lab' })
  assert.equal(result.projects[0].sessions[0].mappingChanged, true)
  assert.equal(result.projects[0].sessions[0].cwd, 'C:\\old')
  await assert.rejects(ops.execute({ action: 'preview', source: 'lab', ids: [id] }), /mapping changed/)
  await assert.rejects(ops.execute({ action: 'import', source: 'lab', ids: [id] }), /mapping changed/)
  assert.equal(f.attached.length, attachmentCount)
})

test('cancellation during existing-session inspection starts no append', async t => {
  const f = fixture(t)
  const ops = createImportOperations(f.ctx, f.config, f.root, () => true, f.snapshot)
  await ops.execute({ action: 'import', source: 'lab', all: true })
  const controller = new AbortController(), id = [...f.metas.keys()][0]
  const before = f.events.get(id).length
  appendFileSync(f.file, f.message('user', 'new', '2026-10-01T01:00:00Z') + '\n')
  const inspect = f.persistence.inspect.bind(f.persistence)
  f.persistence.inspect = async key => { const view = await inspect(key); controller.abort(); return view }
  await assert.rejects(ops.execute({ action: 'import', source: 'lab', all: true }, { signal: controller.signal }), /abort/i)
  assert.equal(f.events.get(id).length, before)
})

test('Windows mapping rejects slash-root and UNC escapes and special filename aliases', { skip: process.platform !== 'win32' }, () => {
  for (const to of ['/safe/root', '//server/share/safe', 'C:\\safe']) {
    const remoteSource = { id: 'lab', cwdMappings: [{ from: '/remote', to }] }
    for (const suffix of ['..\\..\\outside', 'ads:stream', 'NUL', 'trailing.', 'trailing ']) {
      assert.throws(() => mappedImportCwd('/remote/' + suffix, { remoteSource }), /safely/)
    }
  }
})

test('agent catalog is bounded and explicitly reports continuation/truncation', () => {
  const session = { id: 'x', children: [] }
  const result = compactImportCatalog({ projects: Array.from({ length: 21 }, () => ({ sessions: Array.from({ length: 51 }, () => session) })) })
  assert.equal(result.projects.length, 20)
  assert.equal(result.projects[0].sessions.length, 50)
  assert.equal(result.projects[0].sessionsTruncated, true)
  assert.equal(result.nextOffset, 20)
  assert.equal(compactImportCatalog({ projects: [] }, 20).nextOffset, null)
})
