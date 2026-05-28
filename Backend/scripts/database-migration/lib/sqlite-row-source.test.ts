// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { readSqliteTableRows } from './sqlite-row-source'
import { resolvePythonCommand } from './sqlite-source-inspector'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-db-lab-row-source-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(join(backendRoot, '.migration-lab', 'source', 'fixture'), { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('readSqliteTableRows streams selected table columns without exposing unrelated row data', async (t) => {
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
          'conn.execute("create table User (id text primary key, email text not null, hidden text not null)")',
          'conn.execute("insert into User (id, email, hidden) values (?, ?, ?)", ("user-1", "visible@example.com", "do-not-read"))',
          'conn.commit()',
          'conn.close()'
        ].join('; '),
        sourcePath
      ],
      { encoding: 'utf8' }
    )

    assert.equal(createDatabase.status, 0, createDatabase.stderr)

    const rows = await readSqliteTableRows({
      backendRoot,
      sourcePath,
      tableName: 'User',
      columns: ['id', 'email'],
      pythonCommand
    })

    assert.deepEqual(rows, [{ id: 'user-1', email: 'visible@example.com' }])
    assert.equal(JSON.stringify(rows).includes('do-not-read'), false)
  })
})

test('readSqliteTableRows rejects unsafe table and column names', async () => {
  await withBackendRoot(async (backendRoot) => {
    const sourcePath = join(backendRoot, '.migration-lab', 'source', 'fixture', 'source.db')

    await assert.rejects(
      () =>
        readSqliteTableRows({
          backendRoot,
          sourcePath,
          tableName: 'User; DROP TABLE User',
          columns: ['id']
        }),
      /Unsafe SQLite identifier/
    )
  })
})
