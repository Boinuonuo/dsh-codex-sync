/** Read-only SSH rollout snapshots. No executable, SSH flags or shell fragments come from config. */
import { spawn } from 'node:child_process'
import { mkdtemp, chmod, mkdir, open, rename, rm } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix, win32 } from 'node:path'
import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import * as zlib from 'node:zlib'
import { WINDOWS_REMOTE_SCRIPT, buildWindowsCommand } from './ssh-windows.mjs'

const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u
const HOST = /^(?:[a-zA-Z0-9_][a-zA-Z0-9_.-]*@)?(?:[a-zA-Z0-9][a-zA-Z0-9_.-]*|\[[a-fA-F0-9:]+\])$/u
const CONTROL = /[\x00-\x1f\x7f]/u
const DEFAULTS = { timeoutMs: 60000, maxFiles: 1000, maxTotalBytes: 268435456, maxSessionBytes: 67108864 }
const FIELDS = new Set(['host', 'label', 'platform', 'codexHome', 'port', 'cwdMappings', ...Object.keys(DEFAULTS)])
const isWindowsAbsolute = path => /^[A-Za-z]:[\\/]/u.test(path)
const safeWindowsTail = path => !path.split(/[\\/]/u).includes('..') && !/[:<>"|?*]/u.test(path)
const safeWindowsPath = path => isWindowsAbsolute(path) && safeWindowsTail(path.slice(2))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const fail = (code, message) => Object.assign(new Error(message), { code })

function positive(value, field, fallback) {
  const number = value === undefined ? fallback : value
  if (!Number.isSafeInteger(number) || number < 1) throw fail('SSH_CONFIG', `${field} must be a positive safe integer`)
  if (field === 'timeoutMs' && number > 300000) throw fail('SSH_CONFIG', 'timeoutMs must not exceed 300000')
  return number
}

function normalizeSource(id, value) {
  if (!ID.test(id)) throw fail('SSH_CONFIG', `Invalid SSH source id: ${id}`)
  if (!object(value)) throw fail('SSH_CONFIG', `SSH source ${id} must be an object`)
  for (const key of Object.keys(value)) if (!FIELDS.has(key)) throw fail('SSH_CONFIG', `Unsupported SSH source setting: ${key}`)
  if (typeof value.host !== 'string' || value.host.length > 255 || !HOST.test(value.host)) throw fail('SSH_CONFIG', `Invalid SSH host for ${id}; use a config alias or user@host`)
  const label = value.label === undefined ? id : value.label
  if (typeof label !== 'string' || !label.trim() || label.length > 128 || CONTROL.test(label)) throw fail('SSH_CONFIG', 'SSH source label must be a nonempty string of at most 128 characters')
  const platform = value.platform ?? 'posix'
  if (!['posix', 'windows'].includes(platform)) throw fail('SSH_CONFIG', 'platform must be posix or windows')
  const codexHome = value.codexHome === undefined ? '~/.codex' : value.codexHome
  const homeRelative = typeof codexHome === 'string' && (codexHome === '~' || /^~[\\/]/u.test(codexHome)) && !codexHome.split(/[\\/]/u).includes('..')
  const validHome = platform === 'windows'
    ? typeof codexHome === 'string' && (safeWindowsPath(codexHome) || (homeRelative && safeWindowsTail(codexHome))) && !codexHome.startsWith('\\\\')
    : typeof codexHome === 'string' && !codexHome.includes('\\') && !codexHome.split('/').includes('..') && (codexHome.startsWith('/') || codexHome === '~' || codexHome.startsWith('~/'))
  if (!validHome || !codexHome || codexHome.length > 4096 || CONTROL.test(codexHome)) throw fail('SSH_CONFIG', `codexHome must be an absolute ${platform} path or ~/ path, without traversal`)
  const cwdMappings = value.cwdMappings === undefined ? [] : value.cwdMappings
  if (!Array.isArray(cwdMappings) || cwdMappings.length > 1000) throw fail('SSH_CONFIG', 'cwdMappings must be an array (at most 1000 entries)')
  const roots = new Set()
  const mappings = cwdMappings.map(mapping => {
    if (!object(mapping) || Object.keys(mapping).some(key => key !== 'from' && key !== 'to')) throw fail('SSH_CONFIG', 'Each cwd mapping must contain only from and to')
    const { from, to } = mapping
    const validFrom = typeof from === 'string' && (platform === 'windows' ? safeWindowsPath(from) : from.startsWith('/') && !from.includes('\\') && !from.split('/').includes('..'))
    if (!validFrom || from.length > 4096 || CONTROL.test(from)) throw fail('SSH_CONFIG', `cwdMappings.from must be an absolute ${platform} path without traversal`)
    if (typeof to !== 'string' || to.length > 4096 || CONTROL.test(to) || !(posix.isAbsolute(to) || win32.isAbsolute(to)) || to.split(/[\\/]/u).includes('..')) throw fail('SSH_CONFIG', 'cwdMappings.to must be an absolute local path without traversal')
    const normalized = (platform === 'windows' ? win32 : posix).normalize(from)
    const root = platform === 'windows' ? normalized.replace(/[\\/]+$/u, '') + (/^[A-Za-z]:[\\/]?$/u.test(normalized) ? '\\' : '') : normalized.replace(/\/+$/u, '') || '/'
    const rootKey = platform === 'windows' ? root.toLowerCase() : root
    if (roots.has(rootKey)) throw fail('SSH_CONFIG', `Duplicate cwdMappings.from root: ${root}`)
    roots.add(rootKey)
    return { from: root, to }
  })
  const source = { id, label, host: value.host, platform, codexHome, cwdMappings: mappings }
  if (value.port !== undefined) {
    source.port = positive(value.port, 'port')
    if (source.port > 65535) throw fail('SSH_CONFIG', 'port must be between 1 and 65535')
  }
  for (const [key, fallback] of Object.entries(DEFAULTS)) source[key] = positive(value[key], key, fallback)
  return source
}

/** Normalize the named object at config.sshSources. Invalid entries fail, never disappear silently. */
export function normalizeSshSources(raw) {
  if (raw === undefined || raw === null) return []
  if (!object(raw)) throw fail('SSH_CONFIG', 'sshSources must be a named object')
  return Object.entries(raw).map(([id, value]) => normalizeSource(id, value))
}

export function getSshSource(raw, name) {
  if (typeof name !== 'string' || !ID.test(name)) throw fail('SSH_CONFIG', 'Invalid SSH source id')
  const source = normalizeSshSources(raw).find(entry => entry.id === name)
  if (!source) throw fail('SSH_SOURCE_NOT_FOUND', `Unknown SSH source: ${name}`)
  return source
}

function validatedSource(source) {
  if (!object(source)) throw fail('SSH_CONFIG', 'Expected a normalized SSH source')
  const { id, ...value } = source
  if (typeof id !== 'string') throw fail('SSH_CONFIG', 'Expected a named SSH source with id')
  return normalizeSource(id, value)
}

// Fixed POSIX-only Python program. Directory descriptors + O_NOFOLLOW protect every
// ancestor, directory and file, including rename/symlink races. Never reads auth/config/skills.
const REMOTE_SCRIPT = String.raw`import base64, errno, json, os, stat, sys, time
cfg = json.loads(base64.b64decode(sys.argv[1], validate=True))
started = time.monotonic()
count = total = scanned = skipped = unreadable = 0
out = sys.stdout.buffer
D = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
F = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK

def emit(record):
    out.write(json.dumps(record, separators=(',', ':')).encode('utf-8') + b'\n')
    out.flush()

def check_time():
    if (time.monotonic() - started) * 1000 > cfg['timeoutMs']:
        raise RuntimeError('SSH_TIMEOUT: remote snapshot timed out')

def root_fd(path):
    path = os.path.expanduser(path)
    if not os.path.isabs(path) or '..' in path.split('/'):
        raise RuntimeError('SSH_ROOT_UNSAFE: invalid root')
    fd = os.open('/', D)
    try:
        for component in path.split('/'):
            if not component or component == '.':
                continue
            newfd = os.open(component, D, dir_fd=fd)
            os.close(fd)
            fd = newfd
        return fd
    except BaseException:
        os.close(fd)
        raise

def walk(fd, parts, depth=0):
    global count, total, scanned, skipped, unreadable
    if depth > 64:
        raise RuntimeError('SSH_LIMIT: sessions directory nesting exceeds 64')
    with os.scandir(fd) as entries:
        for entry in entries:
            check_time()
            scanned += 1
            if scanned > max(10000, min(1000000, cfg['maxFiles'] * 100)):
                raise RuntimeError('SSH_LIMIT: sessions scan entry limit exceeded')
            name = entry.name
            if name in ('.', '..') or '/' in name or '\\' in name:
                unreadable += 1
                continue
            try:
                info = entry.stat(follow_symlinks=False)
            except OSError:
                unreadable += 1
                continue
            if stat.S_ISLNK(info.st_mode):
                unreadable += 1
                continue
            if stat.S_ISDIR(info.st_mode):
                try:
                    child = os.open(name, D, dir_fd=fd)
                except OSError:
                    unreadable += 1
                    continue
                try:
                    walk(child, parts + [name], depth + 1)
                finally:
                    os.close(child)
                continue
            if not (name.startswith('rollout-') and (name.endswith('.jsonl') or name.endswith('.jsonl.zst'))):
                continue
            if not stat.S_ISREG(info.st_mode):
                unreadable += 1
                continue
            count += 1
            if count > cfg['maxFiles']:
                raise RuntimeError('SSH_LIMIT: maxFiles exceeded')
            try:
                filefd = os.open(name, F, dir_fd=fd)
            except OSError:
                unreadable += 1
                continue
            with os.fdopen(filefd, 'rb') as file:
                current = os.fstat(file.fileno())
                if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
                    unreadable += 1
                    continue
                size = current.st_size
                if size > cfg['maxSessionBytes']:
                    skipped += 1
                    continue
                if total + size > cfg['maxTotalBytes']:
                    raise RuntimeError('SSH_LIMIT: maxTotalBytes exceeded')
                total += size
                emit({'type': 'file', 'path': '/'.join(parts + [name]), 'size': size})
                remaining = size
                while remaining:
                    check_time()
                    chunk = file.read(min(65536, remaining))
                    if not chunk:
                        raise RuntimeError('SSH_CHANGED: rollout truncated during snapshot')
                    out.write(chunk)
                    remaining -= len(chunk)
                out.flush()

try:
    try:
        home = root_fd(cfg['codexHome'])
        try:
            sessions = os.open('sessions', D, dir_fd=home)
        finally:
            os.close(home)
    except OSError as error:
        kind = 'SSH_ROOT_MISSING' if error.errno == errno.ENOENT else 'SSH_ROOT_UNSAFE'
        raise RuntimeError(kind + ': codexHome/sessions is absent, unreadable or symlinked')
    try:
        if cfg.get('probeOnly'):
            emit({'type': 'probe', 'platform': 'posix', 'sessionRoot': True})
        else:
            walk(sessions, [])
    finally:
        os.close(sessions)
    emit({'type': 'done', 'files': count, 'bytes': total, 'skippedBig': skipped, 'unreadable': unreadable})
except BaseException as error:
    if isinstance(error, BrokenPipeError):
        sys.exit(1)
    emit({'type': 'error', 'message': str(error)[:1000]})
    sys.exit(1)
`

function buildSshArgs(source, probeOnly = false) {
  const config = Buffer.from(JSON.stringify({ codexHome: source.codexHome, ...Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, source[key]])), ...(probeOnly ? { probeOnly: true } : {}) })).toString('base64')
  // Base64 has no shell operators or quotes. Keep quoting explicit: ssh sends
  // its remote command through the remote login shell even with shell:false here.
  const command = source.platform === 'windows' ? buildWindowsCommand(config) : `python3 -I - '${config}'`
  return ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectionAttempts=1', '-o', `ConnectTimeout=${Math.max(1, Math.ceil(source.timeoutMs / 1000))}`, ...(source.port ? ['-p', String(source.port)] : []), '--', source.host, command]
}

