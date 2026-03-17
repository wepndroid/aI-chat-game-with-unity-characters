type PatreonEntitlementStatus = 'ACTIVE' | 'INACTIVE' | 'EXPIRED'

type PatreonEntitlementRecord = {
  tierCode: string
  status: PatreonEntitlementStatus
  validUntil: string | null
}

type PatreonStatusSnapshot = {
  linked: boolean
  membershipStatus: string
  tierCents: number
  nextChargeDate: string | null
  entitlements: PatreonEntitlementRecord[]
}

const mapEntitlementTierCodeToCents = (tierCode: string) => {
  if (tierCode === 'secretwaifu_access') {
    return 1650
  }

  if (tierCode === 'just_models') {
    return 900
  }

  const explicitAmountMatch = tierCode.match(/(\d{3,5})/)

  if (!explicitAmountMatch) {
    return 0
  }

  const parsedTierCents = Number.parseInt(explicitAmountMatch[1], 10)

  if (Number.isNaN(parsedTierCents)) {
    return 0
  }

  return parsedTierCents
}

const isValidFutureDate = (dateValue: string | null) => {
  if (!dateValue) {
    return true
  }

  const parsedDate = new Date(dateValue)

  if (Number.isNaN(parsedDate.getTime())) {
    return false
  }

  return parsedDate.getTime() > Date.now()
}

const resolveAvailableTierCents = (snapshot: PatreonStatusSnapshot) => {
  const activeEntitlementTierCents = snapshot.entitlements.reduce((highestTierCents, entitlement) => {
    if (entitlement.status !== 'ACTIVE' || !isValidFutureDate(entitlement.validUntil)) {
      return highestTierCents
    }

    return Math.max(highestTierCents, mapEntitlementTierCodeToCents(entitlement.tierCode))
  }, 0)

  const accountTierCents =
    snapshot.membershipStatus === 'active_patron' && isValidFutureDate(snapshot.nextChargeDate) && snapshot.tierCents > 0
      ? snapshot.tierCents
      : 0

  return Math.max(activeEntitlementTierCents, accountTierCents)
}

export { mapEntitlementTierCodeToCents, resolveAvailableTierCents }
export type { PatreonEntitlementRecord, PatreonStatusSnapshot }
