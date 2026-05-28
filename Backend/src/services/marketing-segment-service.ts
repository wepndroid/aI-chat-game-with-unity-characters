import { prisma } from '../lib/prisma'
import { calculateMonthlyEquivalentCents, resolveBillingPeriodMonths } from '../lib/subscription-billing'
import {
  buildActivePatreonEntitlementRelationQuery,
  hasPlayablePaidEntitlement
} from './membership/active-patreon-entitlement-projection'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const REMINDER_DELAY_DAYS = 7
const ENGAGED_LOOKBACK_DAYS = 14
const MAX_SEGMENT_RECORDS = 12

const MARKETING_SEGMENT_KEYS = ['reminderCandidates', 'engagedNoPurchase', 'winBackCandidates'] as const

type MarketingSegmentKey = (typeof MARKETING_SEGMENT_KEYS)[number]

type MarketingUserRecord = {
  id: string
  email: string
  username: string
  isEmailVerified: boolean
  createdAt: string
  lastSeenAt: string | null
  daysSinceSignup: number
  daysSinceLastSeen: number | null
  chatSessionsCount: number
  purchaseCount: number
  totalRevenueCents: number
  currentTierCents: number
  hasActivePaidMembership: boolean
  membershipStatus: string | null
  lastPurchaseAt: string | null
}

type MarketingSegmentRecord = MarketingUserRecord & {
  reason: string
}

type MarketingDashboardData = {
  summary: {
    reminderCandidates: number
    engagedNoPurchase: number
    winBackCandidates: number
    verificationBlockers: number
  }
  segments: Record<
    MarketingSegmentKey,
    {
      total: number
      records: MarketingSegmentRecord[]
      allRecords: MarketingSegmentRecord[]
    }
  >
  updatedAt: string
}

type MarketingSegmentDatabase = {
  user: {
    findMany: (query: unknown) => Promise<MarketingSegmentUserRow[]>
  }
}

type MarketingSegmentInput = {
  db?: MarketingSegmentDatabase
  now?: Date
}

