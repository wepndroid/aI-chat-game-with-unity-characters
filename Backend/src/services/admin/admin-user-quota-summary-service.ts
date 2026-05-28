import { ChatQuotaReservationStatus } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  isCanonicalTierCode,
  resolveTierQuotaFromSnapshot,
  type CanonicalTierCode,
  type ResolvedTierQuota,
  type TierQuotaPatreonSnapshot
} from '../../lib/tier-quota'
import { resolveInitialQuotaPeriodBounds } from '../chat/chat-quota-period-service'
import { buildActivePatreonEntitlementRelationQuery } from '../membership/active-patreon-entitlement-projection'

const GAMEPLAY_REQUEST_ID_PREFIX = 'gameplay:'

type AdminQuotaUserRow = {
  id: string
  role: string
  tierCode: string | null
  tier: {
    code: string
    messageLimit: number
    periodDays: number
  } | null
  entitlementGrants: Array<{
    tierCode: string
    updatedAt: Date
  }>
  patreonAccount: TierQuotaPatreonSnapshot | null
}

type AdminQuotaPeriodRow = {
  userId: string
  periodStartAt: Date | string
  periodEndAt: Date | string
  tierCode: string
}

type AdminQuotaUsageRow = {
  userId: string
  periodStartAt: Date | string
  messagesUsed: number
  voiceMessagesUsed: number
}

type AdminQuotaReservationRow = {
  userId: string
  periodStartAt: Date | string
  requestId: string
  voiceRequested: boolean
}

type AdminQuotaTierRow = {
  code: string
  periodDays: number
}

type AdminUserQuotaSummaryDatabase = {
  user: {
    findMany: (input: unknown) => Promise<AdminQuotaUserRow[]>
  }
  tier: {
    findMany: (input: unknown) => Promise<AdminQuotaTierRow[]>
  }
  chatQuotaPeriod: {
    findMany: (input: unknown) => Promise<AdminQuotaPeriodRow[]>
  }
  chatMessageUsage: {
    findMany: (input: unknown) => Promise<AdminQuotaUsageRow[]>
  }
  chatQuotaReservation: {
    findMany: (input: unknown) => Promise<AdminQuotaReservationRow[]>
  }
}

type AdminUserQuotaSummary = {
  userId: string
  tierCode: string
  periodEndsAt: string
  message: {
    limit: number | null
    used: number
    reserved: number
    remaining: number | null
    unlimited: boolean
  }
  voice: {
    enabled: boolean
    limit: number | null
    used: number
    reserved: number
    remaining: number | null
    unlimited: boolean
  }
}

type PeriodRef = {
  userId: string
  periodStart: Date
  periodEnd: Date
}

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value))

const periodKey = (userId: string, periodStart: Date) => `${userId}\u0000${periodStart.toISOString()}`

const unique = (values: string[]) => [...new Set(values.filter((value) => value.trim().length > 0))]

const resolveRemaining = (input: {
  limit: number
  used: number
  reserved: number
  unlimited: boolean
}) => {
  if (input.unlimited) {
    return null
  }

  return Math.max(0, input.limit - input.used - input.reserved)
}

const resolveVoiceLimit = (tierQuota: ResolvedTierQuota) => {
  if (!tierQuota.voiceEnabled) {
    return 0
  }

  return tierQuota.unlimitedVoice ? null : tierQuota.voiceLimit ?? 0
}

const resolveVoiceRemaining = (input: {
  enabled: boolean
  limit: number | null
  used: number
  reserved: number
  unlimited: boolean
}) => {
  if (!input.enabled) {
    return 0
  }

  if (input.unlimited || input.limit === null) {
    return null
  }

  return Math.max(0, input.limit - input.used - input.reserved)
}

const resolveCurrentPeriodByUserId = (rows: AdminQuotaPeriodRow[]) => {
  const periods = new Map<string, AdminQuotaPeriodRow>()

  for (const row of rows) {
    if (!periods.has(row.userId)) {
      periods.set(row.userId, row)
    }
  }

  return periods
}

