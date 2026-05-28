// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { inspectSqliteSource, resolvePythonCommand } from './sqlite-source-inspector'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-db-lab-sqlite-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(join(backendRoot, '.migration-lab', 'source', 'fixture'), { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('inspects a lab-contained SQLite source without returning row contents', async (t) => {
  const pythonCommand = await resolvePythonCommand()
  if (!pythonCommand) {
    t.skip('Python sqlite3 is not available in this environment.')
    return
  }

  await withBackendRoot(async (backendRoot) => {
    const sourcePath = join(backendRoot, '.migration-lab', 'source', 'fixture', 'source.db')
    const createDatabase = spawnSync(
      pythonCommand.command,
      [
        ...pythonCommand.args,
        '-c',
        [
          'import sqlite3, sys',
          'conn = sqlite3.connect(sys.argv[1])',
          'conn.execute("create table User (id text primary key, email text not null)")',
          'conn.execute("insert into User (id, email) values (?, ?)", ("user-1", "secret@example.com"))',
          'conn.commit()',
          'conn.close()'
        ].join('; '),
        sourcePath
      ],
      { encoding: 'utf8' }
    )

    assert.equal(createDatabase.status, 0, createDatabase.stderr)

    const report = await inspectSqliteSource({ backendRoot, sourcePath, pythonCommand })

    assert.equal(report.integrityCheck, 'ok')
    assert.deepEqual(report.tables.map((table) => table.name), ['User'])
    assert.equal(report.rowCounts.User, 1)
    assert.equal(JSON.stringify(report).includes('secret@example.com'), false)
    assert.equal(report.expectedTables.durable.User, true)
  })
})

test('refuses to inspect SQLite files outside the lab source directory', async () => {
  await withBackendRoot(async (backendRoot) => {
    await assert.rejects(
      () => inspectSqliteSource({ backendRoot, sourcePath: join(backendRoot, 'prisma', 'prod.db') }),
      /outside the migration lab source directory/
    )
  })
})
