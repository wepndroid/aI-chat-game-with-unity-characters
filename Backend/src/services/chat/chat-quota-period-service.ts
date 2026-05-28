import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { prisma } from '../../lib/prisma'
import { postgresTimestamptzValue } from '../../lib/database/postgres-sql'

type QuotaResetReason =
  | 'default'
  | 'patreon_initial_purchase'
  | 'patreon_reactivation'
  | 'patreon_renewal'
  | 'patreon_upgrade'
  | 'admin_fixture_reset'

type QuotaPeriod = {
  id: string
  userId: string
  periodStart: Date
  periodEnd: Date
  tierCode: string
  resetReason: QuotaResetReason
  sourceEventKey: string | null
  actorUserId: string | null
}

type QuotaPeriodRow = {
  id: string
  userId: string
  periodStartAt: string | Date
  periodEndAt: string | Date
  tierCode: string
  resetReason: string
  sourceEventKey: string | null
  actorUserId: string | null
}

type ResolvedTierQuotaInput = {
  tierCode: string
  periodDays: number
}

type PatreonPeriodInput = {
  lastChargeDate: Date | null
  nextChargeDate: Date | null
  membershipStatus: string | null
  tierCents: number | null
}

type ResetQuotaPeriodInput = {
  userId: string
  tierCode: string
  periodDays: number
  resetReason: QuotaResetReason
  periodStart?: Date
  periodEnd?: Date
  sourceEventKey?: string | null
  actorUserId?: string | null
}

const DEFAULT_PERIOD_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value))

const fromRow = (row: QuotaPeriodRow): QuotaPeriod => ({
  id: row.id,
  userId: row.userId,
  periodStart: toDate(row.periodStartAt),
  periodEnd: toDate(row.periodEndAt),
  tierCode: row.tierCode,
  resetReason: isQuotaResetReason(row.resetReason) ? row.resetReason : 'default',
  sourceEventKey: row.sourceEventKey,
  actorUserId: row.actorUserId
})

const isQuotaResetReason = (value: string): value is QuotaResetReason => {
  return (
    value === 'default' ||
    value === 'patreon_initial_purchase' ||
    value === 'patreon_reactivation' ||
    value === 'patreon_renewal' ||
    value === 'patreon_upgrade' ||
    value === 'admin_fixture_reset'
  )
}

const normalizePeriodDays = (periodDays: number) =>
  Number.isFinite(periodDays) && periodDays > 0 ? periodDays : DEFAULT_PERIOD_DAYS

const quotaPeriodTimestamp = postgresTimestamptzValue

const legacyEpochPeriodBounds = (periodDays: number, now: Date) => {
  const periodMs = normalizePeriodDays(periodDays) * MS_PER_DAY
  const epochMs = now.getTime()
  const periodStart = new Date(epochMs - (epochMs % periodMs))
  const periodEnd = new Date(periodStart.getTime() + periodMs)
  return { periodStart, periodEnd }
}

const findCurrentQuotaPeriod = async (userId: string, now: Date): Promise<QuotaPeriod | null> => {
  const rows = await prisma.$queryRaw<QuotaPeriodRow[]>`
    SELECT "id", "userId", "periodStartAt", "periodEndAt", "tierCode", "resetReason", "sourceEventKey", "actorUserId"
    FROM "ChatQuotaPeriod"
    WHERE "userId" = ${userId}
      AND "periodStartAt" <= ${quotaPeriodTimestamp(now)}
      AND "periodEndAt" > ${quotaPeriodTimestamp(now)}
    ORDER BY "periodStartAt" DESC
    LIMIT 1
  `

  return rows[0] ? fromRow(rows[0]) : null
}

const findQuotaPeriodBySourceEvent = async (sourceEventKey: string): Promise<QuotaPeriod | null> => {
  const rows = await prisma.$queryRaw<QuotaPeriodRow[]>`
    SELECT "id", "userId", "periodStartAt", "periodEndAt", "tierCode", "resetReason", "sourceEventKey", "actorUserId"
    FROM "ChatQuotaPeriod"
    WHERE "sourceEventKey" = ${sourceEventKey}
    LIMIT 1
  `

  return rows[0] ? fromRow(rows[0]) : null
}

const loadPatreonPeriodInput = async (userId: string): Promise<PatreonPeriodInput | null> => {
  return prisma.patreonAccount.findUnique({
    where: { userId },
    select: {
      lastChargeDate: true,
      nextChargeDate: true,
      membershipStatus: true,
      tierCents: true
    }
  })
}

const hasExistingUsageAtPeriodStart = async (userId: string, periodStart: Date) => {
  const existing = await prisma.chatMessageUsage.findUnique({
    where: {
      userId_periodStartAt: {
        userId,
        periodStartAt: periodStart
      }
    },
    select: {
      id: true
    }
  })

  return existing !== null
}

/**
 * Initial anchors preserve the old epoch bucket for free/override users while
 * letting active Patreon users align to their selected campaign charge window
 * when Patreon has supplied usable dates.
 */
