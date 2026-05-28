// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { basename, join, resolve } from 'node:path'
import {
  assertInsideDirectory,
  assertInsideLabReports,
  assertInsideLabSource,
  getMigrationLabPaths,
  parseSafeLabel,
  reportPathForLabel,
  resolveBackendPath
} from './paths'
import { labSqliteSourceBoundary, type SqliteSourceBoundary } from './sqlite-source-boundary'

type MigrationCommandMode = 'lab' | 'production-cutover'

type MigrationCommandWorkspace = {
  sourcePath: string
  sourceBoundary: SqliteSourceBoundary
  label: string
  mode: MigrationCommandMode
  reportRoot: string
  reportPath: (fileName: string) => string
}

type CreateMigrationCommandWorkspaceParams = {
  backendRoot?: string
  source: string
  label: string
  report?: string
  cutoverDir?: string
  allowProductionSource?: boolean
}

type ResolveCutoverDirectoryParams = {
  backendRoot?: string
  cutoverDir: string
}

const assertCutoverPath = (pathValue: string, cutoverDir: string, message: string) =>
  assertInsideDirectory(pathValue, cutoverDir, message)

/**
 * Resolves the operator-owned production cutover workspace.
 *
 * Cutover artifacts must live outside the app checkout so snapshots, reports,
 * and local PostgreSQL backups are not accidentally deployed or committed with
 * the release tree.
 */
const resolveCutoverDirectory = (params: ResolveCutoverDirectoryParams) => {
  const backendRoot = resolve(params.backendRoot ?? process.cwd())
  const rawCutoverDir = params.cutoverDir.trim()
  if (!rawCutoverDir) {
    throw new Error('Cutover directory is required for production cutover mode.')
  }

  const cutoverDir = resolveBackendPath(rawCutoverDir, backendRoot)
  if (cutoverDir === backendRoot) {
    throw new Error('Cutover directory must not be the backend root.')
  }

  const backendRelative = cutoverDir === backendRoot ? '' : assertInsideOrOutsideBackend(cutoverDir, backendRoot)
  if (backendRelative === 'inside') {
    throw new Error('Cutover directory must stay outside the backend root.')
  }

  return cutoverDir
}

const assertInsideOrOutsideBackend = (pathValue: string, backendRoot: string) => {
  try {
    assertInsideDirectory(pathValue, backendRoot, 'outside')
    return 'inside'
  } catch {
    return 'outside'
  }
}

const createLabWorkspace = (params: Required<Pick<CreateMigrationCommandWorkspaceParams, 'source' | 'label'>> & { backendRoot: string; report?: string }): MigrationCommandWorkspace => {
  const label = parseSafeLabel(params.label)
  const labPaths = getMigrationLabPaths(params.backendRoot)
  const sourcePath = assertInsideLabSource(resolveBackendPath(params.source, params.backendRoot), params.backendRoot)
  const explicitReport = params.report?.trim()
  const explicitReportPath = explicitReport
    ? assertInsideLabReports(resolveBackendPath(explicitReport, params.backendRoot), params.backendRoot)
    : undefined

  return {
    sourcePath,
    sourceBoundary: labSqliteSourceBoundary,
    label,
    mode: 'lab',
    reportRoot: labPaths.reportRoot,
    reportPath: (fileName: string) => explicitReportPath ?? reportPathForLabel(label, fileName, params.backendRoot)
  }
}

const createProductionCutoverWorkspace = (
  params: Required<Pick<CreateMigrationCommandWorkspaceParams, 'source' | 'label' | 'cutoverDir'>> & {
    backendRoot: string
    report?: string
    allowProductionSource?: boolean
  }
): MigrationCommandWorkspace => {
  if (!params.allowProductionSource) {
    throw new Error('Production cutover mode requires --allow-production-source.')
  }

  const label = parseSafeLabel(params.label)
  const cutoverDir = resolveCutoverDirectory({ backendRoot: params.backendRoot, cutoverDir: params.cutoverDir })
  const sourcePath = assertCutoverPath(
    resolveBackendPath(params.source, params.backendRoot),
    cutoverDir,
    'Source path must stay inside the cutover directory.'
  )
  const explicitReport = params.report?.trim()
  const explicitReportPath = explicitReport
    ? assertCutoverPath(resolveBackendPath(explicitReport, params.backendRoot), cutoverDir, 'Report path must stay inside the cutover directory.')
    : undefined

  return {
    sourcePath,
    sourceBoundary: { kind: 'cutover', cutoverDir },
    label,
    mode: 'production-cutover',
    reportRoot: cutoverDir,
    reportPath: (fileName: string) =>
      assertCutoverPath(
        explicitReportPath ?? join(cutoverDir, basename(fileName)),
        cutoverDir,
        'Report path must stay inside the cutover directory.'
      )
  }
}

const createMigrationCommandWorkspace = (params: CreateMigrationCommandWorkspaceParams): MigrationCommandWorkspace => {
  const backendRoot = resolve(params.backendRoot ?? process.cwd())
  const hasProductionIntent = Boolean(params.cutoverDir || params.allowProductionSource)
  if (!hasProductionIntent) {
    return createLabWorkspace({
      backendRoot,
      source: params.source,
      label: params.label,
      report: params.report
    })
  }

  if (params.cutoverDir === undefined) {
    throw new Error('Production cutover mode requires --cutover-dir.')
  }

  return createProductionCutoverWorkspace({
    backendRoot,
    source: params.source,
    label: params.label,
    report: params.report,
    cutoverDir: params.cutoverDir,
    allowProductionSource: params.allowProductionSource
  })
}

export { createMigrationCommandWorkspace, resolveCutoverDirectory }
export type { MigrationCommandMode, MigrationCommandWorkspace }