/** Wait for close, NOT exit: cleanup must not race an SSH/zstd process or its pipes. */
function processHandle(executable, args, dependencies, signal) {
  if (signal.aborted) throw signal.reason
  const child = dependencies.spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let processError
  let stderr = ''
  let killTimer
  let closed = false
  const stop = () => {
    if (closed) return
    child.kill('SIGTERM')
    killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL') }, 250)
    killTimer.unref?.()
  }
  const done = new Promise(resolve => {
    child.on('error', error => { processError ??= error })
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') processError ??= error })
    child.stdout.on('error', error => { processError ??= error })
    child.stderr.on('error', error => { processError ??= error })
    child.stderr.on('data', chunk => { if (stderr.length < 8192) stderr += chunk.toString('utf8').slice(0, 8192 - stderr.length) })
    child.once('close', (code, exitSignal) => {
      closed = true
      clearTimeout(killTimer)
      signal.removeEventListener('abort', stop)
      resolve({ code, exitSignal, error: processError, stderr })
    })
  })
  signal.addEventListener('abort', stop, { once: true })
  if (signal.aborted) stop()
  return { child, done, stop, drain: async () => { stop(); child.stdout.resume(); await done } }
}

class ProtocolReader {
  constructor(stream, signal) { this.iterator = stream[Symbol.asyncIterator](); this.pending = Buffer.alloc(0); this.signal = signal }
  async chunk() {
    if (this.signal.aborted) throw this.signal.reason
    const { value, done } = await this.iterator.next()
    if (done) return false
    this.pending = this.pending.length ? Buffer.concat([this.pending, value]) : value
    return true
  }
  async line() {
    while (true) {
      const at = this.pending.indexOf(10)
      if (at >= 0) {
        if (at > 16384) throw fail('SSH_PROTOCOL', 'SSH record header exceeds limit')
        const line = this.pending.subarray(0, at).toString('utf8')
        this.pending = this.pending.subarray(at + 1)
        try { return JSON.parse(line) } catch { throw fail('SSH_PROTOCOL', 'Invalid SSH snapshot record') }
      }
      if (this.pending.length > 16384) throw fail('SSH_PROTOCOL', 'SSH record header exceeds limit')
      if (!await this.chunk()) {
        if (this.pending.length) throw fail('SSH_PROTOCOL', 'Truncated SSH snapshot record')
        return undefined
      }
    }
  }
  async file(size, destination) {
    const handle = await open(destination, 'wx', 0o600)
    try {
      let remaining = size
      while (remaining) {
        if (!this.pending.length && !await this.chunk()) throw fail('SSH_PROTOCOL', 'Truncated SSH rollout body')
        if (this.signal.aborted) throw this.signal.reason
        const part = this.pending.subarray(0, Math.min(remaining, this.pending.length))
        let written = 0
        while (written < part.length) written += (await handle.write(part, written)).bytesWritten
        remaining -= part.length
        this.pending = this.pending.subarray(part.length)
      }
    } finally { await handle.close() }
  }
}

