// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { inspectSqliteSource } from './sqlite-source-inspector'
import { readSqliteTableRows, type SqliteRow } from './sqlite-row-source'
import {
  buildDerivedImportPlan,
  buildImportPlan,
  type DerivedImportPlanEntry,
  type ImportPlanEntry
} from './table-import-plan'
import { convertSqliteRowToPrismaCreateInput, getSourceColumnsForModel, type TargetRow } from './prisma-row-converter'
import { buildSanitizedRuntimeApiKeys, planPendingTurnImport, type PendingTurnImportDecision } from './import-policy'
import { sqliteDateToUtcDate } from './value-conversion'
import type { SqliteSourceBoundary } from './sqlite-source-boundary'

type PendingTurnPolicySummary = {
  sourceRows: number
  retainedRows: number
  skippedRows: number
  convertedExpiredRows: number
  releaseReservationIds: Set<string>
  decisionsById: Map<string, PendingTurnImportDecision>
}

type ImportPolicyContext = {
  now: Date
  pendingTurns: PendingTurnPolicySummary
}

type ImportRowsForEntry = {
  sourceRows: number
  targetRows: TargetRow[]
}

type SourceReadOptions = {
  sourceBoundary?: SqliteSourceBoundary
}

const hoursPerDay = 24

const readRowsForModel = async (sourcePath: string, entry: ImportPlanEntry, options: SourceReadOptions = {}) => {
  return readSqliteTableRows({
    sourcePath,
    tableName: entry.sourceTable,
    columns: getSourceColumnsForModel(entry.targetModel),
    sourceBoundary: options.sourceBoundary
  })
}

const buildPendingTurnPolicySummary = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<PendingTurnPolicySummary> => {
  const rows = await readSqliteTableRows({
    sourcePath,
    tableName: 'ChatPendingTurn',
    columns: ['id', 'reservationId', 'status', 'expiresAt', 'updatedAt', 'committedAt', 'abortedAt', 'expiredAt'],
    sourceBoundary: options.sourceBoundary
  })
  const releaseReservationIds = new Set<string>()
  const decisionsById = new Map<string, PendingTurnImportDecision>()
  let skippedRows = 0
  let convertedExpiredRows = 0
  let retainedRows = 0

  for (const row of rows) {
    const id = String(row.id)
    const decision = planPendingTurnImport(row, { now })
    decisionsById.set(id, decision)
    if (decision.action === 'skip') {
      skippedRows += 1
      continue
    }

    retainedRows += 1
    if (decision.targetStatus === 'EXPIRED' && row.status === 'PENDING') {
      convertedExpiredRows += 1
    }

    if (decision.releaseReservation) {
      releaseReservationIds.add(String(row.reservationId))
    }
  }

  return {
    sourceRows: rows.length,
    retainedRows,
    skippedRows,
    convertedExpiredRows,
    releaseReservationIds,
    decisionsById
  }
}

const buildImportPolicyContext = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<ImportPolicyContext> => ({
  now,
  pendingTurns: await buildPendingTurnPolicySummary(sourcePath, now, options)
})

const transformChatPendingTurnRow = (row: SqliteRow, context: ImportPolicyContext): SqliteRow | null => {
  const decision = context.pendingTurns.decisionsById.get(String(row.id))
  if (!decision) {
    throw new Error(`Missing ChatPendingTurn import decision for row ${String(row.id)}.`)
  }

  if (decision.action === 'skip') {
    return null
  }

  const transformedRow: SqliteRow = { ...row, status: decision.targetStatus }
  if (decision.releaseReservation) {
    transformedRow.expiredAt = decision.terminalAt.toISOString()
    transformedRow.updatedAt = context.now.toISOString()
  }

  return transformedRow
}

const transformChatQuotaReservationRow = (row: SqliteRow, context: ImportPolicyContext): SqliteRow => {
  if (!context.pendingTurns.releaseReservationIds.has(String(row.id)) || row.status !== 'RESERVED') {
    return row
  }

  return {
    ...row,
    status: 'RELEASED',
    releasedAt: context.now.toISOString(),
    updatedAt: context.now.toISOString(),
    errorReason: row.errorReason ?? 'migration_expired_pending_turn'
  }
}

const transformRuntimeAdminSettingsRow = (row: SqliteRow): SqliteRow => {
  const sourceApiKeys =
    typeof row.apiKeysJson === 'string' && row.apiKeysJson.trim()
      ? (JSON.parse(row.apiKeysJson) as Record<string, unknown>)
      : {}

  return {
    ...row,
    apiKeysJson: JSON.stringify(buildSanitizedRuntimeApiKeys(sourceApiKeys))
  }
}

const transformPreviewRefreshJobRow = (row: SqliteRow, context: ImportPolicyContext): SqliteRow => {
  if (row.status !== 'PROCESSING') {
    return row
  }

  return {
    ...row,
    status: 'PENDING',
    nextAttemptAt: context.now.toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: context.now.toISOString()
  }
}

