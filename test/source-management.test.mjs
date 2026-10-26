import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSourceManagement, sourceManagementToolParameters } from '../lib/source-management.mjs'

function fixture(initial = {}, sessions = []) {
  let config = structuredClone(initial), probes = 0, edits = 0
  const entry = { options: { name: 'dsh-codex-sync', config } }
  const editor = {
    entries: () => [entry],
    async edit(target, change) { assert.equal(target, entry); edits++; config = change(config, {}); entry.options.config = config },
  }
  const ctx = { get(name) { return name === 'configEditor' ? editor : name === 'sessionPersistence' ? { list: async () => sessions } : undefined } }
  const service = createSourceManagement(ctx, initial, async source => { probes++; return { ok: true, platform: source.platform, sessionRoot: true } })
  return { service, editor, entry, ctx, get config() { return config }, get probes() { return probes }, get edits() { return edits } }
}

test('source manager list/save/edit/delete preserve unrelated settings and never connect', async () => {
  const f = fixture({ maxSkills: 7, mcpMirror: false, sshSources: { inherited: { host: 'old.invalid' } } })
  const before = await f.service.execute({ action: 'list' })
  assert.equal(before.writable, true)
  const added = await f.service.execute({ action: 'save', id: 'lab', source: { host: 'test.invalid', platform: 'windows' }, revision: before.revision })
  assert.equal(added.sources.length, 2)
  assert.equal(f.config.maxSkills, 7)
  assert.equal(f.config.mcpMirror, false)
  assert.equal(f.probes, 0)
  assert.equal(added.sources.find(s => s.id === 'lab').codexHome, '~/.codex')
  const next = await f.service.execute({ action: 'save', id: 'lab', source: { host: 'test.invalid', label: 'Renamed' }, revision: added.revision })
  const removed = await f.service.execute({ action: 'delete', id: 'inherited', revision: next.revision })
  assert.deepEqual(removed.sources.map(s => s.id), ['lab'])
  assert.equal(f.probes, 0)
  await f.service.execute({ action: 'delete', id: 'lab', revision: removed.revision })
  assert.deepEqual(f.config.sshSources, {})
})

test('source revisions reject stale edits including changes inside configEditor lock', async () => {
  const f = fixture()
  const start = await f.service.execute({ action: 'list' })
  const a = f.service.execute({ action: 'save', id: 'a', source: { host: 'a.invalid' }, revision: start.revision })
  const b = f.service.execute({ action: 'save', id: 'b', source: { host: 'b.invalid' }, revision: start.revision })
  await a
  await assert.rejects(b, { code: 'SOURCE_CONFLICT' })
  const current = await f.service.execute({ action: 'list' })
  const edit = f.editor.edit
  f.editor.edit = async (entry, change) => { entry.options.config.sshSources.external = { host: 'external.invalid' }; await edit(entry, change) }
  await assert.rejects(f.service.execute({ action: 'delete', id: 'a', revision: current.revision }), { code: 'SOURCE_CONFLICT' })
})

test('source validation rejects credentials/options, malformed IDs and request fields before persistence', async () => {
  const f = fixture()
  const { revision } = await f.service.execute({ action: 'list' })
  for (const source of [{ host: '-bad' }, { host: 'test.invalid', password: 'not accepted' }, { host: 'test.invalid', executable: 'shell' }, { host: 'test.invalid', port: 70000 }, { host: 'test.invalid', codexHome: '~/../secret' }]) {
    await assert.rejects(f.service.execute({ action: 'save', id: 'lab', source, revision }))
  }
  await assert.rejects(f.service.execute({ action: 'save', id: '__proto__', source: { host: 'test.invalid' }, revision }), { code: 'SOURCE_REQUEST' })
  await assert.rejects(f.service.execute({ action: 'list', host: 'unexpected.invalid' }), { code: 'SOURCE_REQUEST' })
  assert.equal(f.edits, 0)
  assert.equal(f.probes, 0)
})

test('explicit test supports unsaved drafts but never persists or imports', async () => {
  const f = fixture({ sshSources: { lab: { host: 'saved.invalid' } } })
  assert.deepEqual(await f.service.execute({ action: 'test', id: 'draft', source: { host: 'draft.invalid', platform: 'windows' } }), { ok: true, platform: 'windows', sessionRoot: true })
  assert.equal((await f.service.execute({ action: 'test', id: 'lab' })).platform, 'posix')
  assert.equal(f.probes, 2)
  assert.equal(f.edits, 0)
  await assert.rejects(f.service.execute({ action: 'test', id: 'absent' }), { code: 'SOURCE_NOT_FOUND' })
})

test('imported source identity cannot be rebound or resurrected after delete', async () => {
  const f = fixture({ sshSources: { lab: { host: 'saved.invalid' } } }, [{ id: 'ssh-codex-3-lab-thread' }])
  let current = await f.service.execute({ action: 'list' })
  for (const source of [{ host: 'other.invalid' }, { host: 'saved.invalid', platform: 'windows' }, { host: 'saved.invalid', codexHome: '/other' }, { host: 'saved.invalid', port: 2222 }]) {
    await assert.rejects(f.service.execute({ action: 'save', id: 'lab', source, revision: current.revision }), { code: 'SOURCE_IN_USE' })
  }
  current = await f.service.execute({ action: 'save', id: 'lab', source: { host: 'saved.invalid', label: 'New label', maxFiles: 12 }, revision: current.revision })
  current = await f.service.execute({ action: 'delete', id: 'lab', revision: current.revision })
  await assert.rejects(f.service.execute({ action: 'save', id: 'lab', source: { host: 'new.invalid' }, revision: current.revision }), { code: 'SOURCE_IN_USE' })
})

test('read-only hosts and persistence failures are explicit; pre-aborted calls do nothing', async () => {
  const readonly = createSourceManagement({ get: () => undefined }, { sshSources: { lab: { host: 'test.invalid' } } })
  const data = await readonly.execute({ action: 'list' })
  assert.equal(data.writable, false)
  assert.ok(data.reason)
  await assert.rejects(readonly.execute({ action: 'delete', id: 'lab', revision: data.revision }), { code: 'SOURCE_READ_ONLY' })
  const f = fixture()
  const { revision } = await f.service.execute({ action: 'list' })
  f.editor.edit = async () => { throw new Error('Disk write failed') }
  await assert.rejects(f.service.execute({ action: 'save', id: 'lab', source: { host: 'test.invalid' }, revision }), /Disk write failed/)
  assert.deepEqual(f.config, {})
  const controller = new AbortController(); controller.abort()
  await assert.rejects(f.service.execute({ action: 'test', id: 'lab', source: { host: 'test.invalid' } }, { signal: controller.signal }))
  assert.equal(f.probes, 0)
  assert.equal(sourceManagementToolParameters.additionalProperties, false)
})
