import {
  isMembershipTierCode,
  normalizeMembershipTierCode,
  resolveHighestMembershipTierCode,
  type MembershipTierCode
} from './membership-tier-policy'
import { prisma } from './prisma'
import { buildActiveEntitlementWhere } from '../services/membership/active-patreon-entitlement-projection'

type CanonicalTierCode = MembershipTierCode

type ResolvedTierQuota = {
  tierCode: string
  /** Text message hard limit for current period (premium uses large sentinel + unlimited flag). */
  limit: number
  periodDays: number
  unlimitedMessages: boolean
  /** Voice message hard limit for current period (`null` when unlimited). */
  voiceLimit: number | null
  unlimitedVoice: boolean
  voiceEnabled: boolean
}

type TierQuotaOverrideSnapshot = {
  code: string
  messageLimit: number
  periodDays: number
}

type TierQuotaPatreonSnapshot = {
  tierCents: number | null
  membershipStatus: string | null
  pledgeCadenceMonths: number | null
  lastChargeDate: Date | null
  nextChargeDate: Date | null
}

type TierQuotaSourceSnapshot = {
  role?: string | null
  tierCode?: string | null
  tierOverride?: TierQuotaOverrideSnapshot | null
  activeEntitlementTierCode?: string | null
  patreonAccount?: TierQuotaPatreonSnapshot | null
  canonicalTierPeriodDays?: Partial<Record<CanonicalTierCode, number>>
}

const DEFAULT_PERIOD_DAYS = 30
const PREMIUM_SENTINEL_LIMIT = 2_147_483_647

const PRODUCT_TIER_QUOTAS: Record<
  CanonicalTierCode,
  {
    messageLimit: number
    voiceLimit: number | null
    unlimitedMessages: boolean
    unlimitedVoice: boolean
    voiceEnabled: boolean
  }
> = {
  free: {
    messageLimit: 0,
    voiceLimit: 0,
    unlimitedMessages: false,
    unlimitedVoice: false,
    voiceEnabled: false
  },
  basic: {
    messageLimit: 1000,
    voiceLimit: 50,
    unlimitedMessages: false,
    unlimitedVoice: false,
    voiceEnabled: true
  },
  premium: {
    messageLimit: PREMIUM_SENTINEL_LIMIT,
    voiceLimit: null,
    unlimitedMessages: true,
    unlimitedVoice: true,
    voiceEnabled: true
  }
}

const isCanonicalTierCode = (value: string): value is CanonicalTierCode => {
  return isMembershipTierCode(value)
}

const buildCanonicalTierQuota = (tierCode: CanonicalTierCode, periodDays: number): ResolvedTierQuota => {
  const spec = PRODUCT_TIER_QUOTAS[tierCode]
  return {
    tierCode,
    limit: spec.messageLimit,
    periodDays: periodDays > 0 ? periodDays : DEFAULT_PERIOD_DAYS,
    unlimitedMessages: spec.unlimitedMessages,
    voiceLimit: spec.voiceLimit,
    unlimitedVoice: spec.unlimitedVoice,
    voiceEnabled: spec.voiceEnabled
  }
}

const buildAdminTierQuota = (): ResolvedTierQuota => ({
  tierCode: 'admin',
  limit: PREMIUM_SENTINEL_LIMIT,
  periodDays: DEFAULT_PERIOD_DAYS,
  unlimitedMessages: true,
  voiceLimit: null,
  unlimitedVoice: true,
  voiceEnabled: true
})

const resolveTierFromSnapshotSources = (input: {
  activeEntitlementTierCode?: string | null
  patreonAccount?: TierQuotaPatreonSnapshot | null
}): CanonicalTierCode => {
  const normalizedEntitlementTier = normalizeMembershipTierCode(input.activeEntitlementTierCode)
  return normalizedEntitlementTier ?? 'free'
}

/**
 * Pure quota-policy resolver shared by runtime quota enforcement and admin
 * read models. It applies product tier rules without creating quota periods or
 * usage rows; callers decide how to load the source snapshot.
 */
const resolveTierQuotaFromSnapshot = (input: TierQuotaSourceSnapshot): ResolvedTierQuota => {
  if (input.role === 'ADMIN') {
    return buildAdminTierQuota()
  }

  if (input.tierCode) {
    if (isCanonicalTierCode(input.tierCode)) {
      return buildCanonicalTierQuota(input.tierCode, input.tierOverride?.periodDays ?? DEFAULT_PERIOD_DAYS)
    }

    if (input.tierOverride) {
      return {
        tierCode: input.tierOverride.code,
        limit: input.tierOverride.messageLimit,
        periodDays: input.tierOverride.periodDays > 0 ? input.tierOverride.periodDays : DEFAULT_PERIOD_DAYS,
        unlimitedMessages: false,
        voiceLimit: 0,
        unlimitedVoice: false,
        voiceEnabled: false
      }
    }
  }

  const effectiveTier = resolveTierFromSnapshotSources({
    activeEntitlementTierCode: input.activeEntitlementTierCode,
    patreonAccount: input.patreonAccount
  })

  return buildCanonicalTierQuota(effectiveTier, input.canonicalTierPeriodDays?.[effectiveTier] ?? DEFAULT_PERIOD_DAYS)
}

/**
 * Subscription tier for quota when no explicit User.tierCode override is set.
 * Maps Patreon / entitlement codes to catalog tiers (PDF: free, basic, premium).
 */
const resolveTierFromEntitlements = async (userId: string): Promise<CanonicalTierCode> => {
  const now = new Date()

  const activeEntitlements = await prisma.entitlement.findMany({
    where: {
      userId,
      ...buildActiveEntitlementWhere(now)
    },
    select: { tierCode: true }
  })

  return resolveHighestMembershipTierCode(activeEntitlements.map((entitlement) => entitlement.tierCode))
}

/**
 * Chat quota resolver.
 * For `free|basic|premium`, product contract values are enforced directly in code.
 */
export const resolveTierQuotaForUser = async (userId: string): Promise<ResolvedTierQuota> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      tierCode: true,
      tier: {
        select: {
          code: true,
          messageLimit: true,
          periodDays: true
        }
      }
    }
  })

  if (user?.role === 'ADMIN') {
    return resolveTierQuotaFromSnapshot({
      role: user.role
    })
  }

  if (user?.tierCode) {
    const tierQuota = resolveTierQuotaFromSnapshot({
      role: user.role,
      tierCode: user.tierCode,
      tierOverride: user.tier
    })

    if (tierQuota.tierCode !== 'free' || isCanonicalTierCode(user.tierCode) || user.tier) {
      return tierQuota
    }
  }

  const effective = await resolveTierFromEntitlements(userId)
  const tierRow = await prisma.tier.findUnique({
    where: { code: effective },
    select: { periodDays: true }
  })

  return buildCanonicalTierQuota(effective, tierRow?.periodDays ?? DEFAULT_PERIOD_DAYS)
}

export { DEFAULT_PERIOD_DAYS, PREMIUM_SENTINEL_LIMIT, isCanonicalTierCode, resolveTierQuotaFromSnapshot }
export type { CanonicalTierCode, ResolvedTierQuota, TierQuotaPatreonSnapshot, TierQuotaSourceSnapshot }
