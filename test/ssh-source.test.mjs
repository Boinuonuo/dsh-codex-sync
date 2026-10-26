import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, readFile, rm, stat, symlink, writeFile, realpath } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as zlib from 'node:zlib'
import { normalizeSshSources, getSshSource, withSshSnapshot, __test } from '../lib/ssh-source.mjs'
import { listCodexSessions, parseCodexSession } from '../lib/codex-reader.mjs'

const source = overrides => getSshSource({ box: { host: 'tester@fake-host', ...overrides } }, 'box')
const header = record => Buffer.from(`${JSON.stringify(record)}\n`)
const file = (path, content) => {
  const body = Buffer.from(content)
  return Buffer.concat([header({ type: 'file', path, size: body.length }), body])
}
const payload = (files, extras = {}) => Buffer.concat([
  ...files.map(([path, bytes]) => file(path, bytes)),
  header({ type: 'done', files: files.length, bytes: files.reduce((sum, [, bytes]) => sum + Buffer.byteLength(bytes), 0), skippedBig: 0, unreadable: 0, ...extras }),
])
// Valid raw-block zstd frames, independent of a compressor dependency on Node 20.
function rawFrame(text) {
  const data = Buffer.from(text)
  assert.ok(data.length < 256)
  const block = Buffer.alloc(3)
  block.writeUIntLE((data.length << 3) | 1, 0, 3)
  return Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, data.length]), block, data])
}
const JSONL = '{"type":"session_meta","payload":{"id":"fake-id","cwd":"/fixture"}}\n'

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'ssh-reader-test-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  return base
}

