// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveSqliteSourcePath, type SqliteSourceBoundary } from './sqlite-source-boundary'
import { runTool } from './tool-runner'
import { resolvePythonCommand, type PythonCommand } from './sqlite-source-inspector'

type SqliteRow = Record<string, unknown>

type ReadSqliteTableRowsParams = {
  backendRoot?: string
  sourcePath: string
  tableName: string
  columns: readonly string[]
  sourceBoundary?: SqliteSourceBoundary
  pythonCommand?: PythonCommand
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/
const sqliteRowScriptPath = resolve(__dirname, '..', 'tools', 'sqlite_rows.py')

const assertSafeSqliteIdentifier = (identifier: string) => {
  if (!identifierPattern.test(identifier)) {
    throw new Error(`Unsafe SQLite identifier: ${identifier}`)
  }

  return identifier
}

const parseJsonLines = (stdout: string): SqliteRow[] => {
  const lines = stdout.split(/\r?\n/).filter(Boolean)
  return lines.map((line) => JSON.parse(line) as SqliteRow)
}

const readSqliteTableRows = async (params: ReadSqliteTableRowsParams): Promise<SqliteRow[]> => {
  const backendRoot = params.backendRoot ?? process.cwd()
  const sourcePath = resolveSqliteSourcePath(params.sourcePath, backendRoot, params.sourceBoundary)
  const tableName = assertSafeSqliteIdentifier(params.tableName)
  const columns = params.columns.map((column) => assertSafeSqliteIdentifier(column))
  if (!existsSync(sqliteRowScriptPath)) {
    throw new Error(`SQLite row reader helper is missing: ${sqliteRowScriptPath}`)
  }

  const pythonCommand = params.pythonCommand ?? (await resolvePythonCommand())
  if (!pythonCommand) {
    throw new Error('Python 3 with sqlite3 is required for SQLite row import.')
  }

  const result = await runTool(
    pythonCommand.command,
    [...pythonCommand.args, sqliteRowScriptPath, sourcePath, tableName, JSON.stringify(columns)],
    { cwd: backendRoot, redactOutput: false, timeoutMs: 120000 }
  )
  if (result.exitCode !== 0) {
    throw new Error(
      `SQLite row read for ${tableName} failed with exit code ${result.exitCode ?? 'not-started'}: ${
        result.stderr || result.errorCode || 'no stderr'
      }`
    )
  }

  return parseJsonLines(result.stdout)
}

export { assertSafeSqliteIdentifier, readSqliteTableRows }
export type { ReadSqliteTableRowsParams, SqliteRow }
