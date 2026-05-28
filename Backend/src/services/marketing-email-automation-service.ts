import { randomUUID } from 'node:crypto'
import { getEmailConfig } from '../lib/auth-config'
import {
  runObservedBackgroundWork as defaultRunObservedBackgroundWork,
  type ObservedBackgroundWorkRunner
} from '../lib/background-work-monitor'
import {
  classifyPrismaDatabasePressureError,
  getPrismaErrorCode
} from '../lib/prisma-database-pressure'
import { prisma } from '../lib/prisma'
import { postgresJsonbValue, postgresTimestamptzValue } from '../lib/database/postgres-sql'
import { reportPrismaEngineFatalError } from '../lib/prisma-engine-fatal-reporter'
import { emailService, type EmailService } from './email-service'
import {
  buildActivePatreonEntitlementRelationQuery,
  hasPlayablePaidEntitlement
} from './membership/active-patreon-entitlement-projection'
import { buildMarketingEmailAutomationEligibleUserIdsQuery } from './marketing-email-automation-eligibility-query'
import type { MarketingAutomationStatusCondition } from './marketing-email-automation-status-condition'
import {
  createEmailSendLog as defaultCreateEmailSendLog,
  getEmailTemplateByKey as defaultGetEmailTemplateByKey,
  getRenderedEmailTemplateByKey as defaultGetRenderedEmailTemplateByKey,
  type EmailTemplateRecord
} from './email-template-service'

const MS_PER_HOUR = 60 * 60 * 1000
const HOURS_PER_DAY = 24
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR
const DEFAULT_SEND_INTERVAL_SECONDS = 60
const DEFAULT_WORKER_BATCH_SIZE = 5
const DEFAULT_WORKER_ENQUEUE_BATCH_SIZE = 100
const DEFAULT_WORKER_INTERVAL_MS = 60_000
const MARKETING_EMAIL_RECIPIENT_LEASE_MS = 2 * 60_000
const MAX_AUTOMATION_RECIPIENTS = 20_000
const MAX_SEND_ATTEMPTS = 3
const MAX_ACTIVE_AUTOMATIONS_PER_TICK = 20

type MarketingEmailAutomationStatus = 'active' | 'paused' | 'completed'
type MarketingEmailRecipientStatus = 'queued' | 'sending' | 'sent' | 'failed'

type MarketingEmailAutomationStats = {
  totalRecipients: number
  queued: number
  sending: number
  sent: number
  failed: number
}

type MarketingEmailAutomationBaseRecord = {
  id: string
  templateKey: string
  status: MarketingEmailAutomationStatus
  statusCondition: MarketingAutomationStatusCondition
  triggerDelayHours: number
  triggerDelayDays: number
  campaignDiscountCode: string
  campaignFeaturesSummary: string
  campaignCtaUrl: string
  sendIntervalSeconds: number
  maxRecipients: number
  createdAt: string | Date
  updatedAt: string | Date
  startedAt: string | Date | null
  pausedAt: string | Date | null
}

type MarketingEmailAutomationRecord = MarketingEmailAutomationBaseRecord & {
  templateName: string | null
  stats: MarketingEmailAutomationStats
}

type CreateMarketingEmailAutomationInput = {
  templateKey: string
  statusCondition: MarketingAutomationStatusCondition
  triggerDelayHours?: number
  triggerDelayDays?: number
  campaignDiscountCode?: string
  campaignFeaturesSummary: string
  campaignCtaUrl: string
  sendIntervalSeconds?: number
  maxRecipients?: number
}

type MarketingEmailTemplateLookup = (templateKey: string) => Promise<Pick<EmailTemplateRecord, 'templateKey' | 'name'> | null>
type MarketingEmailTemplateRenderer = (
  templateKey: string,
  variables: Record<string, string>
) => Promise<{
  rendered: {
    subject: string
    text: string
    html: string
  }
}>
type MarketingEmailSender = Pick<EmailService, 'sendEmailMessage'>

type ProcessMarketingEmailAutomationOptions = {
  batchSize?: number
  enqueueBatchSize?: number
  now?: Date
  leaseOwner?: string
  mailer?: MarketingEmailSender
  store?: MarketingEmailAutomationStore
  runObservedBackgroundWork?: ObservedBackgroundWorkRunner
  logger?: Pick<Console, 'error' | 'warn'>
  getRenderedEmailTemplateByKey?: MarketingEmailTemplateRenderer
  createEmailSendLog?: typeof defaultCreateEmailSendLog
  fatalReporter?: typeof reportPrismaEngineFatalError
}

type CreateMarketingEmailAutomationDependencies = {
  store?: MarketingEmailAutomationStore
  getEmailTemplateByKey?: MarketingEmailTemplateLookup
}

type ProcessMarketingEmailAutomationResult = {
  activeAutomations: number
  eligibleCandidates: number
  enqueued: number
  queueInsertSkipped: number
  attempted: number
  claimed: number
  sent: number
  retryScheduled: number
  failed: number
  skipped: number
}

type ProcessMarketingEmailAutomationBackgroundResult = ProcessMarketingEmailAutomationResult

type CreateMarketingEmailAutomationResult = {
  automation: MarketingEmailAutomationRecord
  enqueueResult: {
    eligible: number
    queued: number
    deferred: true
  }
}

type MarketingEmailAutomationUser = {
  id: string
  email: string
  username: string
  isEmailVerified: boolean
  createdAt: Date
  patreonActiveAt: Date | null
  activityState: {
    lastSeenAt: Date | null
  } | null
  entitlementGrants: Array<{
    tierCode: string
    updatedAt: Date
  }>
  revenueEvents: Array<{
    amountCents: number
    chargedAt: Date
  }>
  _count: {
    chatSessions: number
  }
}