function validRemotePath(path) {
  if (typeof path !== 'string' || path.length > 4096 || CONTROL.test(path) || path.includes('\\')) return false
  const parts = path.split('/')
  return parts.every(part => part && part !== '.' && part !== '..') && /^rollout-.*\.jsonl(?:\.zst)?$/u.test(parts.at(-1))
}

// Node's native decoder can stop at the first frame and ignore trailing bytes.
// Locate every complete frame without buffering compressed payloads, then decode
// each independently; malformed/truncated/trailing data is never silently lost.
async function* decodedFrames(input, dependencies, signal) {
  const handle = await open(input, 'r')
  let offset = 0
  let frames = 0
  try {
    const { size } = await handle.stat()
    const exact = async count => {
      if (signal.aborted) throw signal.reason
      if (offset + count > size) throw fail('SSH_ZSTD', 'Truncated zstd frame')
      const bytes = Buffer.alloc(count)
      let at = 0
      while (at < count) {
        const { bytesRead } = await handle.read(bytes, at, count - at, offset + at)
        if (!bytesRead) throw fail('SSH_ZSTD', 'Truncated zstd frame')
        at += bytesRead
      }
      offset += count
      return bytes
    }
    const skip = count => {
      if (offset + count > size) throw fail('SSH_ZSTD', 'Truncated zstd frame')
      offset += count
    }
    while (offset < size) {
      if (++frames > 100000) throw fail('SSH_LIMIT', 'Too many zstd frames')
      const start = offset
      const magic = (await exact(4)).readUInt32LE()
      if ((magic & 0xfffffff0) === 0x184d2a50) {
        skip((await exact(4)).readUInt32LE())
        continue
      }
      if (magic !== 0xfd2fb528) throw fail('SSH_ZSTD', 'Invalid zstd frame magic or trailing data')
      const descriptor = (await exact(1))[0]
      if (descriptor & 0x18) throw fail('SSH_ZSTD', 'Invalid zstd frame descriptor')
      const single = Boolean(descriptor & 0x20)
      if (!single) await exact(1) // native decoder enforces windowLogMax
      await exact([0, 1, 2, 4][descriptor & 3])
      await exact([single ? 1 : 0, 2, 4, 8][descriptor >>> 6])
      let last = false
      while (!last) {
        const block = (await exact(3)).readUIntLE(0, 3)
        last = Boolean(block & 1)
        const type = (block >>> 1) & 3
        if (type === 3) throw fail('SSH_ZSTD', 'Invalid zstd block type')
        skip(type === 1 ? 1 : block >>> 3)
      }
      if (descriptor & 4) await exact(4)
      const params = zlib.constants.ZSTD_d_windowLogMax === undefined ? undefined : { [zlib.constants.ZSTD_d_windowLogMax]: 27 }
      const decoder = dependencies.createZstdDecompress({ params })
      const stream = dependencies.createReadStream(input, { start, end: offset - 1 })
      const abort = () => { stream.destroy(signal.reason); decoder.destroy(signal.reason) }
      const streamError = error => decoder.destroy(error)
      stream.on('error', streamError)
      signal.addEventListener('abort', abort, { once: true })
      stream.pipe(decoder)
      try {
        for await (const chunk of decoder) {
          if (signal.aborted) throw signal.reason
          yield chunk
        }
      } finally {
        signal.removeEventListener('abort', abort)
        stream.destroy()
        decoder.destroy()
        await Promise.all([finished(stream).catch(() => {}), finished(decoder).catch(() => {})])
      }
    }
    if (!frames) throw fail('SSH_ZSTD', 'Empty zstd stream')
  } finally { await handle.close() }
}

