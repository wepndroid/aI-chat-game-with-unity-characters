// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeMigrationJsonReport } from './report-writer'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-db-lab-report-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(backendRoot, { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('writes deterministic redacted JSON reports under the migration lab reports directory', async () => {
  await withBackendRoot(async (backendRoot) => {
    const reportPath = await writeMigrationJsonReport({
      backendRoot,
      reportPath: '.migration-lab/reports/preflight.json',
      data: {
        zeta: 'last',
        databaseUrl: 'postgresql://postgres:secret@localhost:5433/db',
        alpha: 1
      }
    })

    const report = await readFile(reportPath, 'utf8')
    assert.equal(
      report,
      '{\n  "alpha": 1,\n  "databaseUrl": "[REDACTED]",\n  "zeta": "last"\n}\n'
    )
  })
})

test('refuses to write reports outside the migration lab reports directory', async () => {
  await withBackendRoot(async (backendRoot) => {
    await assert.rejects(
      () =>
        writeMigrationJsonReport({
          backendRoot,
          reportPath: 'preflight.json',
          data: { ok: true }
        }),
      /outside the migration lab reports directory/
    )
  })
})

test('can write to an explicitly approved production cutover report root', async () => {
  await withBackendRoot(async (backendRoot) => {
    const reportRoot = join(backendRoot, '..', 'postgresql-cutover', 'prod-2026-05-21')
    const reportPath = await writeMigrationJsonReport({
      backendRoot,
      reportRoot,
      reportPath: join(reportRoot, 'postgres-import.json'),
      data: {
        ok: true,
        connectionString: 'postgresql://postgres:secret@localhost:5432/prod'
      }
    })

    assert.equal(reportPath, join(reportRoot, 'postgres-import.json'))
    const report = await readFile(reportPath, 'utf8')
    assert.equal(report.includes('secret'), false)
    assert.match(report, /"connectionString": "\[REDACTED\]"/)
  })
})
