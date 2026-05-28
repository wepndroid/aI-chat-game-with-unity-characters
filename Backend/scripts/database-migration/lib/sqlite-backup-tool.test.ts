// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runTool } from './tool-runner'

const pythonCommand = process.env.PYTHON ?? 'python'
const backupTool = join(process.cwd(), 'scripts', 'database-migration', 'tools', 'sqlite_backup.py')

test('sqlite_backup.py creates a consistent destination and refuses overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-sqlite-backup-'))
  const source = join(root, 'source.db')
  const destination = join(root, 'snapshot.db')

  try {
    const createSource = await runTool(pythonCommand, [
      '-c',
      [
        'import sqlite3, sys',
        'connection = sqlite3.connect(sys.argv[1])',
        'connection.execute("CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT NOT NULL)")',
        'connection.execute("INSERT INTO sample(value) VALUES (?)", ("kept",))',
        'connection.commit()',
        'connection.close()'
      ].join('; '),
      source
    ])
    assert.equal(createSource.exitCode, 0, createSource.stderr)

    const result = await runTool(pythonCommand, [backupTool, source, destination], { redactOutput: false })
    assert.equal(result.exitCode, 0, result.stderr)

    const parsed = JSON.parse(result.stdout) as { integrityCheck?: string; rowCountProbe?: number }
    assert.equal(parsed.integrityCheck, 'ok')
    assert.equal(parsed.rowCountProbe, undefined)
    assert.match(await readFile(destination, 'binary'), /SQLite format/)

    const overwrite = await runTool(pythonCommand, [backupTool, source, destination])
    assert.notEqual(overwrite.exitCode, 0)
    assert.match(overwrite.stderr, /destination already exists/)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
