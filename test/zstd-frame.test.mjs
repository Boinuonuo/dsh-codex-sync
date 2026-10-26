import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __test } from '../lib/ssh-source.mjs'
import { compressChecksummedFrame } from '../lib/zstd-frame.mjs'

test('checksummed Zstandard frames round-trip independently and when concatenated', async (t) => {
  const first = Buffer.from('{"type":"session","version":4}\n')
  const second = Buffer.from('{"type":"turn/start","seq":0}\n')
  const frames = [compressChecksummedFrame(first), compressChecksummedFrame(second)]
  const root = await mkdtemp(join(tmpdir(), 'cx-zstd-frame-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  let n = 0
  const decode = async (input) => {
    const from = join(root, `input-${n}.zst`), to = join(root, `output-${n++}.jsonl`)
    await writeFile(from, input)
    await __test.decompressZstdFile(from, to)
    return readFile(to)
  }
  assert.deepEqual(await decode(frames[0]), first)
  assert.deepEqual(await decode(Buffer.concat(frames)), Buffer.concat([first, second]))
  const corrupt = Buffer.from(frames[1])
  corrupt[corrupt.length - 1] ^= 1
  await assert.rejects(decode(corrupt), 'a corrupted checksum must fail')
})
