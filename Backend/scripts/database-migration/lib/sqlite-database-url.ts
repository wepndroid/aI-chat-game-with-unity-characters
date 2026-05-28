// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { access, readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parse } from 'dotenv'
import { assertInsideDirectory, resolveBackendPath } from './paths'

type ResolveSqliteSourcePathFromEnvFileParams = {
  backendRoot?: string
  envFile: string
}

type ResolveExplicitSqliteSourcePathParams = {
  backendRoot?: string
  sqlitePath: string
}

type SqliteSourcePathResult = {
  sourcePath: string
  envFilePath: string
}

const parseSqliteFileUrl = (databaseUrl: string, backendRoot: string) => {
  const trimmedUrl = databaseUrl.trim()
  if (!trimmedUrl.toLowerCase().startsWith('file:')) {
    throw new Error('DATABASE_URL must be a SQLite file URL for snapshot source discovery.')
  }

  const sqlitePath = trimmedUrl.slice('file:'.length).trim()
  if (!sqlitePath) {
    throw new Error('DATABASE_URL SQLite file path is empty.')
  }

  const resolvedSourcePath = isAbsolute(sqlitePath) ? resolve(sqlitePath) : resolve(backendRoot, sqlitePath)
  return assertInsideDirectory(
    resolvedSourcePath,
    backendRoot,
    'SQLite source path must stay inside the backend root when read from DATABASE_URL.'
  )
}

/**
 * Reads only the selected env file and parses DATABASE_URL without mutating
 * process.env. This keeps cutover source discovery separate from runtime
 * credential loading and avoids accidentally exporting secrets from operator
 * files into child processes.
 */
const resolveSqliteSourcePathFromEnvFile = async (
  params: ResolveSqliteSourcePathFromEnvFileParams
): Promise<SqliteSourcePathResult> => {
  const backendRoot = resolve(params.backendRoot ?? process.cwd())
  const envFilePath = assertInsideDirectory(
    resolveBackendPath(params.envFile, backendRoot),
    backendRoot,
    'SQLite env file must stay inside the backend root.'
  )

  try {
    await access(envFilePath)
  } catch {
    throw new Error('SQLite env file does not exist.')
  }

  const parsedEnv = parse(await readFile(envFilePath))
  const databaseUrl = parsedEnv.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required in the selected SQLite env file.')
  }

  return {
    sourcePath: parseSqliteFileUrl(databaseUrl, backendRoot),
    envFilePath
  }
}

const resolveExplicitSqliteSourcePath = (params: ResolveExplicitSqliteSourcePathParams) => {
  const backendRoot = resolve(params.backendRoot ?? process.cwd())
  const trimmedPath = params.sqlitePath.trim()
  if (!trimmedPath) {
    throw new Error('Explicit SQLite source path is required.')
  }

  if (isAbsolute(trimmedPath)) {
    return resolve(trimmedPath)
  }

  return assertInsideDirectory(
    resolveBackendPath(trimmedPath, backendRoot),
    backendRoot,
    'Explicit SQLite source path must stay inside the backend root unless it is absolute.'
  )
}

export { resolveExplicitSqliteSourcePath, resolveSqliteSourcePathFromEnvFile }
export type { SqliteSourcePathResult }
