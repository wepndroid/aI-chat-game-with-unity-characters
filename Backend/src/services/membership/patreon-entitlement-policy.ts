import { EntitlementStatus } from '@prisma/client'
import { normalizeMembershipTierCode } from '../../lib/membership-tier-policy'

type PatreonEntitlementDecisionReason =
  | 'active_patron_currently_entitled'
  | 'refund_like_charge_status'
  | 'paid_through_cancellation'
  | 'gifted_paid_through'
  | 'expired_or_inactive_patron'
  | 'unknown_tier'

type PatreonEntitlementDecisionInput = {
  now: Date
  membershipStatus: string | null
  tierCode: string | null
  lastChargeStatus: string | null
  nextChargeDate: Date | null
  isGifted: boolean
}

type PatreonEntitlementDecision = {
  status: EntitlementStatus
  /**
   * Product-access expiry for the internal Entitlement row.
   *
   * Patreon `next_charge_date` is billing-cycle metadata. Active patrons who
   * are still currently entitled should not receive a product expiry date from
   * that field, because renewal-day snapshots can place it before `now`.
   */
  validUntil: Date | null
  reason: PatreonEntitlementDecisionReason
}

const isRefundLikePatreonChargeStatus = (lastChargeStatus: string | null) => {
  const normalized = lastChargeStatus?.trim().toLowerCase()
  return Boolean(normalized && (normalized.includes('refund') || normalized.includes('fraud')))
}

const isPaidPatreonTierCode = (tierCode: string | null) => {
  const normalizedTierCode = normalizeMembershipTierCode(tierCode)
  return Boolean(normalizedTierCode && normalizedTierCode !== 'free')
}

const isFutureDate = (date: Date | null, now: Date) => {
  return Boolean(date && date.getTime() > now.getTime())
}

/**
 * Translates a Patreon member snapshot into SecretWaifu entitlement semantics.
 *
 * This is the anti-corruption boundary between Patreon billing fields and the
 * internal access model. `validUntil` is populated only when product access has
 * a real paid-through end date; active Patreon members keep `validUntil = null`
 * so renewal-day billing timestamps cannot expire game access.
 */
const resolvePatreonEntitlementDecision = (
  input: PatreonEntitlementDecisionInput
): PatreonEntitlementDecision => {
  if (!isPaidPatreonTierCode(input.tierCode)) {
    return {
      status: EntitlementStatus.INACTIVE,
      validUntil: input.now,
      reason: 'unknown_tier'
    }
  }

  if (isRefundLikePatreonChargeStatus(input.lastChargeStatus)) {
    return {
      status: EntitlementStatus.INACTIVE,
      validUntil: input.now,
      reason: 'refund_like_charge_status'
    }
  }

  if (input.membershipStatus === 'active_patron') {
    return {
      status: EntitlementStatus.ACTIVE,
      validUntil: null,
      reason: 'active_patron_currently_entitled'
    }
  }

  if (input.isGifted && isFutureDate(input.nextChargeDate, input.now)) {
    return {
      status: EntitlementStatus.ACTIVE,
      validUntil: input.nextChargeDate,
      reason: 'gifted_paid_through'
    }
  }

  if (isFutureDate(input.nextChargeDate, input.now)) {
    return {
      status: EntitlementStatus.ACTIVE,
      validUntil: input.nextChargeDate,
      reason: 'paid_through_cancellation'
    }
  }

  return {
    status: EntitlementStatus.INACTIVE,
    validUntil: input.nextChargeDate ?? input.now,
    reason: 'expired_or_inactive_patron'
  }
}

export {
  isPaidPatreonTierCode,
  isRefundLikePatreonChargeStatus,
  resolvePatreonEntitlementDecision
}
export type {
  PatreonEntitlementDecision,
  PatreonEntitlementDecisionInput,
  PatreonEntitlementDecisionReason
}