function fakeProcess(bytes, options = {}) {
  const script = `
    let script = '';
    process.stdin.on('data', chunk => script += chunk);
    ${options.ignoreTerm ? "process.on('SIGTERM', () => {});" : ''}
    process.stdin.on('end', () => {
      if (!script.includes('O_NOFOLLOW')) process.exit(11);
      ${options.hang ? 'setInterval(() => {}, 1000);' : `
        const data = Buffer.from(process.argv[1], 'base64');
        ${options.fragment ? "let at = 0; const timer = setInterval(() => { if (at === data.length) { clearInterval(timer); process.exit(process.argv[2] | 0); } else process.stdout.write(data.subarray(at, ++at)); }, 1);" : "process.stdout.end(data, () => { process.exitCode = process.argv[2] | 0; });"}
      `}
    });
  `
  return spawn(process.execPath, ['-e', script, Buffer.from(bytes).toString('base64'), String(options.exitCode ?? 0)], { shell: false, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
}

function adapter(base, bytes, options = {}) {
  const calls = []
  let closed = false
  let rootAtClose
  const snapshot = __test.createWithSshSnapshot({
    tmpdir: () => base,
    spawn(executable, args, spawnOptions) {
      calls.push({ executable, args, options: spawnOptions })
      if (executable === 'zstd' && options.zstd) return options.zstd(args)
      assert.equal(executable, 'ssh', 'only the system ssh executable is used')
      const child = fakeProcess(bytes, options)
      child.on('close', () => { closed = true; rootAtClose = readdirSync(base).some(name => name.startsWith('dsh-codex-ssh-')) })
      return child
    },
    ...options.dependencies,
  })
  return { snapshot, calls, get closed() { return closed }, get rootAtClose() { return rootAtClose } }
}

async function empty(base) { assert.deepEqual(await readdir(base), [], 'all snapshot artifacts removed') }

test('connection test verifies root only with no snapshot directory or rollout transfer', async t => {
  const base = await fixture(t)
  let receivedArgs
  const bytes = Buffer.concat([header({ type: 'probe', platform: 'posix', sessionRoot: true }), payload([])])
  const probe = __test.createProbeSshSource({ tmpdir: () => { assert.fail('probe must not stage files') }, spawn(executable, args) {
    assert.equal(executable, 'ssh'); receivedArgs = args
    return fakeProcess(bytes)
  } })
  assert.deepEqual(await probe(source()), { ok: true, platform: 'posix', sessionRoot: true })
  const config = JSON.parse(Buffer.from(receivedArgs.at(-1).split("'")[1], 'base64'))
  assert.equal(config.probeOnly, true)
  await empty(base)
})

test('connection test rejects bodies, malformed completion and errors; abort never spawns', async () => {
  for (const bytes of [payload([['rollout-forbidden.jsonl', 'do not transfer']]), header({ type: 'probe', platform: 'windows', sessionRoot: true }), header({ type: 'error', message: 'SSH_ROOT_MISSING: absent' })]) {
    const probe = __test.createProbeSshSource({ spawn: () => fakeProcess(bytes) })
    await assert.rejects(probe(source()))
  }
  const controller = new AbortController(); controller.abort()
  await assert.rejects(__test.createProbeSshSource({ spawn: () => assert.fail('already aborted') })(source(), { signal: controller.signal }), { code: 'ABORT_ERR' })
  await assert.rejects(__test.createProbeSshSource({ spawn: () => fakeProcess('', { hang: true }) })(source({ timeoutMs: 40 })), { code: 'SSH_TIMEOUT' })
})

// Configuration deliberately has no process/runner/flags escape hatches.
test('normalize named sources preserves stable ids, labels and bounded defaults', () => {
  assert.deepEqual(normalizeSshSources(undefined), [])
  assert.deepEqual(normalizeSshSources(null), [])
  assert.deepEqual(source(), {
    id: 'box', label: 'box', host: 'tester@fake-host', platform: 'posix', codexHome: '~/.codex', cwdMappings: [],
    timeoutMs: 60000, maxFiles: 1000, maxTotalBytes: 268435456, maxSessionBytes: 67108864,
  })
  const raw = { prod: { host: 'linux-alias', label: 'Linux history', port: 2222, codexHome: '/srv/codex', cwdMappings: [{ from: '/work/project', to: 'C:\\Projects\\project' }] } }
  assert.equal(getSshSource(raw, 'prod').label, 'Linux history')
  assert.equal(getSshSource(raw, 'prod').port, 2222)
  assert.deepEqual(getSshSource(raw, 'prod').cwdMappings, raw.prod.cwdMappings)
  const copy = getSshSource(raw, 'prod'); copy.cwdMappings[0].to = '/other'
  assert.equal(raw.prod.cwdMappings[0].to, 'C:\\Projects\\project')
  assert.throws(() => getSshSource(raw, 'missing'), { code: 'SSH_SOURCE_NOT_FOUND' })
})

test('reject source ids, host command injection and arbitrary execution settings', () => {
  for (const id of ['', '-bad', '../x', 'a b', 'x;id', 'x'.repeat(65), '__proto__']) {
    assert.throws(() => normalizeSshSources(JSON.parse(`{"${id}":{"host":"fake"}}`)), { code: 'SSH_CONFIG' }, id)
  }
  for (const host of ['-oProxyCommand=evil', 'box -oStrictHostKeyChecking=no', 'a\n-oX', 'a;id', 'a|id', 'a&whoami', '$(id)', '`id`', 'a>file', 'a<file', 'ssh://host', 'user@@host', 'a\\b', 'a"b', "a'b", 'a/../b', 'host:2222']) {
    assert.throws(() => source({ host }), { code: 'SSH_CONFIG' }, host)
  }
  for (const field of ['command', 'executable', 'sshPath', 'args', 'options', 'runner', 'password']) assert.throws(() => source({ [field]: 'evil' }), { code: 'SSH_CONFIG' })
  for (const raw of [[], 'alias', 5, true]) assert.throws(() => normalizeSshSources(raw), { code: 'SSH_CONFIG' })
  for (const host of ['alias-name', 'user.name@127.0.0.1', 'user@[::1]']) assert.equal(source({ host }).host, host)
})

test('reject unsafe roots, cwd mappings, limits and ports', () => {
  for (const codexHome of ['relative', '~other/.codex', '/a/../b', '~/../b', '/a\nb', 'C:\\codex', '', '/x\\y']) assert.throws(() => source({ codexHome }), { code: 'SSH_CONFIG' })
  for (const field of ['maxFiles', 'maxTotalBytes', 'maxSessionBytes', 'timeoutMs']) for (const value of [0, -1, NaN, Infinity, 1.5, '10', Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => source({ [field]: value }), { code: 'SSH_CONFIG' })
  for (const port of [0, 65536, '22', 1.5]) assert.throws(() => source({ port }), { code: 'SSH_CONFIG' })
  for (const cwdMappings of [{}, [{ from: 'relative', to: '/local' }], [{ from: '/remote', to: 'relative' }], [{ from: '/a/../b', to: '/local' }], [{ from: '/remote', to: '/a/../b' }], [{ from: '/remote', to: '/local', executable: 'evil' }]]) assert.throws(() => source({ cwdMappings }), { code: 'SSH_CONFIG' })
  assert.throws(() => source({ label: '\nbad' }), { code: 'SSH_CONFIG' })
})

test('normalize mapping roots before duplicate detection and cap snapshot time at five minutes', () => {
  assert.deepEqual(source({ cwdMappings: [{ from: '//work///project/./', to: '/local' }, { from: '///', to: '/root' }] }).cwdMappings, [
    { from: '/work/project', to: '/local' }, { from: '/', to: '/root' },
  ])
  for (const duplicate of ['/work/project', '/work/project/', '//work//project/.']) {
    assert.throws(() => source({ cwdMappings: [{ from: '/work/project', to: '/one' }, { from: duplicate, to: '/two' }] }), { code: 'SSH_CONFIG' })
  }
  assert.throws(() => source({ cwdMappings: [{ from: '/', to: '/one' }, { from: '///.', to: '/two' }] }), { code: 'SSH_CONFIG' })
  for (const timeoutMs of [300001, 2147483647]) assert.throws(() => source({ timeoutMs }), { code: 'SSH_CONFIG' })
  assert.equal(source({ timeoutMs: 300000 }).timeoutMs, 300000)
  assert.equal(source({ timeoutMs: 1 }).timeoutMs, 1)
})

test('Windows source is explicit, validates drive paths and case-insensitive duplicate roots', () => {
  const win = source({ platform: 'windows', codexHome: 'C:\\Users\\With Spaces\\.codex', cwdMappings: [{ from: 'D:/Projects/', to: 'C:\\Work' }] })
  assert.equal(win.platform, 'windows')
  assert.equal(win.cwdMappings[0].from, 'D:\\Projects')
  assert.equal(source({ platform: 'windows' }).codexHome, '~/.codex')
  for (const codexHome of ['relative', 'C:relative', '\\\\server\\share', 'C:\\a\\..\\b', 'C:\\a:stream']) assert.throws(() => source({ platform: 'windows', codexHome }), { code: 'SSH_CONFIG' })
  assert.throws(() => source({ platform: 'auto' }), { code: 'SSH_CONFIG' })
  assert.throws(() => source({ platform: 'windows', cwdMappings: [{ from: 'D:\\WORK', to: 'C:\\one' }, { from: 'd:/work/', to: 'C:\\two' }] }), /Duplicate/)
  const args = __test.buildSshArgs(win)
  assert.ok(args.at(-1).startsWith('powershell -NoProfile -NonInteractive -EncodedCommand '))
  assert.ok(!args.at(-1).includes(win.codexHome))
})

test('SSH args force batch/strict host keys and base64 only remote configuration', () => {
  const configured = source({ codexHome: "/fixture/quote'$(never-executed);&", port: 2222 })
  const args = __test.buildSshArgs(configured)
  assert.deepEqual(args.slice(0, 7), ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectionAttempts=1'])
  assert.ok(args.includes('2222'))
  assert.deepEqual(args.slice(-3, -1), ['--', 'tester@fake-host'])
  const encoded = /^python3 -I - '([A-Za-z0-9+/=]+)'$/u.exec(args.at(-1))?.[1]
  assert.ok(encoded)
  assert.equal(JSON.parse(Buffer.from(encoded, 'base64')).codexHome, configured.codexHome)
  assert.ok(!args.includes(configured.codexHome))
  assert.ok(!args.join(' ').includes('StrictHostKeyChecking=no'))
  assert.equal(typeof withSshSnapshot, 'function')
})

test('snapshot exposes only private session files and returns callback result, then cleans', async t => {
  const base = await fixture(t)
  const transport = adapter(base, payload([['2026/10/26/rollout-a.jsonl', JSONL]]), { fragment: true })
  let root
  const value = await transport.snapshot(source(), async context => {
    root = context.codexHome
    assert.equal(transport.closed, true, 'callback begins only after SSH pipes close')
    assert.equal(context.source.id, 'box')
    assert.equal(context.skippedBig, 0)
    assert.equal(context.unreadable, 0)
    assert.deepEqual(await readdir(root), ['sessions'])
    const sessions = join(root, 'sessions')
    const [name] = await readdir(sessions)
    assert.equal(await readFile(join(sessions, name), 'utf8'), JSONL)
    if (process.platform !== 'win32') {
      assert.equal((await stat(root)).mode & 0o777, 0o700)
      assert.equal((await stat(sessions)).mode & 0o777, 0o700)
      assert.equal((await stat(join(sessions, name))).mode & 0o777, 0o600)
    }
    return 42
  })
  assert.equal(value, 42)
  assert.equal(existsSync(root), false)
  assert.equal(transport.calls[0].options.shell, false)
  await empty(base)
})

test('callback failures and transport failures remove temporary files', async t => {
  const base = await fixture(t)
  let root
  const ok = adapter(base, payload([['rollout-a.jsonl', JSONL]]))
  await assert.rejects(ok.snapshot(source(), async ({ codexHome }) => { root = codexHome; throw new Error('callback failed') }), /callback failed/u)
  assert.equal(existsSync(root), false)
  await empty(base)
  const bad = adapter(base, payload([['rollout-a.jsonl', JSONL]]), { exitCode: 23 })
  await assert.rejects(bad.snapshot(source(), () => assert.fail('no partial import')), { code: 'SSH_PROCESS' })
  assert.equal(bad.closed, true)
  await empty(base)
})

test('timeout kills and drains subprocess before cleanup, never invokes callback', async t => {
  const base = await fixture(t)
  const transport = adapter(base, Buffer.alloc(0), { hang: true, ignoreTerm: true })
  await assert.rejects(transport.snapshot(source({ timeoutMs: 300 }), () => assert.fail('no callback')), { code: 'SSH_TIMEOUT' })
  assert.equal(transport.closed, true)
  assert.equal(transport.rootAtClose, true)
  await empty(base)
})

test('cancellation drains SSH; already aborted calls do not spawn or stage', async t => {
  const base = await fixture(t)
  const transport = adapter(base, Buffer.alloc(0), { hang: true })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try { await assert.rejects(transport.snapshot(source(), () => assert.fail('no callback'), { signal: controller.signal }), { code: 'ABORT_ERR' }) }
  finally { clearTimeout(timer) }
  assert.equal(transport.closed, true)
  await empty(base)
  const pre = new AbortController(); pre.abort()
  await assert.rejects(transport.snapshot(source(), () => {}, { signal: pre.signal }), { code: 'ABORT_ERR' })
  assert.equal(transport.calls.length, 1)
  await empty(base)
})

test('cancellation during callback waits for readers before removing the snapshot', async t => {
  const base = await fixture(t)
  const controller = new AbortController()
  let root
  await assert.rejects(adapter(base, payload([['rollout-a.jsonl', JSONL]])).snapshot(source(), async ({ codexHome }) => {
    root = codexHome
    controller.abort()
    await Promise.resolve()
    const [name] = await readdir(join(root, 'sessions'))
    assert.equal(await readFile(join(root, 'sessions', name), 'utf8'), JSONL)
  }, { signal: controller.signal }), { code: 'ABORT_ERR' })
  assert.equal(existsSync(root), false)
  await empty(base)
})

test('missing system ssh/zstd executables fail clearly and remove private staging', async t => {
  const base = await fixture(t)
  const missing = () => spawn(join(base, 'does-not-exist'), [], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
  const snapshot = __test.createWithSshSnapshot({ tmpdir: () => base, spawn: missing })
  await assert.rejects(snapshot(source(), () => assert.fail('no callback')), { code: 'SSH_PROCESS' })
  await empty(base)
  const transport = adapter(base, payload([['rollout-a.jsonl.zst', rawFrame('ok')]]), { dependencies: { createZstdDecompress: undefined }, zstd: missing })
  await assert.rejects(transport.snapshot(source(), () => assert.fail('no callback')), { code: 'SSH_ZSTD' })
  await empty(base)
})

test('absent remote roots, remote scan limits and no completion reject all partial data', async t => {
  const base = await fixture(t)
  for (const message of ['SSH_ROOT_MISSING: codexHome/sessions absent', 'SSH_ROOT_UNSAFE: symlinked root', 'SSH_LIMIT: maxTotalBytes exceeded']) {
    const transport = adapter(base, Buffer.concat([file('rollout-a.jsonl', JSONL), header({ type: 'error', message })]), { exitCode: 1 })
    await assert.rejects(transport.snapshot(source(), () => assert.fail('no partial import')), new RegExp(message.split(':')[0], 'u'))
    await empty(base)
  }
  const partial = adapter(base, file('rollout-a.jsonl', JSONL))
  await assert.rejects(partial.snapshot(source(), () => assert.fail('no partial import')), { code: 'SSH_PROTOCOL' })
  await empty(base)
})

test('local receiver enforces file count, wire bytes and session size even against false peer', async t => {
  const base = await fixture(t)
  for (const [overrides, files] of [
    [{ maxFiles: 1 }, [['rollout-a.jsonl', 'a'], ['rollout-b.jsonl', 'b']]],
    [{ maxTotalBytes: 3 }, [['rollout-a.jsonl', '1234']]],
    [{ maxSessionBytes: 3 }, [['rollout-a.jsonl', '1234']]],
  ]) {
    await assert.rejects(adapter(base, payload(files)).snapshot(source(overrides), () => assert.fail('no partial import')), { code: 'SSH_LIMIT' })
    await empty(base)
  }
})

test('reject malformed protocol, traversal, non-rollouts and truncated body before callback', async t => {
  const base = await fixture(t)
  const bad = [
    Buffer.from('not-json\n'), Buffer.from('x'.repeat(16385)),
    header({ type: 'file', path: 'rollout-a.jsonl', size: -1 }),
    header({ type: 'file', path: 'rollout-a.jsonl', size: 50 }),
    header({ type: 'done', files: 0, bytes: 1, skippedBig: 0, unreadable: 0 }),
    Buffer.concat([payload([]), header({ type: 'file', path: 'rollout-a.jsonl', size: 0 })]),
    payload([['rollout-a.jsonl', 'a'], ['rollout-a.jsonl', 'a']]),
    ...['../rollout-a.jsonl', '/rollout-a.jsonl', 'x/../../rollout-a.jsonl', 'x\\rollout-a.jsonl', 'x/./rollout-a.jsonl', 'auth.json', 'config.toml', 'rollout-a.jsonl.zst.exe'].map(path => payload([[path, 'secret']])),
  ]
  for (const bytes of bad) {
    await assert.rejects(adapter(base, bytes).snapshot(source(), () => assert.fail('no partial import')), { code: 'SSH_PROTOCOL' })
    await empty(base)
  }
})

test('snapshot counts oversized and unreadable remote entries explicitly', async t => {
  const base = await fixture(t)
  const bytes = payload([['rollout-a.jsonl', JSONL]], { files: 4, skippedBig: 2, unreadable: 3 })
  await adapter(base, bytes).snapshot(source(), context => {
    assert.equal(context.skippedBig, 2)
    assert.equal(context.unreadable, 3)
  })
  await empty(base)
})

test('native zstd handles concatenated frames, dedups only exact dual copies and keeps continuation', { skip: typeof zlib.createZstdDecompress !== 'function' }, async t => {
  const base = await fixture(t)
  const compressed = Buffer.concat([rawFrame('one\n'), rawFrame('two\n')])
  const files = [['rollout-a.jsonl', 'one\ntwo\n'], ['rollout-a.jsonl.zst', compressed], ['rollout-b.jsonl', 'first\n'], ['rollout-b.jsonl.zst', rawFrame('continuation\n')], ['another/rollout-a.jsonl', 'one\ntwo\n']]
  await adapter(base, payload(files)).snapshot(source(), async ({ codexHome }) => {
    const names = await readdir(join(codexHome, 'sessions'))
    const contents = await Promise.all(names.map(name => readFile(join(codexHome, 'sessions', name), 'utf8')))
    assert.deepEqual(contents.sort(), ['one\ntwo\n', 'one\ntwo\n', 'first\n', 'continuation\n'].sort())
    assert.ok(names.every(name => name.endsWith('.jsonl')))
  })
  await empty(base)
})

test('shuffled rollout arrivals materialize in original lexical continuation order', async t => {
  const base = await fixture(t)
  const rollout = text => [
    { type: 'session_meta', payload: { id: 'same-thread', cwd: '/fixture' } },
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
  ].map(event => JSON.stringify(event)).join('\n') + '\n'
  const original = [
    ['2026/10/25/rollout-2026-10-25T23-59-59.jsonl', rollout('first')],
    ['2026/10/26/rollout-2026-10-26T00-00-01.jsonl', rollout('second')],
    ['2026/10/26/rollout-2026-10-26T00-00-02.jsonl', rollout('third')],
    ['2026/10/27/rollout-2026-10-27T00-00-00.jsonl', rollout('fourth')],
  ]
  for (const order of [[3, 1, 2, 0], [2, 0, 3, 1]]) {
    await adapter(base, payload(order.map(index => original[index]))).snapshot(source(), async ({ codexHome }) => {
      const files = listCodexSessions(join(codexHome, 'sessions'))
      const parsed = files.map(parseCodexSession)
      assert.deepEqual(parsed.map(session => session.header.id), Array(4).fill('same-thread'))
      assert.deepEqual(parsed.map(session => session.messages[0].blocks[0].text), ['first', 'second', 'third', 'fourth'])
      assert.deepEqual(await Promise.all(files.map(path => readFile(path, 'utf8'))), original.map(([, content]) => content))
      assert.deepEqual(await readdir(codexHome), ['sessions'], 'incoming scratch files never reach importer')
    })
    await empty(base)
  }
})

test('shuffled dual copies retain both distinct segments in lexical plain/compressed order', { skip: typeof zlib.createZstdDecompress !== 'function' }, async t => {
  const base = await fixture(t)
  const originals = [
    ['2026/10/26/rollout-a.jsonl', 'first\n'],
    ['2026/10/26/rollout-a.jsonl.zst', rawFrame('continuation\n')],
    ['2026/10/26/rollout-b.jsonl', 'last\n'],
    ['2026/10/26/rollout-b.jsonl.zst', rawFrame('last\n')],
  ]
  for (const order of [[3, 1, 2, 0], [0, 2, 1, 3]]) {
    await adapter(base, payload(order.map(index => originals[index]))).snapshot(source(), async ({ codexHome }) => {
      const contents = await Promise.all(listCodexSessions(join(codexHome, 'sessions')).map(path => readFile(path, 'utf8')))
      assert.deepEqual(contents, ['first\n', 'continuation\n', 'last\n'])
    })
    await empty(base)
  }
})

test('native zstd corruption fails entire snapshot and cleans input/output', { skip: typeof zlib.createZstdDecompress !== 'function' }, async t => {
  const base = await fixture(t)
  for (const bad of [Buffer.from('not zstd'), rawFrame('valid').subarray(0, 8), Buffer.concat([rawFrame('valid'), Buffer.from('trailing junk')])]) {
    await assert.rejects(adapter(base, payload([['rollout-a.jsonl.zst', bad]])).snapshot(source(), () => assert.fail('no corrupt imports')), { code: 'SSH_ZSTD' })
    await empty(base)
  }
})

test('decompressed per-session bound skips huge output; decoded aggregate rejects whole snapshot', { skip: typeof zlib.createZstdDecompress !== 'function' }, async t => {
  const base = await fixture(t)
  const compressed = zlib.zstdCompressSync(Buffer.alloc(5000, 97))
  await adapter(base, payload([['rollout-a.jsonl.zst', compressed], ['rollout-b.jsonl', 'small']])).snapshot(source({ maxSessionBytes: 100 }), async ({ codexHome, skippedBig }) => {
    assert.equal(skippedBig, 1)
    const names = await readdir(join(codexHome, 'sessions'))
    assert.equal(names.length, 1)
    assert.equal(await readFile(join(codexHome, 'sessions', names[0]), 'utf8'), 'small')
  })
  await empty(base)
  await assert.rejects(adapter(base, payload([['rollout-a.jsonl.zst', compressed]])).snapshot(source({ maxTotalBytes: 200 }), () => assert.fail('no partial import')), { code: 'SSH_LIMIT' })
  await empty(base)
})

test('native zstd validates checksums and accepts standard skippable frames', { skip: typeof zlib.createZstdDecompress !== 'function' }, async t => {
  const base = await fixture(t)
  const checked = zlib.zstdCompressSync('valid checked content', { params: { [zlib.constants.ZSTD_c_checksumFlag]: 1 } })
  const corrupt = Buffer.from(checked); corrupt[corrupt.length - 1] ^= 1
  await assert.rejects(adapter(base, payload([['rollout-a.jsonl.zst', corrupt]])).snapshot(source(), () => assert.fail('no corrupt imports')), { code: 'SSH_ZSTD' })
  await empty(base)
  const skip = Buffer.from([0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, 1, 2, 3])
  await adapter(base, payload([['rollout-a.jsonl.zst', Buffer.concat([skip, checked, skip])]])).snapshot(source(), async ({ codexHome }) => {
    const [name] = await readdir(join(codexHome, 'sessions'))
    assert.equal(await readFile(join(codexHome, 'sessions', name), 'utf8'), 'valid checked content')
  })
  await empty(base)
})

test('bounded zstd CLI fallback uses fixed flags and preserves concatenated output', async t => {
  const base = await fixture(t)
  let called = false
  const transport = adapter(base, payload([['rollout-a.jsonl.zst', Buffer.concat([rawFrame('one\n'), rawFrame('two\n')])]]), {
    dependencies: { createZstdDecompress: undefined },
    zstd(args) {
      called = true
      assert.deepEqual(args.slice(0, -1), ['--quiet', '--decompress', '--stdout', '--memory=128MB', '--'])
      assert.ok(args.at(-1).startsWith(base))
      return spawn(process.execPath, ['-e', "process.stdout.end('one\\ntwo\\n')"], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })
    },
  })
  await transport.snapshot(source(), async ({ codexHome }) => {
    const [name] = await readdir(join(codexHome, 'sessions'))
    assert.equal(await readFile(join(codexHome, 'sessions', name), 'utf8'), 'one\ntwo\n')
  })
  assert.equal(called, true)
  await empty(base)
})

test('CLI corruption and decompression bombs fail and clean up', async t => {
  const base = await fixture(t)
  for (const code of ["process.stdout.end('partial'); process.exitCode = 1", "process.stdout.end('x'.repeat(5000))"]) {
    const transport = adapter(base, payload([['rollout-a.jsonl.zst', rawFrame('data')]]), {
      dependencies: { createZstdDecompress: undefined },
      zstd: () => spawn(process.execPath, ['-e', code], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] }),
    })
    await assert.rejects(transport.snapshot(source({ maxTotalBytes: 100 }), () => assert.fail('no partial import')), error => ['SSH_ZSTD', 'SSH_LIMIT'].includes(error.code))
    await empty(base)
  }
})

const python = process.platform === 'win32' ? 'python' : 'python3'
const hasPython = spawnSync(python, ['--version'], { encoding: 'utf8' }).status === 0

test('fixed Python script is syntactically valid (no real SSH involved)', { skip: !hasPython }, () => {
  const result = spawnSync(python, ['-I', '-c', 'import sys; compile(sys.stdin.read(), "ssh-reader", "exec")'], { input: __test.REMOTE_SCRIPT, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

// O_DIRECTORY/dir_fd are POSIX APIs by design. Real protocol tests above run on
// Windows too; these execute the unchanged remote program against local fixtures.
const posixPython = process.platform !== 'win32' && hasPython
function pythonTransport(base) {
  return __test.createWithSshSnapshot({ tmpdir: () => base, spawn(executable, args, options) {
    if (executable !== 'ssh') return spawn(executable, args, options)
    const config = /^python3 -I - '([A-Za-z0-9+/=]+)'$/u.exec(args.at(-1))[1]
    return spawn(python, ['-I', '-', config], options)
  } })
}

test('remote script reads only rollouts, rejects symlink files/directories and skips large files', { skip: !posixPython }, async t => {
  const fixtureBase = await fixture(t)
  const remote = await realpath(fixtureBase)
  const home = join(remote, 'home')
  const sessions = join(home, 'sessions')
  const stage = join(remote, 'stage')
  await mkdir(join(sessions, '2026', '10', '26'), { recursive: true }); await mkdir(stage)
  await writeFile(join(home, 'auth.json'), 'never read')
  await writeFile(join(home, 'config.toml'), 'never read')
  await mkdir(join(home, 'skills')); await writeFile(join(home, 'skills', 'rollout-fake.jsonl'), 'never read')
  await writeFile(join(sessions, 'not-rollout.jsonl'), 'never read')
  await writeFile(join(sessions, '2026', '10', '26', 'rollout-ok.jsonl'), JSONL)
  await writeFile(join(sessions, 'rollout-big.jsonl'), 'x'.repeat(1000))
  await symlink(join(home, 'auth.json'), join(sessions, 'rollout-link.jsonl'))
  await symlink(join(home, 'skills'), join(sessions, 'linked-dir'))
  await pythonTransport(stage)(source({ codexHome: home, maxSessionBytes: 100 }), async ({ codexHome, skippedBig, unreadable }) => {
    assert.equal(skippedBig, 1)
    assert.equal(unreadable, 2)
    const names = await readdir(join(codexHome, 'sessions'))
    assert.equal(names.length, 1)
    assert.equal(await readFile(join(codexHome, 'sessions', names[0]), 'utf8'), JSONL)
  })
  await empty(stage)
})

test('remote script rejects absent, symlinked root and symlinked sessions', { skip: !posixPython }, async t => {
  const remote = await realpath(await fixture(t))
  const home = join(remote, 'home'); const stage = join(remote, 'stage')
  await mkdir(join(home, 'sessions'), { recursive: true }); await mkdir(stage)
  const snapshot = pythonTransport(stage)
  await assert.rejects(snapshot(source({ codexHome: join(remote, 'absent') }), () => assert.fail()), { code: 'SSH_ROOT_MISSING' })
  await symlink(home, join(remote, 'linked-home'))
  await assert.rejects(snapshot(source({ codexHome: join(remote, 'linked-home') }), () => assert.fail()), { code: 'SSH_ROOT_UNSAFE' })
  const other = join(remote, 'other'); await mkdir(other); await symlink(join(home, 'sessions'), join(other, 'sessions'))
  await assert.rejects(snapshot(source({ codexHome: other }), () => assert.fail()), { code: 'SSH_ROOT_UNSAFE' })
  await empty(stage)
})

test('remote maxFiles/total limits fail explicitly rather than returning partial data', { skip: !posixPython }, async t => {
  const remote = await realpath(await fixture(t))
  const home = join(remote, 'home'); const stage = join(remote, 'stage')
  await mkdir(join(home, 'sessions'), { recursive: true }); await mkdir(stage)
  await writeFile(join(home, 'sessions', 'rollout-a.jsonl'), 'abc')
  await writeFile(join(home, 'sessions', 'rollout-b.jsonl'), 'def')
  for (const overrides of [{ maxFiles: 1 }, { maxTotalBytes: 4 }]) {
    await assert.rejects(pythonTransport(stage)(source({ codexHome: home, ...overrides }), () => assert.fail('no partial import')), { code: 'SSH_LIMIT' })
    await empty(stage)
  }
})
