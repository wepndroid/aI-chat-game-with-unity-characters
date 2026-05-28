// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { isAbsolute, relative, resolve, sep } from 'node:path'

const DEFAULT_LAB_DIR = '.migration-lab'
const SOURCE_DIR_NAME = 'source'
const REPORTS_DIR_NAME = 'reports'

type MigrationLabEnv = {
  MIGRATION_LAB_DIR?: string
  MIGRATION_REPORT_DIR?: string
}

type MigrationLabPaths = {
  backendRoot: string
  labRoot: string
  sourceRoot: string
  reportRoot: string
}

const toForwardSlashes = (value: string) => value.split(sep).join('/')

const assertInsideDirectory = (pathValue: string, parentDirectory: string, message: string) => {
  const resolvedPath = resolve(pathValue)
  const resolvedParent = resolve(parentDirectory)
  const relativePath = relative(resolvedParent, resolvedPath)

  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
    return resolvedPath
  }

  throw new Error(message)
}

const resolveBackendPath = (pathValue: string, backendRoot = process.cwd()) => {
  const trimmedValue = pathValue.trim()
  if (!trimmedValue) {
    throw new Error('Path value is required.')
  }

  return isAbsolute(trimmedValue) ? resolve(trimmedValue) : resolve(backendRoot, trimmedValue)
}

const getMigrationLabPaths = (backendRoot = process.cwd(), env: MigrationLabEnv = process.env): MigrationLabPaths => {
  const resolvedBackendRoot = resolve(backendRoot)
  const labRoot = resolveBackendPath(env.MIGRATION_LAB_DIR?.trim() || DEFAULT_LAB_DIR, resolvedBackendRoot)
  assertInsideDirectory(labRoot, resolvedBackendRoot, 'Migration lab directory must stay inside the backend root.')
  if (labRoot === resolvedBackendRoot) {
    throw new Error('Migration lab directory must be a child directory under the backend root.')
  }

  const defaultReportRoot = resolve(labRoot, REPORTS_DIR_NAME)
  const configuredReportRoot = env.MIGRATION_REPORT_DIR?.trim()
    ? resolveBackendPath(env.MIGRATION_REPORT_DIR, resolvedBackendRoot)
    : defaultReportRoot

  const reportRoot = assertInsideDirectory(
    configuredReportRoot,
    labRoot,
    'Migration report directory must stay inside the migration lab directory.'
  )

  return {
    backendRoot: resolvedBackendRoot,
    labRoot,
    sourceRoot: resolve(labRoot, SOURCE_DIR_NAME),
    reportRoot
  }
}

const assertInsideLabSource = (pathValue: string, backendRoot = process.cwd(), env: MigrationLabEnv = process.env) => {
  const labPaths = getMigrationLabPaths(backendRoot, env)
  return assertInsideDirectory(
    resolveBackendPath(pathValue, labPaths.backendRoot),
    labPaths.sourceRoot,
    'Path is outside the migration lab source directory.'
  )
}

const assertInsideLabReports = (pathValue: string, backendRoot = process.cwd(), env: MigrationLabEnv = process.env) => {
  const labPaths = getMigrationLabPaths(backendRoot, env)
  return assertInsideDirectory(
    resolveBackendPath(pathValue, labPaths.backendRoot),
    labPaths.reportRoot,
    'Path is outside the migration lab reports directory.'
  )
}

const labRelativePath = (pathValue: string, backendRoot = process.cwd(), env: MigrationLabEnv = process.env) => {
  const labPaths = getMigrationLabPaths(backendRoot, env)
  const resolvedPath = assertInsideDirectory(
    resolveBackendPath(pathValue, labPaths.backendRoot),
    labPaths.labRoot,
    'Path is outside the migration lab directory.'
  )

  return toForwardSlashes(relative(labPaths.backendRoot, resolvedPath))
}

const parseSafeLabel = (value: string) => {
  const label = value.trim()
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(label) || label.includes('..')) {
    throw new Error(`Invalid migration label: ${value}`)
  }

  return label
}

const reportPathForLabel = (labelValue: string, reportFileName: string, backendRoot = process.cwd(), env: MigrationLabEnv = process.env) => {
  const label = parseSafeLabel(labelValue)
  const labPaths = getMigrationLabPaths(backendRoot, env)
  return assertInsideLabReports(resolve(labPaths.reportRoot, label, reportFileName), backendRoot, env)
}

const sourceDirectoryForLabel = (labelValue: string, backendRoot = process.cwd(), env: MigrationLabEnv = process.env) => {
  const label = parseSafeLabel(labelValue)
  const labPaths = getMigrationLabPaths(backendRoot, env)
  return assertInsideLabSource(resolve(labPaths.sourceRoot, label), backendRoot, env)
}

export {
  assertInsideDirectory,
  assertInsideLabReports,
  assertInsideLabSource,
  getMigrationLabPaths,
  labRelativePath,
  parseSafeLabel,
  reportPathForLabel,
  resolveBackendPath,
  sourceDirectoryForLabel
}
export type { MigrationLabPaths }