type MarketingEmailRecipientCandidate = {
  id: string
  email: string
  username: string
  daysSinceSignup: number
  daysSinceLastSeen: number | null
  chatSessionsCount: number
  purchaseCount: number
  totalRevenueCents: number
  lastPurchaseAt: string | null
}

type MarketingEmailAutomationRow = {
  id: string
  templateKey: string
  status: string
  statusCondition: string
  triggerDelayHours: number | null
  triggerDelayDays: number
  campaignDiscountCode: string | null
  campaignFeaturesSummary: string
  campaignCtaUrl: string
  sendIntervalSeconds: number
  maxRecipients: number
  createdAt: string
  updatedAt: string
  startedAt: string | null
  pausedAt: string | null
}

type MarketingEmailRecipientRow = {
  id: string
  automationId: string
  templateKey: string
  recipientUserId: string
  recipientEmail: string
  variablesJson: string
  status: MarketingEmailRecipientStatus
  attemptCount: number
  nextAttemptAt: string | Date
  subject: string | null
  lastError: string | null
  createdAt: string | Date
  updatedAt: string | Date
  sentAt: string | Date | null
  claimedAt: string | Date | null
  leaseOwner: string | null
  leaseExpiresAt: string | Date | null
}

type EnqueueRecipientInput = {
  automation: MarketingEmailAutomationBaseRecord
  user: MarketingEmailRecipientCandidate
  variablesJson: string
  nextAttemptAt: string
  nowIso: string
}

type ClaimRecipientInput = {
  recipientId: string
  nowIso: string
  leaseOwner: string
  leaseExpiresAt: string
}

type MarkRecipientSentInput = {
  recipientId: string
  subject: string
  sentAt: string
}

type MarkRecipientFailedInput = {
  recipientId: string
  status: Extract<MarketingEmailRecipientStatus, 'queued' | 'failed'>
  nextAttemptAt: string
  lastError: string
  updatedAt: string
}

type UpdateAutomationStatusInput = {
  automationId: string
  status: Exclude<MarketingEmailAutomationStatus, 'completed'>
  updatedAt: string
  pausedAt: string | null
}

/**
 * Minimal persistence boundary for automation queue orchestration.
 *
 * Implementations must keep methods bounded. The current Prisma store uses
 * PostgreSQL SQL to avoid full-table work in the background worker, while
 * tests provide an in-memory store so delivery policy remains independently
 * verifiable.
 */
interface MarketingEmailAutomationStore {
  insertAutomation(row: MarketingEmailAutomationBaseRecord): Promise<void>
  updateAutomationStatus(input: UpdateAutomationStatusInput): Promise<void>
  getAutomationById(id: string): Promise<MarketingEmailAutomationBaseRecord | null>
  listAutomationRows(limit?: number): Promise<MarketingEmailAutomationBaseRecord[]>
  loadAutomationStats(automationIds: string[]): Promise<Map<string, MarketingEmailAutomationStats>>
  listActiveAutomations(limit: number): Promise<MarketingEmailAutomationBaseRecord[]>
  listEligibleUsers(input: {
    automation: MarketingEmailAutomationBaseRecord
    now: Date
    limit: number
  }): Promise<MarketingEmailRecipientCandidate[]>
  enqueueRecipient(input: EnqueueRecipientInput): Promise<boolean>
  listDueRecipients(input: {
    nowIso: string
    batchSize: number
  }): Promise<MarketingEmailRecipientRow[]>
  claimRecipient(input: ClaimRecipientInput): Promise<MarketingEmailRecipientRow | null>
  markRecipientSent(input: MarkRecipientSentInput): Promise<void>
  markRecipientFailed(input: MarkRecipientFailedInput): Promise<void>
}

const clampNumber = (value: number | undefined, fallback: number, min: number, max: number) => {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.round(value as number)))
}

const getElapsedDays = (from: Date, to: Date) => Math.floor(Math.max(0, to.getTime() - from.getTime()) / MS_PER_DAY)

const getElapsedHours = (from: Date, to: Date) => Math.floor(Math.max(0, to.getTime() - from.getTime()) / MS_PER_HOUR)

const toIsoOrNull = (value: Date | null | undefined) => (value ? value.toISOString() : null)

const parsePositiveIntEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseFromAddressToEmail = (value: string) => {
  const angleMatch = /<([^>]+)>/.exec(value)

  if (angleMatch?.[1]) {
    return angleMatch[1].trim()
  }

  return value.trim()
}

const getBaseTemplateVariables = () => {
  const frontendUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:7000'
  const emailConfig = getEmailConfig()

  return {
    app_name: 'SecretWaifu',
    members_url: `${frontendUrl}/members`,
    login_url: `${frontendUrl}/sign-up`,
    cta_url: `${frontendUrl}/members`,
    support_email: parseFromAddressToEmail(emailConfig.from),
    discount_code: '',
    features_summary: 'New features, more content, and easier ways to jump back in are ready for you.',
    verification_code: '',
    verification_url: '',
    reset_code: '',
    reset_url: '',
    expires_at: '',
    username: 'there',
    email: '',
    days_since_signup: '',
    days_since_last_seen: '',
    chat_sessions_count: '',
    purchase_count: '',
    total_revenue_eur: '',
    last_purchase_date: ''
  }
}

const buildUserTemplateVariables = (
  record: MarketingEmailRecipientCandidate,
  extraVariables: Record<string, string> = {}
) => {
  const lastPurchaseDate = record.lastPurchaseAt ? new Date(record.lastPurchaseAt).toLocaleDateString() : ''

  return {
    ...getBaseTemplateVariables(),
    username: record.username,
    email: record.email,
    days_since_signup: String(record.daysSinceSignup),
    days_since_last_seen: record.daysSinceLastSeen === null ? '' : String(record.daysSinceLastSeen),
    chat_sessions_count: String(record.chatSessionsCount),
    purchase_count: String(record.purchaseCount),
    total_revenue_eur: (record.totalRevenueCents / 100).toFixed(2),
    last_purchase_date: lastPurchaseDate,
    ...extraVariables
  }
}

