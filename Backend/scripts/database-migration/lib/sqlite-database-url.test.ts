// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveExplicitSqliteSourcePath, resolveSqliteSourcePathFromEnvFile } from './sqlite-database-url'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-sqlite-url-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(join(backendRoot, 'prisma'), { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('resolves a SQLite DATABASE_URL from the selected env file without exporting secrets', async () => {
  await withBackendRoot(async (backendRoot) => {
    const envFile = join(backendRoot, '.env')
    await writeFile(envFile, 'DATABASE_URL="file:./prisma/prod.db"\nOTHER_SECRET=super-secret\n', 'utf8')

    const result = await resolveSqliteSourcePathFromEnvFile({ backendRoot, envFile })

    assert.equal(result.sourcePath, join(backendRoot, 'prisma', 'prod.db'))
    assert.equal(process.env.OTHER_SECRET, undefined)
  })
})

test('rejects PostgreSQL and missing DATABASE_URL values with redacted errors', async () => {
  await withBackendRoot(async (backendRoot) => {
    const envFile = join(backendRoot, '.env')
    await writeFile(envFile, 'DATABASE_URL="postgresql://dbuser:db-password@localhost:5432/prod"\n', 'utf8')

    await assert.rejects(
      () => resolveSqliteSourcePathFromEnvFile({ backendRoot, envFile }),
      (error: unknown) => {
        assert(error instanceof Error)
        assert.match(error.message, /must be a SQLite file URL/)
        assert.equal(error.message.includes('db-password'), false)
        assert.equal(error.message.includes('postgresql://'), false)
        return true
      }
    )

    await writeFile(envFile, 'NODE_ENV=production\n', 'utf8')
    await assert.rejects(
      () => resolveSqliteSourcePathFromEnvFile({ backendRoot, envFile }),
      /DATABASE_URL is required/
    )
  })
})

test('rejects missing env files and backend-relative traversal', async () => {
  await withBackendRoot(async (backendRoot) => {
    await assert.rejects(
      () => resolveSqliteSourcePathFromEnvFile({ backendRoot, envFile: join(backendRoot, '.missing-env') }),
      /SQLite env file does not exist/
    )

    const envFile = join(backendRoot, '.env')
    await writeFile(envFile, 'DATABASE_URL="file:../outside/prod.db"\n', 'utf8')

    await assert.rejects(
      () => resolveSqliteSourcePathFromEnvFile({ backendRoot, envFile }),
      /SQLite source path must stay inside the backend root/
    )
  })
})

test('explicit SQLite paths allow absolute operator input and reject backend-relative traversal', async () => {
  await withBackendRoot(async (backendRoot) => {
    const absoluteSource = join(tmpdir(), 'secretwaifu-prod-copy.db')

    assert.equal(resolveExplicitSqliteSourcePath({ backendRoot, sqlitePath: absoluteSource }), absoluteSource)
    assert.equal(
      resolveExplicitSqliteSourcePath({ backendRoot, sqlitePath: './prisma/prod.db' }),
      join(backendRoot, 'prisma', 'prod.db')
    )
    assert.throws(
      () => resolveExplicitSqliteSourcePath({ backendRoot, sqlitePath: '../outside/prod.db' }),
      /Explicit SQLite source path must stay inside the backend root unless it is absolute/
    )
  })
})
