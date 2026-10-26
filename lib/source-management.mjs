/** Validated source configuration shared by the UI and agent; never writes profile files. */
import { createHash } from 'node:crypto'
import { normalizeSshSources } from './ssh-source.mjs'

const failure = (code, message) => Object.assign(new Error(message), { code })
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u
const withoutId = ({ id, ...value }) => value
const sourcesObject = sources => Object.fromEntries(sources.map(source => [source.id, withoutId(source)]))
function normalized(raw) {
  const sources = normalizeSshSources(raw)
  if (sources.length > 100) throw failure('SOURCE_CONFIG', 'At most 100 SSH sources are supported')
  return sources
}
function revisionOf(sources) {
  return createHash('sha256').update(JSON.stringify([...sources].sort((a, b) => a.id.localeCompare(b.id)))).digest('hex')
}
function identity(source) {
  const root = source.platform === 'windows' ? source.codexHome.replaceAll('/', '\\').toLowerCase().replace(/\\+$/u, '') : source.codexHome.replace(/\/+$/u, '')
  return JSON.stringify([source.host, source.port ?? null, source.platform, root])
}
function validate(request) {
  if (!plain(request) || !['list', 'save', 'delete', 'test'].includes(request.action)) throw failure('SOURCE_REQUEST', 'Unknown SSH source operation')
  const keys = { list: ['action'], save: ['action', 'id', 'source', 'revision'], delete: ['action', 'id', 'revision'], test: ['action', 'id', 'source'] }[request.action]
  if (Object.keys(request).some(key => !keys.includes(key))) throw failure('SOURCE_REQUEST', 'Unsupported SSH source request field')
  if (request.action !== 'list' && (typeof request.id !== 'string' || !idPattern.test(request.id))) throw failure('SOURCE_REQUEST', 'A stable source id is required (letters, digits, hyphen or underscore)')
  if (['save', 'delete'].includes(request.action) && typeof request.revision !== 'string') throw failure('SOURCE_REQUEST', 'List sources first and send the returned revision')
  if (request.action === 'save' && !plain(request.source)) throw failure('SOURCE_CONFIG', 'source must be a configuration object')
}

export function createSourceManagement(ctx, config = {}, probe, exclusive = run => run()) {
  let tail = Promise.resolve()
  function current() {
    const editor = ctx.get('configEditor')
    const entries = editor?.entries?.().filter(entry => entry.options?.name === 'dsh-codex-sync') ?? []
    const entry = entries.length === 1 ? entries[0] : undefined
    const sources = normalized(entry ? entry.options.config?.sshSources : config.sshSources)
    return { editor, entry, sources }
  }
  function list() {
    const { editor, entry, sources } = current()
    const writable = !!entry && typeof editor?.edit === 'function'
    return { revision: revisionOf(sources), writable, sources,
      ...(!writable ? { reason: 'This host has no unambiguous editable plugin configuration. Use the normal profile configuration or upgrade Harness.' } : {}) }
  }
  async function execute(request, { signal } = {}) {
    validate(request)
    signal?.throwIfAborted()
    if (request.action === 'list') return list()
    const state = current()
    const before = state.sources.find(source => source.id === request.id)
    if (request.action === 'test') {
      const source = request.source === undefined ? before : normalized({ [request.id]: request.source })[0]
      if (!source) throw failure('SOURCE_NOT_FOUND', 'Unknown SSH source')
      if (typeof probe !== 'function') throw failure('SOURCE_READ_ONLY', 'SSH connection testing is unavailable')
      return probe(source, { signal })
    }
    if (!state.entry || typeof state.editor?.edit !== 'function') throw failure('SOURCE_READ_ONLY', list().reason)
    if (request.revision !== revisionOf(state.sources)) throw failure('SOURCE_CONFLICT', 'SSH sources changed in another window. Reload the list before editing.')
    const candidate = request.action === 'save' ? normalized({ [request.id]: request.source })[0] : null
    if (request.action === 'delete' && !before) throw failure('SOURCE_NOT_FOUND', 'Unknown SSH source')
    // The shared import write queue drains before this check; an id may not point
    // previously imported history at a different machine or resurrect a deleted id.
    if (candidate && (!before || identity(before) !== identity(candidate))) {
      const persistence = ctx.get('sessionPersistence')
      if (!persistence?.list) throw failure('SOURCE_READ_ONLY', 'Session history is unavailable; cannot verify safe source identity changes')
      const sessions = await persistence.list()
      const prefix = `ssh-codex-${request.id.length}-${request.id}-`
      if (sessions.some(session => session.id?.startsWith(prefix))) throw failure('SOURCE_IN_USE', 'This source id already owns imported history. Use a new source id for a different host, port, platform or Codex home.')
    }
    signal?.throwIfAborted()
    await state.editor.edit(state.entry, currentConfig => {
      signal?.throwIfAborted()
      const sources = normalized(currentConfig.sshSources)
      if (revisionOf(sources) !== request.revision) throw failure('SOURCE_CONFLICT', 'SSH sources changed before this edit was saved. Reload the list.')
      const next = sources.filter(source => source.id !== request.id)
      if (candidate) next.push(candidate)
      normalized(sourcesObject(next))
      return { ...currentConfig, sshSources: sourcesObject(next) }
    })
    // A row edit can unload this plugin. The write is committed; do not claim it
    // was cancelled because its old lifecycle was disposed during reconciliation.
    return list()
  }
  return { execute(request, context) {
    if (!['save', 'delete'].includes(request?.action)) return execute(request, context)
    const work = tail.then(() => exclusive(() => execute(request, context)))
    tail = work.catch(() => {})
    return work
  } }
}

const sourceSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    host: { type: 'string', description: 'Local SSH config alias or user@host. Authentication remains in local OpenSSH.' },
    label: { type: 'string' }, platform: { type: 'string', enum: ['posix', 'windows'] },
    codexHome: { type: 'string', description: 'Absolute remote Codex home, or ~/.codex. No traversal.' },
    port: { type: 'integer' },
    cwdMappings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
    timeoutMs: { type: 'integer' }, maxFiles: { type: 'integer' }, maxTotalBytes: { type: 'integer' }, maxSessionBytes: { type: 'integer' },
  }, required: ['host'],
}
export const sourceManagementToolParameters = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['list', 'save', 'delete', 'test'] },
    id: { type: 'string', description: 'Stable source id for save/delete/test. Do not reuse deleted ids that own imported histories.' },
    revision: { type: 'string', description: 'Required for save/delete: use the latest list revision; reload on conflict.' },
    source: { ...sourceSchema, description: 'Complete replacement configuration for save, optional unsaved draft for test. No password, key contents, executable or arbitrary SSH options.' },
  }, required: ['action'],
}
