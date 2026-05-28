// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { calculateFileSha256 } from './file-hash'

test('calculates SHA-256 without requiring callers to load the file into memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-db-lab-hash-'))
  const filePath = join(root, 'source.db')

  try {
    await writeFile(filePath, 'stable-db-copy', 'utf8')
    assert.equal(await calculateFileSha256(filePath), createHash('sha256').update('stable-db-copy').digest('hex'))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