const buildPeriodRef = (input: {
  user: AdminQuotaUserRow
  tierQuota: ResolvedTierQuota
  currentPeriod: AdminQuotaPeriodRow | undefined
  now: Date
}): PeriodRef => {
  if (input.currentPeriod) {
    return {
      userId: input.user.id,
      periodStart: toDate(input.currentPeriod.periodStartAt),
      periodEnd: toDate(input.currentPeriod.periodEndAt)
    }
  }

  const fallback = resolveInitialQuotaPeriodBounds({
    periodDays: input.tierQuota.periodDays,
    now: input.now,
    patreon: input.user.patreonAccount
  })

  return {
    userId: input.user.id,
    periodStart: fallback.periodStart,
    periodEnd: fallback.periodEnd
  }
}

const buildPeriodWhere = (periodRefs: PeriodRef[]) => ({
  OR: periodRefs.map((period) => ({
    userId: period.userId,
    periodStartAt: period.periodStart
  }))
})

const buildUsageByPeriod = (rows: AdminQuotaUsageRow[]) => {
  const usage = new Map<string, AdminQuotaUsageRow>()

  for (const row of rows) {
    usage.set(periodKey(row.userId, toDate(row.periodStartAt)), row)
  }

  return usage
}

const buildReservationCountsByPeriod = (rows: AdminQuotaReservationRow[]) => {
  const counts = new Map<string, { messageReserved: number; voiceReserved: number }>()

  for (const row of rows) {
    if (row.requestId.startsWith(GAMEPLAY_REQUEST_ID_PREFIX)) {
      continue
    }

    const key = periodKey(row.userId, toDate(row.periodStartAt))
    const current = counts.get(key) ?? {
      messageReserved: 0,
      voiceReserved: 0
    }

    current.messageReserved += 1
    if (row.voiceRequested) {
      current.voiceReserved += 1
    }

    counts.set(key, current)
  }

  return counts
}

const buildCanonicalTierPeriodDays = (tiers: AdminQuotaTierRow[]) => {
  const periodDays: Partial<Record<CanonicalTierCode, number>> = {}

  for (const tier of tiers) {
    if (isCanonicalTierCode(tier.code)) {
      periodDays[tier.code] = tier.periodDays
    }
  }

  return periodDays
}

