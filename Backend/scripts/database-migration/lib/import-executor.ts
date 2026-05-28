// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import type { PrismaClient } from '@prisma/client'
import { inspectSqliteSource } from './sqlite-source-inspector'
import { readSqliteTableRows } from './sqlite-row-source'
import {
  buildDerivedImportPlan,
  buildImportPlan,
  getMissingRequiredSourceTables,
  getUnknownSourceTables,
  type ImportPlanEntry
} from './table-import-plan'
import type { TargetRow } from './prisma-row-converter'
import { sqliteDateToUtcDate } from './value-conversion'
import type { SqliteSourceBoundary } from './sqlite-source-boundary'
import { assertTargetApplicationTablesEmpty } from './postgres-target'
import {
  buildExpectedTargetRowsByModel,
  buildImportPolicyContext,
  buildImportRowsForEntry,
  buildPendingTurnPolicySummary,
  buildTargetRowsForDerivedEntry,
  type ImportPolicyContext,
  type PendingTurnPolicySummary
} from './import-row-builder'
import { validateImportRowFingerprints, type TableFingerprintValidation } from './import-integrity-validator'

type PrismaCreateManyDelegate = {
  createMany: (args: { data: TargetRow[] }) => Promise<{ count: number }>
  count: (args?: unknown) => Promise<number>
}

type UnityLaunchContextPolicySummary = {
  sourceRows: number
  activeUnconsumedRows: number
}

type SourcePreflightSummary = {
  sourceTables: string[]
  unknownSourceTables: string[]
  missingPlannedSourceTables: string[]
  pendingTurns: Omit<PendingTurnPolicySummary, 'releaseReservationIds' | 'decisionsById'> & {
    reservationsToRelease: number
  }
  unityLaunchContexts: UnityLaunchContextPolicySummary
}

type TableImportSummary = {
  sourceTable: string
  targetModel: string
  mode: ImportPlanEntry['mode'] | 'derive'
  sourceRows: number
  importedRows: number
}

type ImportExecutionReport = {
  preflight: SourcePreflightSummary
  targetEmptyCheck: {
    checkedTables: number
  }
  importedTables: TableImportSummary[]
}

type ValidationReport = {
  expectedCounts: Record<string, number>
  actualCounts: Record<string, number>
  fingerprintValidations: TableFingerprintValidation[]
  mismatches: string[]
  transientTargetCounts: Record<string, number>
}

type SourceReadOptions = {
  sourceBoundary?: SqliteSourceBoundary
}

const batchSize = 500

const getDelegate = (prisma: PrismaClient, delegateName: string): PrismaCreateManyDelegate => {
  const delegate = (prisma as unknown as Record<string, unknown>)[delegateName] as PrismaCreateManyDelegate | undefined
  if (!delegate || typeof delegate.createMany !== 'function' || typeof delegate.count !== 'function') {
    throw new Error(`Prisma delegate is not available for ${delegateName}. Run prisma generate after schema changes.`)
  }

  return delegate
}

const createManyInBatches = async (delegate: PrismaCreateManyDelegate, rows: TargetRow[]) => {
  let importedRows = 0
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize)
    if (batch.length === 0) {
      continue
    }

    const result = await delegate.createMany({ data: batch })
    importedRows += result.count
  }

  return importedRows
}

const buildUnityLaunchContextPolicySummary = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<UnityLaunchContextPolicySummary> => {
  const rows = await readSqliteTableRows({
    sourcePath,
    tableName: 'UnityLaunchContext',
    columns: ['id', 'expiresAt', 'consumedAt'],
    sourceBoundary: options.sourceBoundary
  })
  const activeUnconsumedRows = rows.filter((row) => {
    const consumedAt = sqliteDateToUtcDate(row.consumedAt, 'UnityLaunchContext.consumedAt', { nullable: true })
    const expiresAt = sqliteDateToUtcDate(row.expiresAt, 'UnityLaunchContext.expiresAt')
    return consumedAt === null && expiresAt !== null && expiresAt.getTime() > now.getTime()
  }).length

  return {
    sourceRows: rows.length,
    activeUnconsumedRows
  }
}

const buildSourcePreflightSummary = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<SourcePreflightSummary> => {
  const inspection = await inspectSqliteSource({ sourcePath, sourceBoundary: options.sourceBoundary })
  const sourceTables = inspection.tables.filter((table) => table.type === 'table').map((table) => table.name)
  const [pendingTurns, unityLaunchContexts] = await Promise.all([
    buildPendingTurnPolicySummary(sourcePath, now, options),
    buildUnityLaunchContextPolicySummary(sourcePath, now, options)
  ])

  const summary: SourcePreflightSummary = {
    sourceTables,
    unknownSourceTables: getUnknownSourceTables(sourceTables),
    missingPlannedSourceTables: getMissingRequiredSourceTables(sourceTables),
    pendingTurns: {
      sourceRows: pendingTurns.sourceRows,
      retainedRows: pendingTurns.retainedRows,
      skippedRows: pendingTurns.skippedRows,
      convertedExpiredRows: pendingTurns.convertedExpiredRows,
      reservationsToRelease: pendingTurns.releaseReservationIds.size
    },
    unityLaunchContexts
  }

  return summary
}

