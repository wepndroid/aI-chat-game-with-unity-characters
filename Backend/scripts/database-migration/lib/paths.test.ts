// Migration lifecycle: disposable validation scaffold. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import {
  assertInsideLabReports,
  assertInsideLabSource,
  getMigrationLabPaths,
  labRelativePath,
  parseSafeLabel,
  resolveBackendPath
} from './paths'

const withBackendRoot = async (fn: (backendRoot: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), 'secretwaifu-db-lab-paths-'))
  const backendRoot = join(root, 'Backend')
  await mkdir(backendRoot, { recursive: true })

  try {
    await fn(backendRoot)
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test('accepts source files and report paths inside the migration lab', async () => {
  await withBackendRoot(async (backendRoot) => {
    const labPaths = getMigrationLabPaths(backendRoot)
    const sourcePath = join(labPaths.sourceRoot, 'prod-2026-05-18', 'source.db')
    const reportPath = join(labPaths.reportRoot, 'prod-2026-05-18', 'source-inspection.json')

    assert.equal(assertInsideLabSource(sourcePath, backendRoot), resolve(sourcePath))
    assert.equal(assertInsideLabReports(reportPath, backendRoot), resolve(reportPath))
    assert.equal(labRelativePath(sourcePath, backendRoot), '.migration-lab/source/prod-2026-05-18/source.db')
  })
})

test('rejects source files and reports outside the migration lab', async () => {
  await withBackendRoot(async (backendRoot) => {
    assert.throws(
      () => assertInsideLabSource(join(backendRoot, 'prisma', 'prod.db'), backendRoot),
      /outside the migration lab source directory/
    )
    assert.throws(
      () => assertInsideLabReports(join(backendRoot, 'source-inspection.json'), backendRoot),
      /outside the migration lab reports directory/
    )
  })
})

test('resolves backend-relative paths without allowing empty input', async () => {
  await withBackendRoot(async (backendRoot) => {
    assert.equal(resolveBackendPath('.migration-lab/source/a/source.db', backendRoot), join(backendRoot, '.migration-lab', 'source', 'a', 'source.db'))
    assert.throws(() => resolveBackendPath('   ', backendRoot), /Path value is required/)
  })
})

test('accepts stable labels and rejects traversal labels', () => {
  assert.equal(parseSafeLabel('prod-2026-05-18'), 'prod-2026-05-18')
  assert.equal(parseSafeLabel('local.pg18_rehearsal'), 'local.pg18_rehearsal')
  assert.throws(() => parseSafeLabel('../prod'), /Invalid migration label/)
  assert.throws(() => parseSafeLabel('prod copy'), /Invalid migration label/)
})

test('uses the configured lab directory when provided by local env', async () => {
  await withBackendRoot(async (backendRoot) => {
    await writeFile(join(backendRoot, '.env.migration'), 'MIGRATION_LAB_DIR=.custom-lab\n', 'utf8')
    const labPaths = getMigrationLabPaths(backendRoot, { MIGRATION_LAB_DIR: '.custom-lab' })
    assert.equal(labPaths.labRoot, join(backendRoot, '.custom-lab'))
  })
})

test('rejects backend root as the migration lab directory', async () => {
  await withBackendRoot(async (backendRoot) => {
    assert.throws(
      () => getMigrationLabPaths(backendRoot, { MIGRATION_LAB_DIR: '.' }),
      /Migration lab directory must be a child directory/
    )
  })
})