const createEmptyProcessingResult = (): ProcessMarketingEmailAutomationResult => ({
  activeAutomations: 0,
  eligibleCandidates: 0,
  enqueued: 0,
  queueInsertSkipped: 0,
  attempted: 0,
  claimed: 0,
  sent: 0,
  retryScheduled: 0,
  failed: 0,
  skipped: 0
})

const normalizeAutomationRow = (row: MarketingEmailAutomationRow): MarketingEmailAutomationBaseRecord => ({
  id: row.id,
  templateKey: row.templateKey,
  status: row.status as MarketingEmailAutomationStatus,
  statusCondition: row.statusCondition as MarketingAutomationStatusCondition,
  triggerDelayHours: Number(row.triggerDelayHours ?? row.triggerDelayDays * HOURS_PER_DAY),
  triggerDelayDays: Number(row.triggerDelayDays),
  campaignDiscountCode: row.campaignDiscountCode ?? '',
  campaignFeaturesSummary: row.campaignFeaturesSummary,
  campaignCtaUrl: row.campaignCtaUrl,
  sendIntervalSeconds: Number(row.sendIntervalSeconds),
  maxRecipients: Number(row.maxRecipients),
  createdAt: toIsoString(row.createdAt),
  updatedAt: toIsoString(row.updatedAt),
  startedAt: toIsoStringOrNull(row.startedAt),
  pausedAt: toIsoStringOrNull(row.pausedAt)
})

const toIsoString = (value: string | Date) => (value instanceof Date ? value.toISOString() : value)
const toIsoStringOrNull = (value: string | Date | null) => (value instanceof Date ? value.toISOString() : value)

const toAutomationUserRecord = (user: MarketingEmailAutomationUser, now: Date) => {
  const lastSeenAt = user.activityState?.lastSeenAt ?? null
  const purchaseCount = user.revenueEvents.length
  const totalRevenueCents = user.revenueEvents.reduce((sum, revenueEvent) => sum + revenueEvent.amountCents, 0)
  const lastPurchaseAt = user.revenueEvents[0]?.chargedAt ?? null
  const hasActivePaidMembership = resolveMarketingAutomationActivePaidMembership(user)

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    patreonActiveAt: user.patreonActiveAt,
    lastSeenAt,
    daysSinceSignup: getElapsedDays(user.createdAt, now),
    daysSinceLastSeen: lastSeenAt ? getElapsedDays(lastSeenAt, now) : null,
    chatSessionsCount: user._count.chatSessions,
    purchaseCount,
    totalRevenueCents,
    hasActivePaidMembership,
    lastPurchaseAt: toIsoOrNull(lastPurchaseAt)
  }
}

const getConditionAgeHours = (
  record: ReturnType<typeof toAutomationUserRecord>,
  condition: MarketingAutomationStatusCondition,
  now: Date
) => {
  if (condition === 'active_subscription') {
    return record.patreonActiveAt ? getElapsedHours(record.patreonActiveAt, now) : 0
  }

  if (condition === 'canceled_subscription' && record.lastPurchaseAt) {
    return getElapsedHours(new Date(record.lastPurchaseAt), now)
  }

  if (condition === 'engaged_no_subscription' && record.lastSeenAt) {
    return getElapsedHours(record.lastSeenAt, now)
  }

  return getElapsedHours(record.createdAt, now)
}

const matchesAutomationCondition = (
  record: ReturnType<typeof toAutomationUserRecord>,
  condition: MarketingAutomationStatusCondition,
  triggerDelayHours: number,
  now: Date
) => {
  const ageHours = getConditionAgeHours(record, condition, now)

  if (ageHours < triggerDelayHours) {
    return false
  }

  if (condition === 'email_unverified') {
    return !record.isEmailVerified
  }

  if (condition === 'verified_no_subscription') {
    return record.isEmailVerified && record.purchaseCount === 0
  }

  if (condition === 'engaged_no_subscription') {
    return record.isEmailVerified && record.purchaseCount === 0 && (record.chatSessionsCount > 0 || record.daysSinceLastSeen !== null)
  }

  if (condition === 'active_subscription') {
    return record.isEmailVerified && record.hasActivePaidMembership
  }

  if (condition === 'canceled_subscription') {
    return record.isEmailVerified && record.purchaseCount > 0 && !record.hasActivePaidMembership
  }

  return record.isEmailVerified
}

const getDefaultStats = (): MarketingEmailAutomationStats => ({
  totalRecipients: 0,
  queued: 0,
  sending: 0,
  sent: 0,
  failed: 0
})

const sanitizeMarketingAutomationError = (error: unknown) => {
  const pressureReason = classifyPrismaDatabasePressureError(error)
  if (pressureReason) {
    return `prisma_${pressureReason}`
  }

  const prismaCode = getPrismaErrorCode(error)
  if (prismaCode) {
    return `prisma_${prismaCode}`
  }

  return error instanceof Error && error.name.trim().length > 0 ? error.name : 'unknown_error'
}

const createLeaseOwner = () => `marketing-email-automation-${process.pid}-${randomUUID()}`

const calculateRetryDelayMs = (attemptCount: number) => Math.min(60 * 60 * 1000, 5 * 60 * 1000 * Math.max(1, attemptCount))

const resolveTriggerDelayHours = (input: Pick<CreateMarketingEmailAutomationInput, 'triggerDelayHours' | 'triggerDelayDays'>) => {
  return input.triggerDelayHours ?? (input.triggerDelayDays ?? 0) * HOURS_PER_DAY
}