const transformMarketingEmailAutomationRow = (row: SqliteRow): SqliteRow => {
  if (row.triggerDelayHours !== null && row.triggerDelayHours !== undefined) {
    return row
  }

  const triggerDelayDays = Number(row.triggerDelayDays ?? 0)
  if (!Number.isFinite(triggerDelayDays)) {
    throw new Error('MarketingEmailAutomation.triggerDelayDays must be numeric when triggerDelayHours is absent.')
  }

  return {
    ...row,
    triggerDelayHours: triggerDelayDays * hoursPerDay
  }
}

const transformSourceRow = (entry: ImportPlanEntry, row: SqliteRow, context: ImportPolicyContext): SqliteRow | null => {
  switch (entry.sourceTable) {
    case 'ChatPendingTurn':
      return transformChatPendingTurnRow(row, context)
    case 'ChatQuotaReservation':
      return transformChatQuotaReservationRow(row, context)
    case 'RuntimeAdminSettings':
      return transformRuntimeAdminSettingsRow(row)
    case 'ChatSessionPreviewRefreshJob':
      return transformPreviewRefreshJobRow(row, context)
    case 'MarketingEmailAutomation':
      return transformMarketingEmailAutomationRow(row)
    default:
      return row
  }
}

const buildImportRowsForEntry = async (
  sourcePath: string,
  entry: ImportPlanEntry,
  context: ImportPolicyContext,
  sourceTables: ReadonlySet<string>,
  options: SourceReadOptions = {}
): Promise<ImportRowsForEntry> => {
  if (entry.optional && !sourceTables.has(entry.sourceTable)) {
    return {
      sourceRows: 0,
      targetRows: []
    }
  }

  const rows = await readRowsForModel(sourcePath, entry, options)
  const targetRows = rows
    .map((row) => transformSourceRow(entry, row, context))
    .filter((row): row is SqliteRow => row !== null)
    .map((row) => convertSqliteRowToPrismaCreateInput(entry.targetModel, row))

  return {
    sourceRows: rows.length,
    targetRows
  }
}

const buildTargetRowsForImportEntry = async (
  sourcePath: string,
  entry: ImportPlanEntry,
  context: ImportPolicyContext,
  sourceTables: ReadonlySet<string>,
  options: SourceReadOptions = {}
) => (await buildImportRowsForEntry(sourcePath, entry, context, sourceTables, options)).targetRows

const buildUserActivityRows = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<TargetRow[]> => {
  const rows = await readSqliteTableRows({
    sourcePath,
    tableName: 'Session',
    columns: ['userId', 'lastSeenAt'],
    sourceBoundary: options.sourceBoundary
  })
  const latestByUserId = new Map<string, Date>()
  for (const row of rows) {
    const lastSeenAt = sqliteDateToUtcDate(row.lastSeenAt, 'Session.lastSeenAt', { nullable: true })
    if (!lastSeenAt) {
      continue
    }

    const userId = String(row.userId)
    const existing = latestByUserId.get(userId)
    if (!existing || lastSeenAt.getTime() > existing.getTime()) {
      latestByUserId.set(userId, lastSeenAt)
    }
  }

  return [...latestByUserId.entries()].map(([userId, lastSeenAt]) => ({
    userId,
    lastSeenAt,
    createdAt: now,
    updatedAt: now
  }))
}

const buildTargetRowsForDerivedEntry = async (
  sourcePath: string,
  entry: DerivedImportPlanEntry,
  now: Date,
  options: SourceReadOptions = {}
) => {
  if (entry.targetModel !== 'UserActivityState') {
    throw new Error(`Unsupported derived import target: ${entry.targetModel}`)
  }

  return buildUserActivityRows(sourcePath, now, options)
}

const buildExpectedTargetRowsByModel = async (
  sourcePath: string,
  now: Date,
  options: SourceReadOptions = {}
): Promise<Record<string, TargetRow[]>> => {
  const inspection = await inspectSqliteSource({ sourcePath, sourceBoundary: options.sourceBoundary })
  const sourceTables = new Set(inspection.tables.filter((table) => table.type === 'table').map((table) => table.name))
  const context = await buildImportPolicyContext(sourcePath, now, options)
  const rowsByModel: Record<string, TargetRow[]> = {}

  for (const entry of buildImportPlan()) {
    rowsByModel[entry.targetModel] = await buildTargetRowsForImportEntry(sourcePath, entry, context, sourceTables, options)
  }

  for (const entry of buildDerivedImportPlan()) {
    rowsByModel[entry.targetModel] = await buildTargetRowsForDerivedEntry(sourcePath, entry, now, options)
  }

  return rowsByModel
}

export {
  buildExpectedTargetRowsByModel,
  buildImportPolicyContext,
  buildImportRowsForEntry,
  buildPendingTurnPolicySummary,
  buildTargetRowsForDerivedEntry,
  buildTargetRowsForImportEntry,
  buildUserActivityRows
}
export type { ImportPolicyContext, ImportRowsForEntry, PendingTurnPolicySummary }
