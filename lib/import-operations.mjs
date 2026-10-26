/** One import operation shared by HTTP, commands and the deferred agent tool. */
import { importCodex, listImportCatalog } from './import-service.js'
import { normalizeSshSources, withSshSnapshot } from './ssh-source.mjs'

function validateRequest(request) {
  if (!request || !['sources', 'catalog', 'preview', 'import'].includes(request.action)) throw new Error('Unknown Codex import action')
  if (request.source !== undefined && typeof request.source !== 'string') throw new Error('source must be a configured source id')
  if (request.ids !== undefined && (!Array.isArray(request.ids) || request.ids.length > 1000 || request.ids.some((id) => typeof id !== 'string' || !id || id.length > 256))) throw new Error('ids must contain at most 1000 session ids')
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 1000)) throw new Error('limit must be an integer from 1 to 1000')
  if (request.since !== undefined && (typeof request.since !== 'number' || !Number.isFinite(request.since))) throw new Error('since must be a timestamp in milliseconds')
  if (request.project !== undefined && typeof request.project !== 'string') throw new Error('project must be a string')
}

export function createImportOperations(ctx, config, localCodexHome, enabled = () => true, snapshot = withSshSnapshot) {
  // Invalid source settings fail at plugin activation, before any remote I/O.
  const sources = normalizeSshSources(config.sshSources)
  const publicSources = () => sources.map(({ id, label }) => ({ id, label, kind: 'ssh' }))
  // Serialize writes across local/remote commands, HTTP and tool callers. Catalog/preview remain independent reads.
  let writeTail = Promise.resolve()
  async function execute(request, { signal } = {}) {
    validateRequest(request)
    signal?.throwIfAborted()
    if (request.action === 'sources') return { sources: publicSources() }
    if (!enabled()) throw new Error('Codex import is disabled')
    const persistence = ctx.get('sessionPersistence')
    if (!persistence) throw new Error('sessionPersistence unavailable')
    const source = request.source ? sources.find((entry) => entry.id === request.source) : null
    if (request.source && !source) throw new Error(`Unknown SSH source: ${request.source}`)
    if (source && request.action === 'import' && !request.ids?.length && request.all !== true) throw new Error('SSH import requires selected ids or explicit --all; use preview first')
    const options = {
      ids: request.ids,
      importSubagents: request.includeSubagents === true || config.importSubagents === true,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
      ...(request.project === undefined ? {} : { project: request.project }),
      ...(request.since === undefined ? {} : { since: request.since }),
      ...(config.maxSessionBytes === undefined ? {} : { maxSessionBytes: config.maxSessionBytes }),
      dryRun: request.action === 'preview',
      signal,
      ...(source ? { remoteSource: source, maxSessionBytes: source.maxSessionBytes } : {}),
    }
    const run = async ({ codexHome, skippedBig = 0, unreadable = 0 }) => {
      signal?.throwIfAborted()
      if (request.action === 'catalog') {
        const catalog = await listImportCatalog(persistence, options, codexHome)
        return { ...catalog, skippedBig: catalog.skippedBig + skippedBig, unreadable: catalog.unreadable + unreadable,
          ...(source ? { source: { id: source.id, label: source.label, kind: 'ssh' } } : {}) }
      }
      if (source && (request.action === 'preview' || request.action === 'import')) {
        const catalog = await listImportCatalog(persistence, options, codexHome)
        const available = new Set()
        const walk = nodes => { for (const node of nodes) {
          if (node.mappingChanged && (!request.ids?.length || request.ids.includes(node.id) || request.ids.includes(node.rawId))) throw new Error(`SSH cwd mapping changed for ${node.id}; keep the original mapping or use a new source id`)
          available.add(node.id); available.add(node.rawId); walk(node.children)
        } }
        for (const project of catalog.projects) walk(project.sessions)
        for (const id of request.ids ?? []) if (!available.has(id)) throw new Error(`Selected SSH session is unavailable: ${id}`)
      }
      const lines = await importCodex(ctx, persistence, options, codexHome)
      if (source) {
        lines.unshift(`[ssh:${source.id}] read-only source; cwd is mapped locally or omitted (history only). Tools do not automatically execute through SSH.`)
        if (skippedBig || unreadable) lines.push(`[ssh:${source.id}] oversized-skipped ${skippedBig}, unreadable ${unreadable}`)
      }
      return { ok: true, text: lines.join('\n') }
    }
    return source ? snapshot(source, run, { signal }) : run({ codexHome: localCodexHome })
  }
  return {
    sources: publicSources,
    exclusive(operation) {
      const result = writeTail.then(operation)
      writeTail = result.catch(() => {})
      return result
    },
    execute(request, context) {
      if (request?.action !== 'import') return execute(request, context)
      const result = writeTail.then(() => execute(request, context))
      writeTail = result.catch(() => {})
      return result
    },
  }
}

export const importToolParameters = {
  type: 'object', additionalProperties: false,
  properties: {
    action: { type: 'string', enum: ['sources', 'catalog', 'preview', 'import'], description: 'Discover configured sources, browse conversations, preview changes without writing, or import selected history into DSH.' },
    source: { type: 'string', description: 'SSH source id from sources; omit for local Codex.' },
    ids: { type: 'array', items: { type: 'string' }, description: 'Session ids from catalog. Required for SSH import unless all=true.' },
    all: { type: 'boolean', description: 'Explicitly import all matching SSH sessions. Defaults to false.' },
    includeSubagents: { type: 'boolean', description: 'Include Codex subagent threads; default false.' },
    limit: { type: 'integer', description: 'Maximum sessions to import or preview, from 1 to 1000.' },
    project: { type: 'string', description: 'Filter by source project path substring.' },
    since: { type: 'number', description: 'Only sessions created at or after this Unix timestamp in milliseconds.' },
    offset: { type: 'integer', description: 'Catalog project offset; default 0. Agent results contain at most 20 projects.' },
  },
  required: ['action'],
}

export function compactImportCatalog(result, offset = 0) {
  if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer')
  if (!Array.isArray(result.projects)) return result
  const projects = result.projects.slice(offset, offset + 20).map((project) => ({
    ...project, sessions: project.sessions.slice(0, 50).map(({ children, ...session }) => ({
      ...session, children: children.slice(0, 10).map(({ children: nested, ...child }) => ({ ...child, childCount: nested.length })),
      ...(children.length > 10 ? { childrenTruncated: true } : {}),
    })), sessionCount: project.sessions.length, sessionsTruncated: project.sessions.length > 50,
  }))
  return { ...result, projects, totalProjects: result.projects.length, offset,
    nextOffset: offset + projects.length < result.projects.length ? offset + projects.length : null }
}
