// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createMigrationCommandWorkspace } from './cutover-workspace'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-cutover-workspace-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(backendRoot, { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('defaults to local lab mode and preserves positional source and label usage', async () => {
  await withBackendRoot(async (backendRoot) => {
    const workspace = createMigrationCommandWorkspace({
      backendRoot,
      source: '.migration-lab/source/prod-2026-05-21/source.db',
      label: 'prod-2026-05-21'
    })

    assert.equal(workspace.mode, 'lab')
    assert.equal(workspace.label, 'prod-2026-05-21')
    assert.equal(workspace.sourcePath, join(backendRoot, '.migration-lab', 'source', 'prod-2026-05-21', 'source.db'))
    assert.equal(
      workspace.reportPath('postgres-import.json'),
      join(backendRoot, '.migration-lab', 'reports', 'prod-2026-05-21', 'postgres-import.json')
    )
  })
})

test('production cutover mode requires a cutover directory and source acknowledgement', async () => {
  await withBackendRoot(async (backendRoot) => {
    const cutoverDir = join(backendRoot, '..', 'postgresql-cutover', 'prod-2026-05-21')
    const source = join(cutoverDir, 'prod.sqlite.before-postgresql.db')

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source,
          label: 'prod-2026-05-21',
          allowProductionSource: true
        }),
      /requires --cutover-dir/
    )

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source,
          label: 'prod-2026-05-21',
          cutoverDir
        }),
      /requires --allow-production-source/
    )
  })
})

test('production cutover mode accepts source and report paths inside the cutover directory', async () => {
  await withBackendRoot(async (backendRoot) => {
    const cutoverDir = resolve(backendRoot, '..', 'postgresql-cutover', 'prod-2026-05-21')
    const source = join(cutoverDir, 'prod.sqlite.before-postgresql.db')
    const report = join(cutoverDir, 'preflight-after-stop.json')

    const workspace = createMigrationCommandWorkspace({
      backendRoot,
      source,
      label: 'prod-2026-05-21',
      report,
      cutoverDir,
      allowProductionSource: true
    })

    assert.equal(workspace.mode, 'production-cutover')
    assert.equal(workspace.label, 'prod-2026-05-21')
    assert.equal(workspace.sourcePath, source)
    assert.equal(workspace.reportPath('postgres-import-preflight.json'), report)
  })
})

test('production cutover mode rejects unsafe cutover and report paths', async () => {
  await withBackendRoot(async (backendRoot) => {
    const cutoverDir = resolve(backendRoot, '..', 'postgresql-cutover', 'prod-2026-05-21')
    const source = join(cutoverDir, 'prod.sqlite.before-postgresql.db')

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source,
          label: 'prod-2026-05-21',
          cutoverDir: '',
          allowProductionSource: true
        }),
      /Cutover directory is required/
    )

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source: join(backendRoot, 'prisma', 'prod.db'),
          label: 'prod-2026-05-21',
          cutoverDir,
          allowProductionSource: true
        }),
      /Source path must stay inside the cutover directory/
    )

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source,
          label: 'prod-2026-05-21',
          report: join(cutoverDir, '..', 'leak.json'),
          cutoverDir,
          allowProductionSource: true
        }),
      /Report path must stay inside the cutover directory/
    )

    assert.throws(
      () =>
        createMigrationCommandWorkspace({
          backendRoot,
          source,
          label: 'prod-2026-05-21',
          cutoverDir: backendRoot,
          allowProductionSource: true
        }),
      /Cutover directory must not be the backend root/
    )
  })
})
