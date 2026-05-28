import { RevenueEventKind } from '@prisma/client'
import { getTierRank, normalizeMembershipTierCode } from './patreon-tier'
import { calculateMonthlyEquivalentCents } from './subscription-billing'

type PreviousPatreonRevenueContext = {
  wasActive: boolean
  tierCode?: string | null
  amountCents?: number | null
  billingPeriodMonths?: number | null
}

type PatreonRevenueEventKindInput = {
  currentTierCode?: string | null
  currentAmountCents?: number | null
  currentBillingPeriodMonths?: number | null
  previous: PreviousPatreonRevenueContext | null
}

const compareNumbers = (currentValue: number, previousValue: number) => {
  if (currentValue > previousValue) {
    return RevenueEventKind.UPGRADE
  }

  if (currentValue < previousValue) {
    return RevenueEventKind.DOWNGRADE
  }

  return RevenueEventKind.RENEWAL
}

const resolvePatreonRevenueEventKind = (input: PatreonRevenueEventKindInput) => {
  if (!input.previous) {
    return RevenueEventKind.INITIAL_PURCHASE
  }

  if (!input.previous.wasActive) {
    return RevenueEventKind.REACTIVATION
  }

  const currentTierCode = normalizeMembershipTierCode(input.currentTierCode)
  const previousTierCode = normalizeMembershipTierCode(input.previous.tierCode)

  if (currentTierCode && previousTierCode) {
    return compareNumbers(getTierRank(currentTierCode), getTierRank(previousTierCode))
  }

  const currentMonthlyCents = calculateMonthlyEquivalentCents(input.currentAmountCents, input.currentBillingPeriodMonths)
  const previousMonthlyCents = calculateMonthlyEquivalentCents(input.previous.amountCents, input.previous.billingPeriodMonths)

  return compareNumbers(currentMonthlyCents, previousMonthlyCents)
}

export { resolvePatreonRevenueEventKind }
export type { PatreonRevenueEventKindInput, PreviousPatreonRevenueContext }