const toTriggerDelayDays = (triggerDelayHours: number) => Math.floor(Math.max(0, triggerDelayHours) / HOURS_PER_DAY)

const toThresholdIso = (now: Date, delayHours: number) => new Date(now.getTime() - Math.max(0, delayHours) * MS_PER_HOUR).toISOString()

const buildMarketingEmailRecipientVariablesJsonSql = (variablesJson: string) => postgresJsonbValue(variablesJson)
const buildMarketingEmailTimestampSql = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

const resolveMarketingAutomationActivePaidMembership = (user: {
  entitlementGrants?: Array<{ tierCode: string | null | undefined }>
}) => hasPlayablePaidEntitlement(user.entitlementGrants ?? [])

/**
 * Raw-SQL store for the Prisma-owned marketing automation tables.
 *
 * The service owns queue policy and delivery semantics; this store owns bounded
 * candidate selection. Keeping this boundary explicit lets tests exercise queue
 * behavior without opening a real database connection or SMTP transport.
 */
class PrismaMarketingEmailAutomationStore implements MarketingEmailAutomationStore {
  async insertAutomation(row: MarketingEmailAutomationBaseRecord) {
    await prisma.$executeRaw`
      INSERT INTO "MarketingEmailAutomation"
        ("id", "templateKey", "status", "statusCondition", "triggerDelayHours", "triggerDelayDays", "campaignDiscountCode", "campaignFeaturesSummary", "campaignCtaUrl",
          "sendIntervalSeconds", "maxRecipients", "createdAt", "updatedAt", "startedAt", "pausedAt")
      VALUES
        (${row.id}, ${row.templateKey}, ${row.status}, ${row.statusCondition}, ${row.triggerDelayHours}, ${row.triggerDelayDays},
          ${row.campaignDiscountCode}, ${row.campaignFeaturesSummary}, ${row.campaignCtaUrl},
          ${row.sendIntervalSeconds}, ${row.maxRecipients}, ${buildMarketingEmailTimestampSql(row.createdAt)}, ${buildMarketingEmailTimestampSql(row.updatedAt)}, ${buildMarketingEmailTimestampSql(row.startedAt)}, ${buildMarketingEmailTimestampSql(row.pausedAt)})
    `
  }

  async updateAutomationStatus(input: UpdateAutomationStatusInput) {
    await prisma.$executeRaw`
      UPDATE "MarketingEmailAutomation"
      SET "status" = ${input.status}, "updatedAt" = ${buildMarketingEmailTimestampSql(input.updatedAt)}, "pausedAt" = ${buildMarketingEmailTimestampSql(input.pausedAt)}
      WHERE "id" = ${input.automationId}
    `
  }

  async getAutomationById(id: string) {
    const rows = await prisma.$queryRaw<MarketingEmailAutomationRow[]>`
      SELECT "id", "templateKey", "status", "statusCondition", "triggerDelayHours", "triggerDelayDays", "campaignDiscountCode", "campaignFeaturesSummary", "campaignCtaUrl",
        "sendIntervalSeconds", "maxRecipients", "createdAt", "updatedAt", "startedAt", "pausedAt"
      FROM "MarketingEmailAutomation"
      WHERE "id" = ${id}
      LIMIT 1
    `

    return rows[0] ? normalizeAutomationRow(rows[0]) : null
  }

  async listAutomationRows(limit = 50) {
    const rows = await prisma.$queryRaw<MarketingEmailAutomationRow[]>`
      SELECT "id", "templateKey", "status", "statusCondition", "triggerDelayHours", "triggerDelayDays", "campaignDiscountCode", "campaignFeaturesSummary", "campaignCtaUrl",
        "sendIntervalSeconds", "maxRecipients", "createdAt", "updatedAt", "startedAt", "pausedAt"
      FROM "MarketingEmailAutomation"
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `

    return rows.map(normalizeAutomationRow)
  }

  async loadAutomationStats(automationIds: string[]) {
    const stats = new Map<string, MarketingEmailAutomationStats>()

    for (const automationId of automationIds) {
      const rows = await prisma.$queryRaw<Array<{ status: string; count: bigint | number }>>`
        SELECT "status", COUNT(*) AS count
        FROM "MarketingEmailAutomationRecipient"
        WHERE "automationId" = ${automationId}
        GROUP BY "status"
      `
      const summary = getDefaultStats()

      for (const row of rows) {
        const count = Number(row.count)
        summary.totalRecipients += count
        if (row.status === 'queued') {
          summary.queued = count
        } else if (row.status === 'sending') {
          summary.sending = count
        } else if (row.status === 'sent') {
          summary.sent = count
        } else if (row.status === 'failed') {
          summary.failed = count
        }
      }

      stats.set(automationId, summary)
    }

    return stats
  }

  async listActiveAutomations(limit: number) {
    const rows = await prisma.$queryRaw<MarketingEmailAutomationRow[]>`
      SELECT "id", "templateKey", "status", "statusCondition", "triggerDelayHours", "triggerDelayDays", "campaignDiscountCode", "campaignFeaturesSummary", "campaignCtaUrl",
        "sendIntervalSeconds", "maxRecipients", "createdAt", "updatedAt", "startedAt", "pausedAt"
      FROM "MarketingEmailAutomation"
      WHERE "status" = 'active'
      ORDER BY "createdAt" ASC
      LIMIT ${limit}
    `

    return rows.map(normalizeAutomationRow)
  }

