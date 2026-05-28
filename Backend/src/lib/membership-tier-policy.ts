type MembershipTierCode = 'free' | 'basic' | 'premium'
type EffectiveMembershipTierCode = MembershipTierCode | 'admin'

const MEMBERSHIP_TIER_RANK: Record<MembershipTierCode, number> = {
  free: 0,
  basic: 1,
  premium: 2
}

const MINIMUM_MEMBER_BENEFITS_TIER: MembershipTierCode = 'basic'
const MINIMUM_GAME_ACCESS_TIER: MembershipTierCode = 'basic'

const normalizeMembershipTierCode = (tierCode: string | null | undefined): MembershipTierCode | null => {
  const normalized = tierCode?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (normalized === 'premium' || normalized === 'secretwaifu_access') {
    return 'premium'
  }

  if (normalized === 'basic' || normalized === 'just_models') {
    return 'basic'
  }

  if (normalized === 'free') {
    return 'free'
  }

  return null
}

const isMembershipTierCode = (tierCode: string | null | undefined): tierCode is MembershipTierCode => {
  return normalizeMembershipTierCode(tierCode) === tierCode
}

const compareMembershipTiers = (left: MembershipTierCode, right: MembershipTierCode) => {
  return MEMBERSHIP_TIER_RANK[left] - MEMBERSHIP_TIER_RANK[right]
}

const isMembershipTierAtLeast = (actual: MembershipTierCode, required: MembershipTierCode) => {
  return compareMembershipTiers(actual, required) >= 0
}

const resolveHighestMembershipTierCode = (tierCodes: Array<string | null | undefined>): MembershipTierCode => {
  return tierCodes.reduce<MembershipTierCode>((highestTierCode, tierCode) => {
    const normalizedTierCode = normalizeMembershipTierCode(tierCode)
    if (!normalizedTierCode) {
      return highestTierCode
    }

    return compareMembershipTiers(normalizedTierCode, highestTierCode) > 0 ? normalizedTierCode : highestTierCode
  }, 'free')
}

const canTierAccessMemberBenefits = (tierCode: EffectiveMembershipTierCode | null | undefined) => {
  if (tierCode === 'admin') {
    return true
  }

  const normalizedTierCode = normalizeMembershipTierCode(tierCode)
  return Boolean(normalizedTierCode && isMembershipTierAtLeast(normalizedTierCode, MINIMUM_MEMBER_BENEFITS_TIER))
}

const canTierAccessGame = (tierCode: EffectiveMembershipTierCode | null | undefined) => {
  if (tierCode === 'admin') {
    return true
  }

  const normalizedTierCode = normalizeMembershipTierCode(tierCode)
  return Boolean(normalizedTierCode && isMembershipTierAtLeast(normalizedTierCode, MINIMUM_GAME_ACCESS_TIER))
}

export {
  MINIMUM_GAME_ACCESS_TIER,
  MINIMUM_MEMBER_BENEFITS_TIER,
  MEMBERSHIP_TIER_RANK,
  canTierAccessGame,
  canTierAccessMemberBenefits,
  compareMembershipTiers,
  isMembershipTierAtLeast,
  isMembershipTierCode,
  normalizeMembershipTierCode,
  resolveHighestMembershipTierCode
}
export type { EffectiveMembershipTierCode, MembershipTierCode }