async function decompress(input, destination, source, remaining, dependencies, signal) {
  let size = 0
  const hash = createHash('sha256')
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length
    if (size > remaining) return callback(fail('SSH_LIMIT', 'Decompressed rollouts exceed maxTotalBytes'))
    if (size > source.maxSessionBytes) return callback(fail('SSH_SESSION_TOO_BIG', 'Decompressed rollout exceeds maxSessionBytes'))
    hash.update(chunk)
    callback(null, chunk)
  } })
  const file = createWriteStream(destination, { flags: 'wx', mode: 0o600 })
  let process
  try {
    if (typeof dependencies.createZstdDecompress === 'function') {
      await pipeline(Readable.from(decodedFrames(input, dependencies, signal)), limit, file, { signal })
    } else {
      process = processHandle('zstd', ['--quiet', '--decompress', '--stdout', '--memory=128MB', '--', input], dependencies, signal)
      process.child.stdin.end()
      await pipeline(process.child.stdout, limit, file, { signal })
      const result = await process.done
      if (result.error || result.code !== 0) throw fail('SSH_ZSTD', `zstd decompression failed${result.error?.code === 'ENOENT' ? ': install zstd or use Node with native zstd' : ''}`)
    }
    return { size, digest: hash.digest('hex') }
  } catch (error) {
    file.destroy()
    if (process) await process.drain()
    await finished(file).catch(() => {})
    await rm(destination, { force: true })
    if (signal.aborted) throw signal.reason
    if (error.code === 'SSH_SESSION_TOO_BIG' || error.code === 'SSH_LIMIT') throw error
    throw fail('SSH_ZSTD', `Invalid or unsupported zstd rollout: ${error.code ?? error.message}`)
  } finally { if (process) await process.done }
}

