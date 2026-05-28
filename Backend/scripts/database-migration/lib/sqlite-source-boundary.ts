// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { relative, resolve, sep } from 'node:path'
import { assertInsideDirectory, assertInsideLabSource, labRelativePath, resolveBackendPath } from './paths'

type SqliteSourceBoundary =
  | {
      kind: 'lab'
    }
  | {
      kind: 'cutover'
      cutoverDir: string
    }

const labSqliteSourceBoundary: SqliteSourceBoundary = { kind: 'lab' }

const toForwardSlashes = (value: string) => value.split(sep).join('/')

/**
 * Resolves a SQLite source path under the boundary that already owns it.
 *
 * Local rehearsal commands are intentionally limited to `.migration-lab/source`.
 * Production cutover commands first validate the source under the operator-owned
 * cutover directory, then pass that boundary to lower-level SQLite readers so
 * the same path is rechecked without relaxing safety globally.
 */
const resolveSqliteSourcePath = (
  sourcePath: string,
  backendRoot = process.cwd(),
  sourceBoundary: SqliteSourceBoundary = labSqliteSourceBoundary
) => {
  if (sourceBoundary.kind === 'cutover') {
    return assertInsideDirectory(
      resolveBackendPath(sourcePath, backendRoot),
      sourceBoundary.cutoverDir,
      'Source path must stay inside the cutover directory.'
    )
  }

  return assertInsideLabSource(sourcePath, backendRoot)
}

const describeSqliteSourcePath = (
  sourcePath: string,
  backendRoot = process.cwd(),
  sourceBoundary: SqliteSourceBoundary = labSqliteSourceBoundary
) => {
  if (sourceBoundary.kind === 'cutover') {
    const resolvedSourcePath = resolveSqliteSourcePath(sourcePath, backendRoot, sourceBoundary)
    return `cutover/${toForwardSlashes(relative(resolve(sourceBoundary.cutoverDir), resolvedSourcePath))}`
  }

  return labRelativePath(sourcePath, backendRoot)
}

export { describeSqliteSourcePath, labSqliteSourceBoundary, resolveSqliteSourcePath }
export type { SqliteSourceBoundary }
