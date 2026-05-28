// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { sqliteDateToUtcDate } from './value-conversion'

type PendingTurnSourceRow = {
  id?: unknown
  reservationId?: unknown
  status?: unknown
  expiresAt?: unknown
  updatedAt?: unknown
  committedAt?: unknown
  abortedAt?: unknown
  expiredAt?: unknown
}

type PendingTurnImportOptions = {
  now?: Date
  terminalRetentionHours?: number
}

type PendingTurnImportDecision =
  | {
      action: 'retain'
      targetStatus: 'COMMITTED' | 'ABORTED' | 'EXPIRED'
      releaseReservation: boolean
      terminalAt: Date
    }
  | {
      action: 'skip'
      reason: 'terminal_retention_elapsed'
      releaseReservation: false
      terminalAt: Date
    }

type SanitizedRuntimeApiKeys = {
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  patreonClientId: string
  patreonClientSecret: string
  patreonRedirectUri: string
  emailProvider: string
  smtpHost: string
  smtpPort: number | null
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  mailgunDomain: string
  mailgunApiKey: string
  mailgunRegion: string
}

const transientOrLegacyExcludedTables = new Set([
  'Session',
  'CharacterCard',
  'UnityLaunchContext',
  'FailedLoginAttempt',
  'CharacterChatDailyMetric',
  'CharacterChatStartLedger'
])

const terminalPendingTurnStatuses = new Set(['COMMITTED', 'ABORTED', 'EXPIRED'])
const defaultTerminalRetentionHours = 24

const normalizeString = (value: unknown, fieldPath: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required string for ${fieldPath}.`)
  }

  return value.trim()
}

const maxDate = (...dates: Array<Date | null>) => {
  const presentDates = dates.filter((date): date is Date => date !== null)
  return presentDates.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest))
}

const getTerminalDateForRow = (row: PendingTurnSourceRow, targetStatus: string, fallbackDate: Date) => {
  if (targetStatus === 'COMMITTED') {
    return sqliteDateToUtcDate(row.committedAt ?? row.updatedAt, 'ChatPendingTurn.committedAt', { nullable: true }) ?? fallbackDate
  }

  if (targetStatus === 'ABORTED') {
    return sqliteDateToUtcDate(row.abortedAt ?? row.updatedAt, 'ChatPendingTurn.abortedAt', { nullable: true }) ?? fallbackDate
  }

  return sqliteDateToUtcDate(row.expiredAt ?? row.expiresAt, 'ChatPendingTurn.expiredAt', { nullable: true }) ?? fallbackDate
}

const planPendingTurnImport = (
  row: PendingTurnSourceRow,
  options: PendingTurnImportOptions = {}
): PendingTurnImportDecision => {
  const now = options.now ?? new Date()
  const retentionMs = (options.terminalRetentionHours ?? defaultTerminalRetentionHours) * 60 * 60 * 1000
  const status = normalizeString(row.status, 'ChatPendingTurn.status')
  const expiresAt = sqliteDateToUtcDate(row.expiresAt, 'ChatPendingTurn.expiresAt')
  if (!expiresAt) {
    throw new Error('ChatPendingTurn.expiresAt is required.')
  }

  if (status === 'PENDING') {
    if (expiresAt.getTime() > now.getTime()) {
      throw new Error(`Active pending turn ${String(row.id ?? '(unknown)')} blocks PostgreSQL cutover.`)
    }

    return {
      action: 'retain',
      targetStatus: 'EXPIRED',
      releaseReservation: true,
      terminalAt: maxDate(expiresAt, sqliteDateToUtcDate(row.updatedAt, 'ChatPendingTurn.updatedAt', { nullable: true }))
    }
  }

  if (!terminalPendingTurnStatuses.has(status)) {
    throw new Error(`Unsupported ChatPendingTurn.status during import: ${status}`)
  }

  const terminalAt = getTerminalDateForRow(row, status, expiresAt)
  if (now.getTime() - terminalAt.getTime() > retentionMs) {
    return {
      action: 'skip',
      reason: 'terminal_retention_elapsed',
      releaseReservation: false,
      terminalAt
    }
  }

  return {
    action: 'retain',
    targetStatus: status as 'COMMITTED' | 'ABORTED' | 'EXPIRED',
    releaseReservation: false,
    terminalAt
  }
}

const shouldExcludeSourceTable = (tableName: string) => transientOrLegacyExcludedTables.has(tableName)

const buildSanitizedRuntimeApiKeys = (source: Record<string, unknown> = {}): SanitizedRuntimeApiKeys => ({
  googleClientId: '',
  googleClientSecret: '',
  googleRedirectUri: '',
  patreonClientId: '',
  patreonClientSecret: '',
  patreonRedirectUri: '',
  emailProvider: typeof source.emailProvider === 'string' ? source.emailProvider : 'smtp',
  smtpHost: '',
  smtpPort: typeof source.smtpPort === 'number' ? source.smtpPort : null,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailgunDomain: '',
  mailgunApiKey: '',
  mailgunRegion: typeof source.mailgunRegion === 'string' ? source.mailgunRegion : ''
})

export {
  buildSanitizedRuntimeApiKeys,
  planPendingTurnImport,
  shouldExcludeSourceTable,
  transientOrLegacyExcludedTables
}
export type { PendingTurnImportDecision, PendingTurnImportOptions, PendingTurnSourceRow, SanitizedRuntimeApiKeys }