const resolveInitialQuotaPeriodBounds = (input: {
  periodDays: number
  now: Date
  patreon: PatreonPeriodInput | null
}) => {
  const periodDays = normalizePeriodDays(input.periodDays)
  const periodMs = periodDays * MS_PER_DAY
  const patreon = input.patreon
  const activePatreon = patreon?.membershipStatus === 'active_patron' && (patreon.tierCents ?? 0) > 0

  if (activePatreon && patreon?.nextChargeDate && patreon.nextChargeDate.getTime() > input.now.getTime()) {
    const periodEnd = patreon.nextChargeDate
    const candidateStart =
      patreon.lastChargeDate &&
      patreon.lastChargeDate.getTime() < periodEnd.getTime() &&
      patreon.lastChargeDate.getTime() <= input.now.getTime()
        ? patreon.lastChargeDate
        : new Date(periodEnd.getTime() - periodMs)

    if (candidateStart.getTime() <= input.now.getTime() && candidateStart.getTime() < periodEnd.getTime()) {
      return { periodStart: candidateStart, periodEnd }
    }
  }

  if (activePatreon && patreon?.lastChargeDate) {
    const periodStart = patreon.lastChargeDate
    const periodEnd = new Date(periodStart.getTime() + periodMs)
    if (periodStart.getTime() <= input.now.getTime() && periodEnd.getTime() > input.now.getTime()) {
      return { periodStart, periodEnd }
    }
  }

  return legacyEpochPeriodBounds(periodDays, input.now)
}

const insertQuotaPeriod = async (input: {
  userId: string
  tierCode: string
  periodStart: Date
  periodEnd: Date
  resetReason: QuotaResetReason
  sourceEventKey: string | null
  actorUserId: string | null
}) => {
  const id = `quota_period_${randomUUID()}`
  const now = new Date()

  await prisma.$executeRaw`
    INSERT INTO "ChatQuotaPeriod" (
      "id",
      "userId",
      "periodStartAt",
      "periodEndAt",
      "tierCode",
      "resetReason",
      "sourceEventKey",
      "actorUserId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${input.userId},
      ${quotaPeriodTimestamp(input.periodStart)},
      ${quotaPeriodTimestamp(input.periodEnd)},
      ${input.tierCode},
      ${input.resetReason},
      ${input.sourceEventKey},
      ${input.actorUserId},
      ${quotaPeriodTimestamp(now)},
      ${quotaPeriodTimestamp(now)}
    )
  `

  return {
    id,
    userId: input.userId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    tierCode: input.tierCode,
    resetReason: input.resetReason,
    sourceEventKey: input.sourceEventKey,
    actorUserId: input.actorUserId
  } satisfies QuotaPeriod
}

const resolveCurrentQuotaPeriod = async (
  userId: string,
  tierQuota: ResolvedTierQuotaInput,
  now = new Date()
): Promise<QuotaPeriod> => {
  const current = await findCurrentQuotaPeriod(userId, now)
  if (current) {
    return current
  }

  const legacyBounds = legacyEpochPeriodBounds(tierQuota.periodDays, now)
  if (await hasExistingUsageAtPeriodStart(userId, legacyBounds.periodStart)) {
    try {
      return await insertQuotaPeriod({
        userId,
        tierCode: tierQuota.tierCode,
        periodStart: legacyBounds.periodStart,
        periodEnd: legacyBounds.periodEnd,
        resetReason: 'default',
        sourceEventKey: null,
        actorUserId: null
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await findCurrentQuotaPeriod(userId, now)
        if (raced) {
          return raced
        }
      }

      throw error
    }
  }

  const patreon = await loadPatreonPeriodInput(userId)
  const { periodStart, periodEnd } = resolveInitialQuotaPeriodBounds({
    periodDays: tierQuota.periodDays,
    now,
    patreon
  })

  try {
    return await insertQuotaPeriod({
      userId,
      tierCode: tierQuota.tierCode,
      periodStart,
      periodEnd,
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await findCurrentQuotaPeriod(userId, now)
      if (raced) {
        return raced
      }
    }

    throw error
  }
}

const resetQuotaPeriodForUser = async (input: ResetQuotaPeriodInput): Promise<QuotaPeriod> => {
  const sourceEventKey = input.sourceEventKey?.trim() || null
  if (sourceEventKey) {
    const existing = await findQuotaPeriodBySourceEvent(sourceEventKey)
    if (existing) {
      return existing
    }
  }

  const now = input.periodStart ?? new Date()
  const periodMs = normalizePeriodDays(input.periodDays) * MS_PER_DAY
  const requestedEnd = input.periodEnd && input.periodEnd.getTime() > now.getTime() ? input.periodEnd : null
  const periodEnd = requestedEnd ?? new Date(now.getTime() + periodMs)

  await prisma.$executeRaw`
    UPDATE "ChatQuotaPeriod"
    SET "periodEndAt" = ${quotaPeriodTimestamp(now)}, "updatedAt" = ${quotaPeriodTimestamp(now)}
    WHERE "userId" = ${input.userId}
      AND "periodStartAt" < ${quotaPeriodTimestamp(now)}
      AND "periodEndAt" > ${quotaPeriodTimestamp(now)}
  `

  try {
    return await insertQuotaPeriod({
      userId: input.userId,
      tierCode: input.tierCode,
      periodStart: now,
      periodEnd,
      resetReason: input.resetReason,
      sourceEventKey,
      actorUserId: input.actorUserId ?? null
    })
  } catch (error) {
    if (sourceEventKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await findQuotaPeriodBySourceEvent(sourceEventKey)
      if (existing) {
        return existing
      }
    }

    throw error
  }
}

export {
  DEFAULT_PERIOD_DAYS,
  legacyEpochPeriodBounds,
  resetQuotaPeriodForUser,
  resolveCurrentQuotaPeriod,
  resolveInitialQuotaPeriodBounds
}
export type { QuotaPeriod, QuotaResetReason, ResolvedTierQuotaInput }
