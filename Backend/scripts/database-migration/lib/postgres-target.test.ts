// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertPostgresDatabaseUrl,
  buildApplicationTableCountSql,
  parseDatabaseUrlForSafety
} from './postgres-target'

test('assertPostgresDatabaseUrl accepts PostgreSQL URLs and rejects SQLite URLs', () => {
  assert.doesNotThrow(() => assertPostgresDatabaseUrl('postgresql://user:pass@localhost:5432/db'))
  assert.throws(() => assertPostgresDatabaseUrl('file:./prod.db'), /PostgreSQL DATABASE_URL/)
})

test('parseDatabaseUrlForSafety refuses production-like local lab database names unless allowed', () => {
  assert.deepEqual(parseDatabaseUrlForSafety('postgresql://user:pass@localhost:5433/secretwaifu_migration_lab'), {
    protocol: 'postgresql:',
    host: 'localhost',
    port: '5433',
    database: 'secretwaifu_migration_lab'
  })
  assert.throws(
    () => parseDatabaseUrlForSafety('postgresql://user:pass@localhost:5432/secretwaifu_prod'),
    /production-like database/
  )
})

test('buildApplicationTableCountSql excludes Prisma migration metadata', () => {
  const sql = buildApplicationTableCountSql()

  assert.match(sql, /information_schema\.tables/)
  assert.match(sql, /_prisma_migrations/)
  assert.match(sql, /table_schema = 'public'/)
})