type MarketingSegmentUserRow = {
  id: string
  email: string
  username: string
  isEmailVerified: boolean
  createdAt: Date
  activityState: {
    lastSeenAt: Date | null
  } | null
  patreonAccount: {
    membershipStatus: string | null
    tierCents: number | null
    pledgeCadenceMonths: number | null
    lastChargeDate: Date | null
    nextChargeDate: Date | null
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

const getElapsedDays = (from: Date, to: Date) => {
  const diffMs = Math.max(0, to.getTime() - from.getTime())
  return Math.floor(diffMs / MS_PER_DAY)
}

const toIsoOrNull = (value: Date | null | undefined) => {
  return value ? value.toISOString() : null
}

const toTimestamp = (value: string | null) => {
  return value ? new Date(value).getTime() : 0
}

const withReason = (record: MarketingUserRecord, reason: string): MarketingSegmentRecord => ({
  ...record,
  reason
})

const getMarketingDashboardData = async (input: MarketingSegmentInput = {}): Promise<MarketingDashboardData> => {
  const now = input.now ?? new Date()
  const db = input.db ?? (prisma as unknown as MarketingSegmentDatabase)
  const users = await db.user.findMany({
    where: {
      role: {
        not: 'ADMIN'
      }
    },
    select: {
      id: true,
      email: true,
      username: true,
      isEmailVerified: true,
      createdAt: true,
      activityState: {
        select: {
          lastSeenAt: true
        }
      },
      patreonAccount: {
        select: {
          membershipStatus: true,
          tierCents: true,
          pledgeCadenceMonths: true,
          lastChargeDate: true,
          nextChargeDate: true
        }
      },
      entitlementGrants: buildActivePatreonEntitlementRelationQuery(now, {
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
  })

  const baseRecords: MarketingUserRecord[] = users.map((user) => {
    const lastSeenAt = user.activityState?.lastSeenAt ?? null
    const purchaseCount = user.revenueEvents.length
    const totalRevenueCents = user.revenueEvents.reduce((sum, revenueEvent) => sum + revenueEvent.amountCents, 0)
    const lastPurchaseAt = user.revenueEvents[0]?.chargedAt ?? null
    const billingPeriodMonths = resolveBillingPeriodMonths({
      pledgeCadenceMonths: user.patreonAccount?.pledgeCadenceMonths,
      lastChargeDate: user.patreonAccount?.lastChargeDate,
      nextChargeDate: user.patreonAccount?.nextChargeDate
    })
    const currentTierCents = calculateMonthlyEquivalentCents(user.patreonAccount?.tierCents ?? 0, billingPeriodMonths)
    const hasActivePaidMembership = hasPlayablePaidEntitlement(user.entitlementGrants)

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: toIsoOrNull(lastSeenAt),
      daysSinceSignup: getElapsedDays(user.createdAt, now),
      daysSinceLastSeen: lastSeenAt ? getElapsedDays(lastSeenAt, now) : null,
      chatSessionsCount: user._count.chatSessions,
      purchaseCount,
      totalRevenueCents,
      currentTierCents,
      hasActivePaidMembership,
      membershipStatus: user.patreonAccount?.membershipStatus ?? null,
      lastPurchaseAt: toIsoOrNull(lastPurchaseAt)
    }
  })

  const reminderCandidates = baseRecords
    .filter((record) => record.purchaseCount === 0 && record.daysSinceSignup >= REMINDER_DELAY_DAYS)
    .sort((left, right) => right.daysSinceSignup - left.daysSinceSignup || left.username.localeCompare(right.username))

  const engagedNoPurchase = baseRecords
    .filter((record) => {
      const recentlySeen = record.daysSinceLastSeen !== null && record.daysSinceLastSeen <= ENGAGED_LOOKBACK_DAYS
      return record.purchaseCount === 0 && (record.chatSessionsCount > 0 || recentlySeen)
    })
    .sort((left, right) => {
      const chatDelta = right.chatSessionsCount - left.chatSessionsCount
      if (chatDelta !== 0) {
        return chatDelta
      }

      return toTimestamp(right.lastSeenAt) - toTimestamp(left.lastSeenAt)
    })

  const winBackCandidates = baseRecords
    .filter((record) => record.purchaseCount > 0 && !record.hasActivePaidMembership)
    .sort(
      (left, right) =>
        toTimestamp(right.lastPurchaseAt) - toTimestamp(left.lastPurchaseAt) || right.totalRevenueCents - left.totalRevenueCents
    )

  const reminderAllRecords = reminderCandidates.map((record) =>
    withReason(record, `${record.daysSinceSignup} days since signup and still no purchase.`)
  )

  const engagedAllRecords = engagedNoPurchase.map((record) => {
    const activityLabel =
      record.chatSessionsCount > 0
        ? `${record.chatSessionsCount} chat session${record.chatSessionsCount === 1 ? '' : 's'}`
        : record.daysSinceLastSeen === null
          ? 'recent account activity'
          : `seen ${record.daysSinceLastSeen} day${record.daysSinceLastSeen === 1 ? '' : 's'} ago`

    return withReason(record, `Shows intent with ${activityLabel}, but has not converted yet.`)
  })

  const winBackAllRecords = winBackCandidates.map((record) => {
    const daysSincePurchase = record.lastPurchaseAt ? getElapsedDays(new Date(record.lastPurchaseAt), now) : null
    const purchaseAgeLabel =
      daysSincePurchase === null ? 'Paid before but is now inactive.' : `Last purchase was ${daysSincePurchase} days ago.`

    return withReason(record, `${purchaseAgeLabel} Good candidate for a comeback or feature-update email.`)
  })

  const verificationBlockers = reminderCandidates.filter((record) => !record.isEmailVerified).length

  return {
    summary: {
      reminderCandidates: reminderCandidates.length,
      engagedNoPurchase: engagedNoPurchase.length,
      winBackCandidates: winBackCandidates.length,
      verificationBlockers
    },
    segments: {
      reminderCandidates: {
        total: reminderAllRecords.length,
        records: reminderAllRecords.slice(0, MAX_SEGMENT_RECORDS),
        allRecords: reminderAllRecords
      },
      engagedNoPurchase: {
        total: engagedAllRecords.length,
        records: engagedAllRecords.slice(0, MAX_SEGMENT_RECORDS),
        allRecords: engagedAllRecords
      },
      winBackCandidates: {
        total: winBackAllRecords.length,
        records: winBackAllRecords.slice(0, MAX_SEGMENT_RECORDS),
        allRecords: winBackAllRecords
      }
    },
    updatedAt: now.toISOString()
  }
}

export { MARKETING_SEGMENT_KEYS, getMarketingDashboardData }
export type { MarketingDashboardData, MarketingSegmentDatabase, MarketingSegmentKey, MarketingSegmentRecord, MarketingUserRecord }