  async listEligibleUsers(input: {
    automation: MarketingEmailAutomationBaseRecord
    now: Date
    limit: number
  }) {
    if (input.limit <= 0) {
      return []
    }

    const candidateIds = await this.listEligibleUserIds(input)
    if (candidateIds.length === 0) {
      return []
    }

    const users = await prisma.user.findMany({
      where: {
        id: {
          in: candidateIds
        }
      },
      select: {
        id: true,
        email: true,
        username: true,
        isEmailVerified: true,
        createdAt: true,
        patreonActiveAt: true,
        activityState: {
          select: {
            lastSeenAt: true
          }
        },
        entitlementGrants: buildActivePatreonEntitlementRelationQuery(input.now, {
          take: 1
        }),
        revenueEvents: {
          orderBy: {
            chargedAt: 'desc'
          },
          select: {
            amountCents: true,
            chargedAt: true
          }
        },
        _count: {
          select: {
            chatSessions: true
          }
        }
      }
    }) as MarketingEmailAutomationUser[]

    const order = new Map(candidateIds.map((id, index) => [id, index]))

    return users
      .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))
      .map((user) => toAutomationUserRecord(user, input.now))
      .filter((record) =>
        matchesAutomationCondition(record, input.automation.statusCondition, input.automation.triggerDelayHours, input.now)
      )
      .map((record) => ({
        id: record.id,
        email: record.email,
        username: record.username,
        daysSinceSignup: record.daysSinceSignup,
        daysSinceLastSeen: record.daysSinceLastSeen,
        chatSessionsCount: record.chatSessionsCount,
        purchaseCount: record.purchaseCount,
        totalRevenueCents: record.totalRevenueCents,
        lastPurchaseAt: record.lastPurchaseAt
      }))
      .slice(0, input.limit)
  }

  private async listEligibleUserIds(input: {
    automation: MarketingEmailAutomationBaseRecord
    now: Date
    limit: number
  }) {
    const thresholdIso = toThresholdIso(input.now, input.automation.triggerDelayHours)
    const nowIso = input.now.toISOString()
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      buildMarketingEmailAutomationEligibleUserIdsQuery({
        automationId: input.automation.id,
        statusCondition: input.automation.statusCondition,
        thresholdIso,
        nowIso,
        limit: input.limit
      })
    )

    return rows.map((row) => row.id)
  }

  async enqueueRecipient(input: EnqueueRecipientInput) {
    const result = await prisma.$executeRaw`
      INSERT INTO "MarketingEmailAutomationRecipient"
        ("id", "automationId", "templateKey", "recipientUserId", "recipientEmail", "variablesJson", "status", "attemptCount", "nextAttemptAt", "createdAt", "updatedAt",
          "claimedAt", "leaseOwner", "leaseExpiresAt")
      VALUES
        (${randomUUID()}, ${input.automation.id}, ${input.automation.templateKey}, ${input.user.id}, ${input.user.email}, ${buildMarketingEmailRecipientVariablesJsonSql(input.variablesJson)},
          'queued', 0, ${buildMarketingEmailTimestampSql(input.nextAttemptAt)}, ${buildMarketingEmailTimestampSql(input.nowIso)}, ${buildMarketingEmailTimestampSql(input.nowIso)}, null, null, null)
      ON CONFLICT ("automationId", "recipientUserId") DO NOTHING
    `

    return Number(result) > 0
  }

  async listDueRecipients(input: { nowIso: string; batchSize: number }) {
    return prisma.$queryRaw<MarketingEmailRecipientRow[]>`
      SELECT recipient."id", recipient."automationId", recipient."templateKey", recipient."recipientUserId", recipient."recipientEmail",
        recipient."variablesJson"::text AS "variablesJson", recipient."status", recipient."attemptCount", recipient."nextAttemptAt", recipient."subject",
        recipient."lastError", recipient."createdAt", recipient."updatedAt", recipient."sentAt", recipient."claimedAt",
        recipient."leaseOwner", recipient."leaseExpiresAt"
      FROM "MarketingEmailAutomationRecipient" recipient
      INNER JOIN "MarketingEmailAutomation" automation ON automation."id" = recipient."automationId"
      WHERE automation."status" = 'active'
        AND (
          (recipient."status" = 'queued' AND recipient."nextAttemptAt" <= ${buildMarketingEmailTimestampSql(input.nowIso)})
          OR (recipient."status" = 'sending' AND recipient."leaseExpiresAt" IS NOT NULL AND recipient."leaseExpiresAt" <= ${buildMarketingEmailTimestampSql(input.nowIso)})
        )
      ORDER BY recipient."nextAttemptAt" ASC, recipient."createdAt" ASC
      LIMIT ${input.batchSize}
    `
  }

  async claimRecipient(input: ClaimRecipientInput) {
    const result = await prisma.$executeRaw`
      UPDATE "MarketingEmailAutomationRecipient"
      SET "status" = 'sending',
        "attemptCount" = "attemptCount" + 1,
        "claimedAt" = ${buildMarketingEmailTimestampSql(input.nowIso)},
        "leaseOwner" = ${input.leaseOwner},
        "leaseExpiresAt" = ${buildMarketingEmailTimestampSql(input.leaseExpiresAt)},
        "lastError" = null,
        "updatedAt" = ${buildMarketingEmailTimestampSql(input.nowIso)}
      WHERE "id" = ${input.recipientId}
        AND EXISTS (
          SELECT 1
          FROM "MarketingEmailAutomation" automation
          WHERE automation."id" = "MarketingEmailAutomationRecipient"."automationId"
            AND automation."status" = 'active'
        )
        AND (
          ("status" = 'queued' AND "nextAttemptAt" <= ${buildMarketingEmailTimestampSql(input.nowIso)})
          OR ("status" = 'sending' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= ${buildMarketingEmailTimestampSql(input.nowIso)})
        )
    `

    if (Number(result) !== 1) {
      return null
    }

    const rows = await prisma.$queryRaw<MarketingEmailRecipientRow[]>`
      SELECT "id", "automationId", "templateKey", "recipientUserId", "recipientEmail", "variablesJson"::text AS "variablesJson", "status", "attemptCount", "nextAttemptAt",
        "subject", "lastError", "createdAt", "updatedAt", "sentAt", "claimedAt", "leaseOwner", "leaseExpiresAt"
      FROM "MarketingEmailAutomationRecipient"
      WHERE "id" = ${input.recipientId}
      LIMIT 1
    `

    return rows[0] ?? null
  }

  async markRecipientSent(input: MarkRecipientSentInput) {
    await prisma.$executeRaw`
      UPDATE "MarketingEmailAutomationRecipient"
      SET "status" = 'sent',
        "subject" = ${input.subject},
        "lastError" = null,
        "sentAt" = ${buildMarketingEmailTimestampSql(input.sentAt)},
        "updatedAt" = ${buildMarketingEmailTimestampSql(input.sentAt)},
        "claimedAt" = null,
        "leaseOwner" = null,
        "leaseExpiresAt" = null
      WHERE "id" = ${input.recipientId}
    `
  }

  async markRecipientFailed(input: MarkRecipientFailedInput) {
    await prisma.$executeRaw`
      UPDATE "MarketingEmailAutomationRecipient"
      SET "status" = ${input.status},
        "nextAttemptAt" = ${buildMarketingEmailTimestampSql(input.nextAttemptAt)},
        "lastError" = ${input.lastError},
        "updatedAt" = ${buildMarketingEmailTimestampSql(input.updatedAt)},
        "claimedAt" = null,
        "leaseOwner" = null,
        "leaseExpiresAt" = null
      WHERE "id" = ${input.recipientId}
    `
  }
}