async function receive(source, root, dependencies, signal) {
  const process = processHandle('ssh', buildSshArgs(source), dependencies, signal)
  const reader = new ProtocolReader(process.child.stdout, signal)
  let count = 0
  let wireBytes = 0
  let total = 0
  let localSkipped = 0
  let stats
  const paths = new Set()
  const copies = new Map()
  const retained = []
  try {
    process.child.stdin.end(source.platform === 'windows' ? WINDOWS_REMOTE_SCRIPT : REMOTE_SCRIPT)
    while (true) {
      const record = await reader.line()
      if (record === undefined) break
      if (!object(record)) throw fail('SSH_PROTOCOL', 'Invalid SSH snapshot record')
      if (stats) throw fail('SSH_PROTOCOL', 'Unexpected data after SSH snapshot completion')
      if (record.type === 'error') {
        const message = typeof record.message === 'string' ? record.message.slice(0, 1000) : 'Remote SSH read failed'
        throw fail(/^SSH_[A-Z_]+:/u.exec(message)?.[0].slice(0, -1) ?? 'SSH_REMOTE', message)
      }
      if (record.type === 'done') {
        for (const key of ['files', 'bytes', 'skippedBig', 'unreadable']) if (!Number.isSafeInteger(record[key]) || record[key] < 0) throw fail('SSH_PROTOCOL', 'Invalid SSH snapshot totals')
        if (record.files > source.maxFiles || record.bytes > source.maxTotalBytes) throw fail('SSH_LIMIT', 'SSH snapshot totals exceed configured limits')
        if (record.files < count + record.skippedBig || record.files > count + record.skippedBig + record.unreadable || record.bytes !== wireBytes) throw fail('SSH_PROTOCOL', 'Inconsistent SSH snapshot totals')
        stats = { skippedBig: record.skippedBig + localSkipped, unreadable: record.unreadable }
        continue
      }
      if (record.type !== 'file' || !validRemotePath(record.path) || !Number.isSafeInteger(record.size) || record.size < 0) throw fail('SSH_PROTOCOL', 'Invalid SSH rollout path or size')
      count += 1
      wireBytes += record.size
      if (count > source.maxFiles || wireBytes > source.maxTotalBytes || record.size > source.maxSessionBytes) throw fail('SSH_LIMIT', 'SSH rollout exceeds configured file/byte limits')
      if (paths.has(record.path)) throw fail('SSH_PROTOCOL', 'Duplicate SSH rollout path')
      paths.add(record.path)
      const destination = join(root, 'incoming', `rollout-${String(count).padStart(6, '0')}.jsonl`)
      const compressed = record.path.endsWith('.zst')
      const input = compressed ? `${destination}.zst` : destination
      await reader.file(record.size, input)
      let result
      if (compressed) {
        try { result = await decompress(input, destination, source, source.maxTotalBytes - total, dependencies, signal) }
        catch (error) { if (error.code !== 'SSH_SESSION_TOO_BIG') throw error; localSkipped += 1; continue }
        finally { await rm(input, { force: true }) }
      } else {
        if (total + record.size > source.maxTotalBytes) throw fail('SSH_LIMIT', 'Rollouts exceed maxTotalBytes')
        const hash = createHash('sha256')
        for await (const chunk of dependencies.createReadStream(input)) { if (signal.aborted) throw signal.reason; hash.update(chunk) }
        result = { size: record.size, digest: hash.digest('hex') }
      }
      // Only dedup an exact plain/compressed copy at the same relative path.
      // Different content (continuation segments), even with the same thread id, survives.
      const key = compressed ? record.path.slice(0, -4) : record.path
      const seen = copies.get(key) ?? new Map()
      const existing = seen.get(result.digest)
      if (existing) {
        // An exact dual copy may arrive compressed-first. Keep the lexical
        // original path as its ordering key regardless of transport order.
        if (record.path < existing.path) existing.path = record.path
        await rm(destination, { force: true })
      } else {
        const entry = { path: record.path, destination }
        seen.set(result.digest, entry)
        copies.set(key, seen)
        retained.push(entry)
        total += result.size
      }
    }
    const result = await process.done
    if (signal.aborted) throw signal.reason
    if (result.error || result.code !== 0) throw fail('SSH_PROCESS', `SSH snapshot failed${result.error ? `: ${result.error.code ?? result.error.message}` : ` (exit ${result.code})`}${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
    if (!stats) throw fail('SSH_PROTOCOL', 'SSH snapshot ended without completion record')
    // listCodexSessions sorts local filenames before continuation merging. Mirror
    // the original relative-path order, never the peer's enumeration/arrival order.
    retained.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    const width = Math.max(6, String(retained.length).length)
    for (const [index, entry] of retained.entries()) {
      if (signal.aborted) throw signal.reason
      await rename(entry.destination, join(root, 'sessions', `rollout-${String(index + 1).padStart(width, '0')}.jsonl`))
    }
    await rm(join(root, 'incoming'), { recursive: true, force: true })
    return stats
  } catch (error) {
    await process.drain()
    if (signal.aborted) throw signal.reason
    throw error
  }
}

function createWithSshSnapshot(dependencies) {
  return async function snapshot(input, callback, { signal } = {}) {
    const source = validatedSource(input)
    if (typeof callback !== 'function') throw new TypeError('SSH snapshot callback must be a function')
    const controller = new AbortController()
    const abort = () => controller.abort(fail('ABORT_ERR', 'SSH snapshot cancelled'))
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    let root
    let timer
    try {
      if (controller.signal.aborted) throw controller.signal.reason
      timer = setTimeout(() => controller.abort(fail('SSH_TIMEOUT', `SSH snapshot timed out after ${source.timeoutMs}ms`)), source.timeoutMs)
      root = await mkdtemp(join(dependencies.tmpdir(), 'dsh-codex-ssh-'))
      await chmod(root, 0o700)
      await mkdir(join(root, 'sessions'), { mode: 0o700 })
      await mkdir(join(root, 'incoming'), { mode: 0o700 })
      const stats = await receive(source, root, dependencies, controller.signal)
      clearTimeout(timer)
      if (controller.signal.aborted) throw controller.signal.reason
      // Callback owns no subprocess. Await it before cleanup, including cancellation
      // during an import callback, so its readers cannot race temporary-file removal.
      const result = await callback({ codexHome: root, ...stats, source })
      if (controller.signal.aborted) throw controller.signal.reason
      return result
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (root) await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    }
  }
}

/** Explicit connection test: validates login, Python and the safe sessions root;
 * never enumerates rollouts, transfers chat bodies, stages files or imports. */
function createProbeSshSource(dependencies) {
  return async function probe(input, { signal } = {}) {
    const source = validatedSource(input)
    const controller = new AbortController()
    const abort = () => controller.abort(fail('ABORT_ERR', 'SSH connection test cancelled'))
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    let process
    const timer = setTimeout(() => controller.abort(fail('SSH_TIMEOUT', 'SSH connection test timed out')), Math.min(source.timeoutMs, 30000))
    try {
      if (controller.signal.aborted) throw controller.signal.reason
      process = processHandle('ssh', buildSshArgs(source, true), dependencies, controller.signal)
      const reader = new ProtocolReader(process.child.stdout, controller.signal)
      process.child.stdin.end(source.platform === 'windows' ? WINDOWS_REMOTE_SCRIPT : REMOTE_SCRIPT)
      let verified = false
      let completed = false
      for (let count = 0; ; count++) {
        const record = await reader.line()
        if (record === undefined) break
        if (count >= 2 || !object(record) || completed) throw fail('SSH_PROTOCOL', 'Unexpected SSH connection-test response')
        if (record.type === 'error') {
          const message = typeof record.message === 'string' ? record.message.slice(0, 1000) : 'Remote SSH test failed'
          throw fail(/^SSH_[A-Z_]+:/u.exec(message)?.[0].slice(0, -1) ?? 'SSH_REMOTE', message)
        }
        if (record.type === 'probe' && !verified && record.platform === source.platform && record.sessionRoot === true) verified = true
        else if (record.type === 'done' && verified && ['files', 'bytes', 'skippedBig', 'unreadable'].every(key => record[key] === 0)) completed = true
        else throw fail('SSH_PROTOCOL', 'SSH connection test returned unexpected data')
      }
      const result = await process.done
      if (controller.signal.aborted) throw controller.signal.reason
      if (result.error || result.code !== 0) throw fail('SSH_PROCESS', `SSH connection test failed${result.error?.code === 'ENOENT' ? ': system ssh not found' : ` (exit ${result.code})`}${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
      if (!completed) throw fail('SSH_PROTOCOL', 'SSH connection test ended without verification')
      return { ok: true, platform: source.platform, sessionRoot: true }
    } catch (error) {
      if (process) await process.drain()
      if (controller.signal.aborted) throw controller.signal.reason
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}

const dependencies = { spawn, createReadStream, createZstdDecompress: zlib.createZstdDecompress, tmpdir }
export const withSshSnapshot = createWithSshSnapshot(dependencies)
export const probeSshSource = createProbeSshSource(dependencies)

/** Internal, deliberately not configurable through plugin/UI settings. */
export const __test = Object.freeze({
  REMOTE_SCRIPT,
  buildSshArgs,
  createWithSshSnapshot: overrides => createWithSshSnapshot({ ...dependencies, ...overrides }),
  createProbeSshSource: overrides => createProbeSshSource({ ...dependencies, ...overrides }),
  decompressZstdFile: (input, output, { maxSessionBytes = DEFAULTS.maxSessionBytes, maxTotalBytes = DEFAULTS.maxTotalBytes, signal = new AbortController().signal } = {}) => decompress(input, output, { maxSessionBytes }, maxTotalBytes, dependencies, signal),
})
