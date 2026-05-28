// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { buildSourcePreflightSummary } from './import-executor'
import { resolvePythonCommand, type PythonCommand } from './sqlite-source-inspector'

const createPreflightFixture = (pythonCommand: PythonCommand, sourcePath: string) => {
  const script = [
    'import sqlite3, sys',
    'connection = sqlite3.connect(sys.argv[1])',
    'connection.execute("CREATE TABLE ChatPendingTurn(id TEXT PRIMARY KEY, reservationId TEXT, status TEXT, expiresAt TEXT, updatedAt TEXT, committedAt TEXT, abortedAt TEXT, expiredAt TEXT)")',
    'connection.execute("CREATE TABLE UnityLaunchContext(id TEXT PRIMARY KEY, expiresAt TEXT NOT NULL, consumedAt TEXT)")',
    'connection.commit()',
    'connection.close()'
  ].join('; ')

  const result = spawnSync(pythonCommand.command, [...pythonCommand.args, '-c', script, sourcePath], {
    encoding: 'utf8'
  })

  assert.equal(result.status, 0, result.stderr)
}

test('source preflight accepts a cutover snapshot outside the migration lab after cutover boundary validation', async (t) => {
  const pythonCommand = await resolvePythonCommand()
  if (!pythonCommand) {
    t.skip('Python 3 with sqlite3 is required for SQLite fixture creation.')
    return
  }

  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-import-executor-'))
  const backendRoot = join(root, 'Backend')
  const cutoverDir = resolve(root, 'postgresql-cutover', 'prod-2026-05-21')
  const sourcePath = join(cutoverDir, 'prod.sqlite.before-postgresql.db')

  try {
    await mkdir(cutoverDir, { recursive: true })
    await mkdir(backendRoot, { recursive: true })
    createPreflightFixture(pythonCommand, sourcePath)

    const summary = await buildSourcePreflightSummary(sourcePath, new Date('2026-05-21T00:00:00.000Z'), {
      sourceBoundary: {
        kind: 'cutover',
        cutoverDir
      }
    })

    assert.equal(summary.pendingTurns.sourceRows, 0)
    assert.equal(summary.unityLaunchContexts.sourceRows, 0)
    assert.deepEqual(summary.unknownSourceTables, [])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