const defaultMarketingEmailAutomationStore = new PrismaMarketingEmailAutomationStore()

const resolveStore = (store?: MarketingEmailAutomationStore) => store ?? defaultMarketingEmailAutomationStore

const getAutomationById = async (automationId: string, dependencies: CreateMarketingEmailAutomationDependencies = {}) => {
  const store = resolveStore(dependencies.store)
  return store.getAutomationById(automationId)
}

const listMarketingEmailAutomations = async (
  dependencies: CreateMarketingEmailAutomationDependencies = {}
): Promise<MarketingEmailAutomationRecord[]> => {
  const store = resolveStore(dependencies.store)
  const getEmailTemplateByKey = dependencies.getEmailTemplateByKey ?? defaultGetEmailTemplateByKey
  const rows = await store.listAutomationRows(50)
  const templates = await Promise.all(rows.map((row) => getEmailTemplateByKey(row.templateKey)))
  const stats = await store.loadAutomationStats(rows.map((row) => row.id))

  return rows.map((row, index) => ({
    ...row,
    templateName: templates[index]?.name ?? null,
    stats: stats.get(row.id) ?? getDefaultStats()
  }))
}

const enqueueEligibleRecipientsForAutomation = async (
  automationId: string,
  input: {
    store?: MarketingEmailAutomationStore
    now?: Date
    enqueueBatchSize?: number
  } = {}
) => {
  const store = resolveStore(input.store)
  const now = input.now ?? new Date()
  const enqueueBatchSize = input.enqueueBatchSize ?? DEFAULT_WORKER_ENQUEUE_BATCH_SIZE

  if (enqueueBatchSize <= 0) {
    return {
      eligible: 0,
      queued: 0,
      queueInsertSkipped: 0
    }
  }

  const automation = await store.getAutomationById(automationId)

  if (!automation || automation.status !== 'active') {
    return {
      eligible: 0,
      queued: 0,
      queueInsertSkipped: 0
    }
  }

  const stats = (await store.loadAutomationStats([automation.id])).get(automation.id) ?? getDefaultStats()
  const remainingCapacity = Math.max(0, automation.maxRecipients - stats.totalRecipients)
  const limit = Math.min(enqueueBatchSize, remainingCapacity)

  if (limit <= 0) {
    return {
      eligible: 0,
      queued: 0,
      queueInsertSkipped: 0
    }
  }

  const users = await store.listEligibleUsers({
    automation,
    now,
    limit
  })
  let queued = 0
  let queueInsertSkipped = 0
  const nowIso = now.toISOString()

  for (const user of users) {
    const sequenceIndex = stats.totalRecipients + queued
    const nextAttemptAt = new Date(now.getTime() + sequenceIndex * automation.sendIntervalSeconds * 1000).toISOString()
    const inserted = await store.enqueueRecipient({
      automation,
      user,
      variablesJson: JSON.stringify(
        buildUserTemplateVariables(user, {
          discount_code: automation.campaignDiscountCode,
          features_summary: automation.campaignFeaturesSummary,
          cta_url: automation.campaignCtaUrl
        })
      ),
      nextAttemptAt,
      nowIso
    })

    if (inserted) {
      queued += 1
    } else {
      queueInsertSkipped += 1
    }
  }

  return {
    eligible: users.length,
    queued,
    queueInsertSkipped
  }
}

