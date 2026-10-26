import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WINDOWS_REMOTE_SCRIPT, buildWindowsCommand } from '../lib/ssh-windows.mjs'
import { getSshSource, __test } from '../lib/ssh-source.mjs'

const hasWindowsPython = process.platform === 'win32' && spawnSync('py', ['-3', '--version'], { timeout: 10000 }).status === 0
const source = root => getSshSource({ win: { platform: 'windows', host: 'fixture.invalid', codexHome: root } }, 'win')
async function fixture(t) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'cx-win-reader-')))
  t.after(() => rm(base, { recursive: true, force: true }))
  const home = join(base, 'home with spaces'), stage = join(base, 'stage')
  await mkdir(join(home, 'sessions', '2026', '10'), { recursive: true })
  await mkdir(stage)
  return { base, home, stage }
}
function transport(stage) {
  return __test.createWithSshSnapshot({ tmpdir: () => stage, spawn(executable, args, options) {
    if (executable !== 'ssh') return spawn(executable, args, options)
    const prefix = 'powershell -NoProfile -NonInteractive -EncodedCommand '
    assert.ok(args.at(-1).startsWith(prefix))
    return spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', args.at(-1).slice(prefix.length)], options)
  } })
}

test('Windows command contains only fixed launcher and encoded configuration', () => {
  const config = Buffer.from(JSON.stringify({ codexHome: "C:\\quote'&never" })).toString('base64')
  const command = buildWindowsCommand(config)
  const encoded = command.split(' ').at(-1)
  const script = Buffer.from(encoded, 'base64').toString('utf16le')
  assert.match(script, /& py -3 -I - '[A-Za-z0-9+/=]+'/)
  assert.ok(!command.includes('quote'))
  assert.throws(() => buildWindowsCommand("bad'; Stop-Process"), /Invalid/)
})

test('Windows Python reader compiles', { skip: !hasWindowsPython }, () => {
  const result = spawnSync('py', ['-3', '-I', '-c', 'import sys; compile(sys.stdin.read(), "reader", "exec")'], { input: WINDOWS_REMOTE_SCRIPT, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
})

test('PowerShell launcher preserves raw binary stdin and stdout without transcoding', { skip: !hasWindowsPython }, () => {
  const encoded = buildWindowsCommand(Buffer.from('{}').toString('base64')).split(' ').at(-1)
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { input: 'import sys\nsys.stdout.buffer.write(bytes([0,1,2,10,13,128,255]))\n', timeout: 15000 })
  assert.equal(result.status, 0, result.stderr.toString())
  assert.equal(result.stdout.toString('hex'), '0001020a0d80ff')
})

test('Windows protocol writer retries partial binary writes', { skip: !hasWindowsPython }, () => {
  const definitions = WINDOWS_REMOTE_SCRIPT.split('\nheld = []')[0]
  const check = `\nclass PartialWriter:\n    def __init__(self): self.value = bytearray()\n    def write(self, data):\n        n = min(3, len(data))\n        self.value.extend(data[:n])\n        return n\nout = PartialWriter()\nwrite_all(bytes(range(256)))\nassert out.value == bytes(range(256))\n`
  const result = spawnSync('py', ['-3', '-I', '-', Buffer.from('{}').toString('base64')], { input: definitions + check, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 0, result.stderr)
})

test('Windows real reader reads only rollouts, handles spaces and skips oversized files', { skip: !hasWindowsPython }, async t => {
  const { home, stage } = await fixture(t)
  await writeFile(join(home, 'auth.json'), 'not session data')
  await writeFile(join(home, 'sessions', 'not-rollout.jsonl'), 'not session data')
  await writeFile(join(home, 'sessions', '2026', '10', 'rollout-ok.jsonl'), 'small\u0000\u00ff')
  await writeFile(join(home, 'sessions', 'rollout-big.jsonl'), 'X'.repeat(1024))
  const configured = { ...source(home), maxSessionBytes: 100 }
  await transport(stage)(configured, async ({ codexHome, skippedBig, unreadable }) => {
    assert.equal(skippedBig, 1)
    assert.equal(unreadable, 0)
    const files = await readdir(join(codexHome, 'sessions'))
    assert.equal(files.length, 1)
    assert.equal(await readFile(join(codexHome, 'sessions', files[0]), 'utf8'), 'small\u0000\u00ff')
  })
  assert.deepEqual(await readdir(stage), [])
})

test('Windows reader rejects junction roots and ignores junction children', { skip: !hasWindowsPython }, async t => {
  const { home, stage, base } = await fixture(t)
  const outside = join(base, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'rollout-secret.jsonl'), 'do not read')
  await symlink(outside, join(home, 'sessions', 'linked-dir'), 'junction')
  await writeFile(join(home, 'sessions', 'rollout-ok.jsonl'), 'read this')
  await transport(stage)(source(home), async ({ codexHome, unreadable }) => {
    assert.equal(unreadable, 1)
    assert.equal((await readdir(join(codexHome, 'sessions'))).length, 1)
  })
  await symlink(home, join(base, 'linked-home'), 'junction')
  await assert.rejects(transport(stage)(source(join(base, 'linked-home')), () => assert.fail('no unsafe root')), { code: 'SSH_ROOT_UNSAFE' })
  assert.deepEqual(await readdir(stage), [])
})

test('Windows connection test validates safe root without enumerating rollouts', { skip: !hasWindowsPython }, async t => {
  const { home, stage } = await fixture(t)
  await writeFile(join(home, 'sessions', 'rollout-large.jsonl'), 'X'.repeat(500))
  const probe = __test.createProbeSshSource({ spawn(executable, args, options) {
    assert.equal(executable, 'ssh')
    return spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', args.at(-1).split(' ').at(-1)], options)
  } })
  assert.deepEqual(await probe({ ...source(home), maxTotalBytes: 1, maxSessionBytes: 1 }), { ok: true, platform: 'windows', sessionRoot: true })
  assert.deepEqual(await readdir(stage), [])
})

test('Windows reader reports missing roots and budget limits instead of partial success', { skip: !hasWindowsPython }, async t => {
  const { home, stage, base } = await fixture(t)
  await assert.rejects(transport(stage)(source(join(base, 'absent')), () => assert.fail()), { code: 'SSH_ROOT_MISSING' })
  await writeFile(join(home, 'sessions', 'rollout-a.jsonl'), 'abc')
  await writeFile(join(home, 'sessions', 'rollout-b.jsonl'), 'def')
  for (const overrides of [{ maxFiles: 1 }, { maxTotalBytes: 4 }]) {
    await assert.rejects(transport(stage)({ ...source(home), ...overrides }, () => assert.fail('no partial success')), { code: 'SSH_LIMIT' })
    assert.deepEqual(await readdir(stage), [])
  }
})
