// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readImportPolicyTimestampFromReport } from './import-report-timestamp'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-import-report-timestamp-'))
  const backendRoot = join(root, 'Backend')

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('readImportPolicyTimestampFromReport reads generatedAt from the matching import report label', async () => {
  await withBackendRoot(async (backendRoot) => {
    const reportDir = join(backendRoot, '.migration-lab', 'reports', 'fixture-label')
    await mkdir(reportDir, { recursive: true })
    await writeFile(
      join(reportDir, 'postgres-import.json'),
      JSON.stringify({ generatedAt: '2026-05-21T07:51:36.819Z' }),
      'utf8'
    )

    const result = await readImportPolicyTimestampFromReport('fixture-label', backendRoot)

    assert.equal(result.importPolicyTimestamp.toISOString(), '2026-05-21T07:51:36.819Z')
    assert.equal(result.reportPath, join(reportDir, 'postgres-import.json'))
  })
})

test('readImportPolicyTimestampFromReport rejects missing or invalid import timestamps', async () => {
  await withBackendRoot(async (backendRoot) => {
    const reportDir = join(backendRoot, '.migration-lab', 'reports', 'fixture-label')
    await mkdir(reportDir, { recursive: true })
    await writeFile(join(reportDir, 'postgres-import.json'), JSON.stringify({ generatedAt: 'not-a-date' }), 'utf8')

    await assert.rejects(
      () => readImportPolicyTimestampFromReport('fixture-label', backendRoot),
      /Invalid generatedAt in PostgreSQL import report/
    )
    await assert.rejects(
      () => readImportPolicyTimestampFromReport('missing-label', backendRoot),
      /Run db:pg:import with the same label before db:pg:validate/
    )
  })
})

test('readImportPolicyTimestampFromReport can read an explicitly approved cutover import report', async () => {
  await withBackendRoot(async (backendRoot) => {
    const reportRoot = join(backendRoot, '..', 'postgresql-cutover', 'prod-2026-05-21')
    const reportPath = join(reportRoot, 'postgres-import.json')
    await mkdir(reportRoot, { recursive: true })
    await writeFile(reportPath, JSON.stringify({ generatedAt: '2026-05-21T10:10:10.000Z' }), 'utf8')

    const result = await readImportPolicyTimestampFromReport({
      backendRoot,
      label: 'prod-2026-05-21',
      importReportPath: reportPath,
      reportRoot
    })

    assert.equal(result.importPolicyTimestamp.toISOString(), '2026-05-21T10:10:10.000Z')
    assert.equal(result.reportPath, reportPath)
  })
})