const createMarketingEmailAutomation = async (
  input: CreateMarketingEmailAutomationInput,
  dependencies: CreateMarketingEmailAutomationDependencies = {}
): Promise<CreateMarketingEmailAutomationResult> => {
  const store = resolveStore(dependencies.store)
  const getEmailTemplateByKey = dependencies.getEmailTemplateByKey ?? defaultGetEmailTemplateByKey
  const template = await getEmailTemplateByKey(input.templateKey)

  if (!template) {
    throw new Error(`Email template "${input.templateKey}" was not found.`)
  }

  const nowIso = new Date().toISOString()
  const automationId = randomUUID()
  const triggerDelayHours = clampNumber(resolveTriggerDelayHours(input), 0, 0, 3650 * HOURS_PER_DAY)

  await store.insertAutomation({
    id: automationId,
    templateKey: input.templateKey,
    status: 'active',
    statusCondition: input.statusCondition,
    triggerDelayHours,
    triggerDelayDays: toTriggerDelayDays(triggerDelayHours),
    campaignDiscountCode: input.campaignDiscountCode?.trim() ?? '',
    campaignFeaturesSummary: input.campaignFeaturesSummary.trim(),
    campaignCtaUrl: input.campaignCtaUrl.trim(),
    sendIntervalSeconds: clampNumber(input.sendIntervalSeconds, DEFAULT_SEND_INTERVAL_SECONDS, 10, 86_400),
    maxRecipients: clampNumber(input.maxRecipients, MAX_AUTOMATION_RECIPIENTS, 1, MAX_AUTOMATION_RECIPIENTS),
    createdAt: nowIso,
    updatedAt: nowIso,
    startedAt: nowIso,
    pausedAt: null
  })

  const automation = (await listMarketingEmailAutomations({
    store,
    getEmailTemplateByKey
  })).find((record) => record.id === automationId)

  if (!automation) {
    throw new Error('Marketing email automation was not created.')
  }

  return {
    automation,
    enqueueResult: {
      eligible: 0,
      queued: 0,
      deferred: true
    }
  }
}

const setMarketingEmailAutomationStatus = async (
  automationId: string,
  status: Exclude<MarketingEmailAutomationStatus, 'completed'>,
  dependencies: CreateMarketingEmailAutomationDependencies = {}
) => {
  const store = resolveStore(dependencies.store)
  const nowIso = new Date().toISOString()

  await store.updateAutomationStatus({
    automationId,
    status,
    updatedAt: nowIso,
    pausedAt: status === 'paused' ? nowIso : null
  })

  return getAutomationById(automationId, { store })
}

const deliverClaimedMarketingEmailRecipient = async (
  recipient: MarketingEmailRecipientRow,
  input: {
    mailer: MarketingEmailSender
    rendered: {
      subject: string
      text: string
      html: string
    }
  }
) => {
  await input.mailer.sendEmailMessage({
    toEmail: recipient.recipientEmail,
    subject: input.rendered.subject,
    text: input.rendered.text,
    html: input.rendered.html
  })
}

const recordMarketingEmailDeliveryFailure = async (
  recipient: MarketingEmailRecipientRow,
  error: unknown,
  input: {
    store: MarketingEmailAutomationStore
    now: Date
    createEmailSendLog: typeof defaultCreateEmailSendLog
  }
) => {
  const terminal = recipient.attemptCount >= MAX_SEND_ATTEMPTS
  const retryDelayMs = calculateRetryDelayMs(recipient.attemptCount)
  const updatedAt = input.now.toISOString()
  const nextAttemptAt = terminal ? updatedAt : new Date(input.now.getTime() + retryDelayMs).toISOString()
  const lastError = sanitizeMarketingAutomationError(error)

  await input.store.markRecipientFailed({
    recipientId: recipient.id,
    status: terminal ? 'failed' : 'queued',
    nextAttemptAt,
    lastError,
    updatedAt
  })

  if (terminal) {
    await input.createEmailSendLog({
      templateKey: recipient.templateKey,
      recipientEmail: recipient.recipientEmail,
      recipientUserId: recipient.recipientUserId,
      segmentKey: null,
      mode: 'automation',
      status: 'failed',
      provider: getEmailConfig().provider,
      subject: recipient.templateKey,
      errorMessage: lastError
    }).catch(() => undefined)
  }

  return terminal ? 'failed' : 'retry_scheduled'
}

const prepareMarketingEmailAutomationDeliveries = async (input: {
  store: MarketingEmailAutomationStore
  now: Date
  nowIso: string
  batchSize: number
  enqueueBatchSize: number
  result: ProcessMarketingEmailAutomationResult
}) => {
  const activeAutomations = await input.store.listActiveAutomations(MAX_ACTIVE_AUTOMATIONS_PER_TICK)
  input.result.activeAutomations = activeAutomations.length

  for (const automation of activeAutomations) {
    const enqueueResult = await enqueueEligibleRecipientsForAutomation(automation.id, {
      store: input.store,
      now: input.now,
      enqueueBatchSize: input.enqueueBatchSize
    })
    input.result.eligibleCandidates += enqueueResult.eligible
    input.result.enqueued += enqueueResult.queued
    input.result.queueInsertSkipped += enqueueResult.queueInsertSkipped
  }

  const dueRecipients = await input.store.listDueRecipients({
    nowIso: input.nowIso,
    batchSize: input.batchSize
  })
  input.result.attempted = dueRecipients.length
  return dueRecipients
}

const recordMarketingEmailDeliverySuccess = async (
  recipient: MarketingEmailRecipientRow,
  input: {
    store: MarketingEmailAutomationStore
    subject: string
    sentAt: string
    createEmailSendLog: typeof defaultCreateEmailSendLog
  }
) => {
  await input.store.markRecipientSent({
    recipientId: recipient.id,
    subject: input.subject,
    sentAt: input.sentAt
  })

  await input.createEmailSendLog({
    templateKey: recipient.templateKey,
    recipientEmail: recipient.recipientEmail,
    recipientUserId: recipient.recipientUserId,
    segmentKey: null,
    mode: 'automation',
    status: 'sent',
    provider: getEmailConfig().provider,
    subject: input.subject,
    sentAt: input.sentAt
  })
}