const buildAdminUserQuotaSummaries = async (
  userIds: string[],
  input?: {
    db?: AdminUserQuotaSummaryDatabase
    now?: Date
  }
): Promise<AdminUserQuotaSummary[]> => {
  const uniqueUserIds = unique(userIds)
  if (uniqueUserIds.length === 0) {
    return []
  }

  const db = input?.db ?? (prisma as unknown as AdminUserQuotaSummaryDatabase)
  const now = input?.now ?? new Date()

  const [users, canonicalTiers, currentPeriodRows] = await Promise.all([
    db.user.findMany({
      where: {
        id: {
          in: uniqueUserIds
        }
      },
      select: {
        id: true,
        role: true,
        tierCode: true,
        tier: {
          select: {
            code: true,
            messageLimit: true,
            periodDays: true
          }
        },
        entitlementGrants: buildActivePatreonEntitlementRelationQuery(now, {
          take: 1
        }),
        patreonAccount: {
          select: {
            tierCents: true,
            membershipStatus: true,
            pledgeCadenceMonths: true,
            lastChargeDate: true,
            nextChargeDate: true
          }
        }
      }
    }),
    db.tier.findMany({
      where: {
        code: {
          in: ['free', 'basic', 'premium']
        }
      },
      select: {
        code: true,
        periodDays: true
      }
    }),
    db.chatQuotaPeriod.findMany({
      where: {
        userId: {
          in: uniqueUserIds
        },
        periodStartAt: {
          lte: now
        },
        periodEndAt: {
          gt: now
        }
      },
      orderBy: [{ userId: 'asc' }, { periodStartAt: 'desc' }],
      select: {
        userId: true,
        periodStartAt: true,
        periodEndAt: true,
        tierCode: true
      }
    })
  ])

  const canonicalTierPeriodDays = buildCanonicalTierPeriodDays(canonicalTiers)
  const currentPeriodByUserId = resolveCurrentPeriodByUserId(currentPeriodRows)
  const usersById = new Map(users.map((user) => [user.id, user]))
  const orderedUsers = uniqueUserIds.flatMap((userId) => {
    const user = usersById.get(userId)
    return user ? [user] : []
  })
  const tierQuotaByUserId = new Map(
    orderedUsers.map((user) => [
      user.id,
      resolveTierQuotaFromSnapshot({
        role: user.role,
        tierCode: user.tierCode,
        tierOverride: user.tier,
        activeEntitlementTierCode: user.entitlementGrants[0]?.tierCode ?? null,
        patreonAccount: user.patreonAccount,
        canonicalTierPeriodDays
      })
    ])
  )
  const periodRefs = orderedUsers.map((user) =>
    buildPeriodRef({
      user,
      tierQuota: tierQuotaByUserId.get(user.id) as ResolvedTierQuota,
      currentPeriod: currentPeriodByUserId.get(user.id),
      now
    })
  )

  const periodWhere = buildPeriodWhere(periodRefs)
  const [usageRows, reservationRows] = await Promise.all([
    db.chatMessageUsage.findMany({
      where: periodWhere,
      select: {
        userId: true,
        periodStartAt: true,
        messagesUsed: true,
        voiceMessagesUsed: true
      }
    }),
    db.chatQuotaReservation.findMany({
      where: {
        ...periodWhere,
        status: ChatQuotaReservationStatus.RESERVED,
        AND: [
          {
            requestId: {
              not: {
                startsWith: GAMEPLAY_REQUEST_ID_PREFIX
              }
            }
          }
        ]
      },
      select: {
        userId: true,
        periodStartAt: true,
        requestId: true,
        voiceRequested: true
      }
    })
  ])

  const usageByPeriod = buildUsageByPeriod(usageRows)
  const reservationCountsByPeriod = buildReservationCountsByPeriod(reservationRows)

  return orderedUsers.map((user, index) => {
    const tierQuota = tierQuotaByUserId.get(user.id) as ResolvedTierQuota
    const period = periodRefs[index]
    const key = periodKey(user.id, period.periodStart)
    const usage = usageByPeriod.get(key)
    const reservations = reservationCountsByPeriod.get(key) ?? {
      messageReserved: 0,
      voiceReserved: 0
    }
    const messageUsed = usage?.messagesUsed ?? 0
    const voiceUsed = usage?.voiceMessagesUsed ?? 0
    const voiceLimit = resolveVoiceLimit(tierQuota)

    return {
      userId: user.id,
      tierCode: tierQuota.tierCode,
      periodEndsAt: period.periodEnd.toISOString(),
      message: {
        limit: tierQuota.unlimitedMessages ? null : tierQuota.limit,
        used: messageUsed,
        reserved: reservations.messageReserved,
        remaining: resolveRemaining({
          limit: tierQuota.limit,
          used: messageUsed,
          reserved: reservations.messageReserved,
          unlimited: tierQuota.unlimitedMessages
        }),
        unlimited: tierQuota.unlimitedMessages
      },
      voice: {
        enabled: tierQuota.voiceEnabled,
        limit: voiceLimit,
        used: voiceUsed,
        reserved: reservations.voiceReserved,
        remaining: resolveVoiceRemaining({
          enabled: tierQuota.voiceEnabled,
          limit: voiceLimit,
          used: voiceUsed,
          reserved: reservations.voiceReserved,
          unlimited: tierQuota.unlimitedVoice
        }),
        unlimited: tierQuota.voiceEnabled ? tierQuota.unlimitedVoice : false
      }
    }
  })
}

export { buildAdminUserQuotaSummaries }
export type { AdminUserQuotaSummary, AdminUserQuotaSummaryDatabase }