const assertSourcePreflightSummary = (summary: SourcePreflightSummary) => {
  const failures: string[] = []
  if (summary.unknownSourceTables.length > 0) {
    failures.push(`unknown source tables: ${summary.unknownSourceTables.join(', ')}`)
  }
  if (summary.missingPlannedSourceTables.length > 0) {
    failures.push(`missing planned source tables: ${summary.missingPlannedSourceTables.join(', ')}`)
  }
  if (summary.unityLaunchContexts.activeUnconsumedRows > 0) {
    failures.push(`active Unity launch contexts: ${summary.unityLaunchContexts.activeUnconsumedRows}`)
  }

  if (failures.length > 0) {
    throw new Error(`PostgreSQL import preflight failed: ${failures.join('; ')}`)
  }
}

const importTable = async (
  prisma: PrismaClient,
  sourcePath: string,
  entry: ImportPlanEntry,
  context: ImportPolicyContext,
  sourceTables: ReadonlySet<string>,
  options: SourceReadOptions = {}
): Promise<TableImportSummary> => {
  const { sourceRows, targetRows } = await buildImportRowsForEntry(sourcePath, entry, context, sourceTables, options)
  const importedRows = await createManyInBatches(getDelegate(prisma, entry.delegateName), targetRows)

  return {
    sourceTable: entry.sourceTable,
    targetModel: entry.targetModel,
    mode: entry.mode,
    sourceRows,
    importedRows
  }
}

const importDerivedTables = async (
  prisma: PrismaClient,
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<TableImportSummary[]> => {
  return Promise.all(
    buildDerivedImportPlan().map(async (entry) => {
      const rows = await buildTargetRowsForDerivedEntry(sourcePath, entry, now, options)
      const importedRows = await createManyInBatches(getDelegate(prisma, entry.delegateName), rows)
      return {
        sourceTable: entry.sourceTable,
        targetModel: entry.targetModel,
        mode: entry.mode,
        sourceRows: rows.length,
        importedRows
      }
    })
  )
}

const importSqliteToPostgres = async (
  prisma: PrismaClient,
  sourcePath: string,
  now = new Date(),
  sourceBoundary?: SqliteSourceBoundary
): Promise<ImportExecutionReport> => {
  const options: SourceReadOptions = { sourceBoundary }
  const preflight = await buildSourcePreflightSummary(sourcePath, now, options)
  assertSourcePreflightSummary(preflight)
  const targetEmptyCheck = await assertTargetApplicationTablesEmpty(prisma)
  const context = await buildImportPolicyContext(sourcePath, now, options)
  const importedTables: TableImportSummary[] = []
  const sourceTables = new Set(preflight.sourceTables)

  for (const entry of buildImportPlan()) {
    importedTables.push(await importTable(prisma, sourcePath, entry, context, sourceTables, options))
  }

  importedTables.push(...(await importDerivedTables(prisma, sourcePath, now, options)))

  return {
    preflight,
    targetEmptyCheck,
    importedTables
  }
}

const countDelegateRows = async (prisma: PrismaClient, delegateName: string) => getDelegate(prisma, delegateName).count()

const validatePostgresImport = async (
  prisma: PrismaClient,
  sourcePath: string,
  now = new Date(),
  sourceBoundary?: SqliteSourceBoundary
): Promise<ValidationReport> => {
  const expectedRowsByModel = await buildExpectedTargetRowsByModel(sourcePath, now, { sourceBoundary })
  const expectedCounts = Object.fromEntries(Object.entries(expectedRowsByModel).map(([targetModel, rows]) => [targetModel, rows.length]))
  const actualCounts: Record<string, number> = {}
  const delegateEntries = [...buildImportPlan(), ...buildDerivedImportPlan()]
  for (const entry of delegateEntries) {
    actualCounts[entry.targetModel] = await countDelegateRows(prisma, entry.delegateName)
  }
  const { fingerprintValidations, mismatches } = await validateImportRowFingerprints(
    prisma,
    expectedRowsByModel,
    delegateEntries
  )

  const transientTargetCounts = {
    Session: await countDelegateRows(prisma, 'session'),
    UnityLaunchContext: await countDelegateRows(prisma, 'unityLaunchContext'),
    FailedLoginAttempt: await countDelegateRows(prisma, 'failedLoginAttempt')
  }

  for (const [modelName, count] of Object.entries(transientTargetCounts)) {
    if (count !== 0) {
      mismatches.push(`${modelName}: expected 0 transient rows, got ${count}`)
    }
  }

  return {
    expectedCounts,
    actualCounts,
    fingerprintValidations,
    mismatches,
    transientTargetCounts
  }
}

export {
  assertSourcePreflightSummary,
  buildSourcePreflightSummary,
  importSqliteToPostgres,
  validatePostgresImport
}
export type { ImportExecutionReport, SourcePreflightSummary, TableImportSummary, ValidationReport }