const processDueMarketingEmailAutomationRecipients = async (
  options: ProcessMarketingEmailAutomationOptions = {}
): Promise<ProcessMarketingEmailAutomationResult> => {
  const store = resolveStore(options.store)
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const batchSize = clampNumber(options.batchSize, DEFAULT_WORKER_BATCH_SIZE, 1, 50)
  const enqueueBatchSize = options.enqueueBatchSize ?? DEFAULT_WORKER_ENQUEUE_BATCH_SIZE
  const leaseOwner = options.leaseOwner ?? createLeaseOwner()
  const leaseExpiresAt = new Date(now.getTime() + MARKETING_EMAIL_RECIPIENT_LEASE_MS).toISOString()
  const result = createEmptyProcessingResult()
  const mailer = options.mailer ?? emailService
  const getRenderedEmailTemplateByKey = options.getRenderedEmailTemplateByKey ?? defaultGetRenderedEmailTemplateByKey
  const createEmailSendLog = options.createEmailSendLog ?? defaultCreateEmailSendLog

  const dueRecipients = await prepareMarketingEmailAutomationDeliveries({
    store,
    now,
    nowIso,
    batchSize,
    enqueueBatchSize,
    result
  })

  for (const recipient of dueRecipients) {
    const claimed = await store.claimRecipient({
      recipientId: recipient.id,
      nowIso,
      leaseOwner,
      leaseExpiresAt
    })

    if (!claimed) {
      result.skipped += 1
      continue
    }

    result.claimed += 1

    try {
      const variables = JSON.parse(claimed.variablesJson) as Record<string, string>
      const { rendered } = await getRenderedEmailTemplateByKey(claimed.templateKey, variables)

      await deliverClaimedMarketingEmailRecipient(claimed, {
        mailer,
        rendered
      })
      await recordMarketingEmailDeliverySuccess(claimed, {
        store,
        subject: rendered.subject,
        sentAt: now.toISOString(),
        createEmailSendLog
      })
      result.sent += 1
    } catch (error) {
      const failureResult = await recordMarketingEmailDeliveryFailure(claimed, error, {
        store,
        now,
        createEmailSendLog
      })
      if (failureResult === 'failed') {
        result.failed += 1
      } else {
        result.retryScheduled += 1
      }
    }
  }

  return result
}

const warnIfMarketingAutomationQueueOnlySkippedInserts = (
  result: ProcessMarketingEmailAutomationResult,
  logger: Pick<Console, 'warn'>
) => {
  if (result.eligibleCandidates <= 0 || result.enqueued > 0 || result.queueInsertSkipped <= 0) {
    return
  }

  logger.warn('[marketing] Marketing email automation selected eligible candidates but inserted no queue recipients.', {
    activeAutomations: result.activeAutomations,
    eligibleCandidates: result.eligibleCandidates,
    queueInsertSkipped: result.queueInsertSkipped
  })
}

const processDueMarketingEmailAutomationRecipientsAsBackgroundWork = async (
  options: ProcessMarketingEmailAutomationOptions = {}
): Promise<ProcessMarketingEmailAutomationBackgroundResult> => {
  const observeBackgroundWork = options.runObservedBackgroundWork ?? defaultRunObservedBackgroundWork
  const logger = options.logger ?? console
  const fatalReporter = options.fatalReporter ?? reportPrismaEngineFatalError

  try {
    const result = await observeBackgroundWork(
      'marketing_email_automation_queue',
      () => processDueMarketingEmailAutomationRecipients(options),
      { logger }
    )
    warnIfMarketingAutomationQueueOnlySkippedInserts(result, logger)
    return result
  } catch (error) {
    fatalReporter({
      error,
      source: 'handled_background',
      logContext: {
        component: 'marketing-email-automation-worker'
      }
    })
    logger.error('[marketing] Failed to process marketing email automation queue.', error)
    return createEmptyProcessingResult()
  }
}

let marketingEmailAutomationWorkerInFlight = false

const startMarketingEmailAutomationWorker = () => {
  const intervalMs = parsePositiveIntEnv(process.env.MARKETING_EMAIL_WORKER_INTERVAL_MS, DEFAULT_WORKER_INTERVAL_MS)
  const batchSize = parsePositiveIntEnv(process.env.MARKETING_EMAIL_WORKER_BATCH_SIZE, DEFAULT_WORKER_BATCH_SIZE)
  const enqueueBatchSize = parsePositiveIntEnv(process.env.MARKETING_EMAIL_WORKER_ENQUEUE_BATCH_SIZE, DEFAULT_WORKER_ENQUEUE_BATCH_SIZE)

  setInterval(() => {
    if (marketingEmailAutomationWorkerInFlight) {
      console.warn('[marketing] Marketing email automation worker tick skipped because the previous tick is still running.')
      return
    }

    marketingEmailAutomationWorkerInFlight = true
    void processDueMarketingEmailAutomationRecipientsAsBackgroundWork({
      batchSize,
      enqueueBatchSize
    }).finally(() => {
      marketingEmailAutomationWorkerInFlight = false
    })
  }, intervalMs).unref()
}

export {
  DEFAULT_WORKER_ENQUEUE_BATCH_SIZE,
  MARKETING_EMAIL_RECIPIENT_LEASE_MS,
  buildMarketingEmailRecipientVariablesJsonSql,
  buildMarketingEmailTimestampSql,
  createMarketingEmailAutomation,
  enqueueEligibleRecipientsForAutomation,
  listMarketingEmailAutomations,
  processDueMarketingEmailAutomationRecipients,
  processDueMarketingEmailAutomationRecipientsAsBackgroundWork,
  resolveMarketingAutomationActivePaidMembership,
  setMarketingEmailAutomationStatus,
  startMarketingEmailAutomationWorker
}
export type {
  CreateMarketingEmailAutomationInput,
  CreateMarketingEmailAutomationResult,
  MarketingAutomationStatusCondition,
  MarketingEmailAutomationBaseRecord,
  MarketingEmailAutomationRecord,
  MarketingEmailAutomationStats,
  MarketingEmailAutomationStore,
  MarketingEmailRecipientCandidate,
  MarketingEmailRecipientRow,
  ProcessMarketingEmailAutomationBackgroundResult,
  ProcessMarketingEmailAutomationOptions,
  ProcessMarketingEmailAutomationResult
}
