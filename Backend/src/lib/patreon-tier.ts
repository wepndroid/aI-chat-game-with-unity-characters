import {
  compareMembershipTiers,
  normalizeMembershipTierCode,
  type MembershipTierCode as CanonicalMembershipTierCode
} from './membership-tier-policy'

const CURRENT_BASIC_TIER_CENTS = 799
const CURRENT_PREMIUM_TIER_CENTS = 1299

const resolveCanonicalTierCodeFromAmount = (tierCents: number | null | undefined): CanonicalMembershipTierCode => {
  const normalizedTierCents = typeof tierCents === 'number' && Number.isFinite(tierCents) ? tierCents : 0

  if (normalizedTierCents >= CURRENT_PREMIUM_TIER_CENTS) {
    return 'premium'
  }

  if (normalizedTierCents >= CURRENT_BASIC_TIER_CENTS) {
    return 'basic'
  }

  return 'free'
}

const resolveCanonicalTierCodeFromTitle = (title: string | null | undefined): CanonicalMembershipTierCode | null => {
  const normalized = title?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (
    normalized.includes('secretwaifu') ||
    normalized.includes('premium') ||
    normalized.includes('full access') ||
    normalized.includes('all access')
  ) {
    return 'premium'
  }

  if (normalized.includes('just models') || normalized.includes('basic') || normalized.includes('models')) {
    return 'basic'
  }

  return null
}

const getCanonicalTierCents = (tierCode: CanonicalMembershipTierCode) => {
  if (tierCode === 'premium') {
    return CURRENT_PREMIUM_TIER_CENTS
  }

  if (tierCode === 'basic') {
    return CURRENT_BASIC_TIER_CENTS
  }

  return 0
}

const getTierRank = (tierCode: CanonicalMembershipTierCode) => {
  return compareMembershipTiers(tierCode, 'free')
}

export {
  CURRENT_BASIC_TIER_CENTS,
  CURRENT_PREMIUM_TIER_CENTS,
  getCanonicalTierCents,
  getTierRank,
  normalizeMembershipTierCode,
  resolveCanonicalTierCodeFromAmount,
  resolveCanonicalTierCodeFromTitle
}
export type { CanonicalMembershipTierCode }
