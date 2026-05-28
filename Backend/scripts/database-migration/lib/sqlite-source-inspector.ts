// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { calculateFileSha256 } from './file-hash'
import { describeSqliteSourcePath, resolveSqliteSourcePath, type SqliteSourceBoundary } from './sqlite-source-boundary'
import { assertToolSucceeded, runTool } from './tool-runner'

type PythonCommand = {
  command: string
  args: string[]
  sqliteVersion?: string
}

type SqliteInspectorTable = {
  name: string
  type: string
  sql: string | null
}

type RawSqliteInspection = {
  sqliteVersion: string
  integrityCheck: string
  tables: SqliteInspectorTable[]
  rowCounts: Record<string, number>
  schemaHash: string
}

type ExpectedTablePresence = {
  durable: Record<string, boolean>
  transient: Record<string, boolean>
}

type SqliteSourceInspectionReport = {
  fileSizeBytes: number
  fileSha256: string
  integrityCheck: string
  labRelativeSourcePath: string
  rowCounts: Record<string, number>
  schemaHash: string
  sqliteVersion: string
  tables: SqliteInspectorTable[]
  expectedTables: ExpectedTablePresence
  warnings: string[]
}

type InspectSqliteSourceParams = {
  backendRoot?: string
  sourcePath: string
  sourceBoundary?: SqliteSourceBoundary
  pythonCommand?: PythonCommand
}

const durableTables = [
  'User',
  'PatreonAccount',
  'Character',
  'CharacterCard',
  'ChatSession',
  'ChatMessage',
  'RuntimeAdminSettings',
  'ChatQuotaPeriod',
  'TtsProviderUploadedVoiceAlias',
  'GameRelease',
  'NewsArticle',
  'StaticPage',
  'LandingPage',
  'LandingPageVariant',
  'LandingPageVisit',
  'RevenueEvent'
]

const transientTables = ['Session', 'ChatPendingTurn', 'UnitySessionState']

const inspectorScriptPath = resolve(__dirname, '..', 'tools', 'sqlite_inspect.py')

const resolvePythonCommand = async (): Promise<PythonCommand | null> => {
  const candidates: PythonCommand[] = [
    { command: 'python', args: [] },
    { command: 'python3', args: [] },
    { command: 'py', args: ['-3'] }
  ]

  for (const candidate of candidates) {
    const result = await runTool(candidate.command, [
      ...candidate.args,
      '-c',
      'import sqlite3; print(sqlite3.sqlite_version)'
    ])

    if (result.exitCode === 0) {
      return {
        ...candidate,
        sqliteVersion: result.stdout.trim()
      }
    }
  }

  return null
}

const buildExpectedTablePresence = (tables: SqliteInspectorTable[]): ExpectedTablePresence => {
  const tableNames = new Set(tables.map((table) => table.name))
  const buildPresence = (names: string[]) =>
    Object.fromEntries(names.map((tableName) => [tableName, tableNames.has(tableName)]))

  return {
    durable: buildPresence(durableTables),
    transient: buildPresence(transientTables)
  }
}

const inspectSqliteSource = async (params: InspectSqliteSourceParams): Promise<SqliteSourceInspectionReport> => {
  const backendRoot = params.backendRoot ?? process.cwd()
  const sourcePath = resolveSqliteSourcePath(params.sourcePath, backendRoot, params.sourceBoundary)
  const sourceStat = await stat(sourcePath)
  if (!sourceStat.isFile()) {
    throw new Error(`SQLite source is not a file: ${sourcePath}`)
  }

  if (!existsSync(inspectorScriptPath)) {
    throw new Error(`SQLite inspector helper is missing: ${inspectorScriptPath}`)
  }

  const pythonCommand = params.pythonCommand ?? (await resolvePythonCommand())
  if (!pythonCommand) {
    throw new Error('Python 3 with sqlite3 is required for SQLite source inspection.')
  }

  const result = await runTool(pythonCommand.command, [...pythonCommand.args, inspectorScriptPath, sourcePath], {
    cwd: backendRoot
  })
  assertToolSucceeded(result, 'SQLite source inspection')

  const rawInspection = JSON.parse(result.stdout) as RawSqliteInspection
  const warnings: string[] = []
  if (rawInspection.integrityCheck !== 'ok') {
    warnings.push(`SQLite integrity_check returned ${rawInspection.integrityCheck}.`)
  }

  return {
    fileSizeBytes: sourceStat.size,
    fileSha256: await calculateFileSha256(sourcePath),
    integrityCheck: rawInspection.integrityCheck,
    labRelativeSourcePath: describeSqliteSourcePath(sourcePath, backendRoot, params.sourceBoundary),
    rowCounts: rawInspection.rowCounts,
    schemaHash: rawInspection.schemaHash,
    sqliteVersion: rawInspection.sqliteVersion,
    tables: rawInspection.tables,
    expectedTables: buildExpectedTablePresence(rawInspection.tables),
    warnings
  }
}

export { inspectSqliteSource, resolvePythonCommand }
export type { PythonCommand, SqliteSourceInspectionReport }
