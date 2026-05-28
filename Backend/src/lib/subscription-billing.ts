const DEFAULT_BILLING_PERIOD_MONTHS = 1
const ANNUAL_BILLING_PERIOD_MONTHS = 12

const normalizeBillingPeriodMonths = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_BILLING_PERIOD_MONTHS
  }

  return Math.max(DEFAULT_BILLING_PERIOD_MONTHS, Math.round(value))
}

const parsePatreonPledgeCadenceMonths = (value: unknown) => {
  if (typeof value === 'number') {
    return normalizeBillingPeriodMonths(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const parsedValue = Number.parseInt(value.trim(), 10)
  return Number.isNaN(parsedValue) ? null : normalizeBillingPeriodMonths(parsedValue)
}

const inferBillingPeriodMonthsFromChargeDates = (input: {
  lastChargeDate: Date | null | undefined
  nextChargeDate: Date | null | undefined
}) => {
  const lastChargeDate = input.lastChargeDate
  const nextChargeDate = input.nextChargeDate

  if (!lastChargeDate || !nextChargeDate || nextChargeDate <= lastChargeDate) {
    return DEFAULT_BILLING_PERIOD_MONTHS
  }

  const daysBetweenCharges = (nextChargeDate.getTime() - lastChargeDate.getTime()) / (24 * 60 * 60 * 1000)

  if (daysBetweenCharges >= 330) {
    return ANNUAL_BILLING_PERIOD_MONTHS
  }

  if (daysBetweenCharges >= 55) {
    return normalizeBillingPeriodMonths(daysBetweenCharges / 30.4375)
  }

  return DEFAULT_BILLING_PERIOD_MONTHS
}

const resolveBillingPeriodMonths = (input: {
  pledgeCadenceMonths?: number | null
  lastChargeDate?: Date | null
  nextChargeDate?: Date | null
}) => {
  const explicitCadence = normalizeBillingPeriodMonths(input.pledgeCadenceMonths)
  const inferredCadence = inferBillingPeriodMonthsFromChargeDates({
    lastChargeDate: input.lastChargeDate,
    nextChargeDate: input.nextChargeDate
  })

  return Math.max(explicitCadence, inferredCadence)
}

const calculateMonthlyEquivalentCents = (amountCents: number | null | undefined, billingPeriodMonths: number | null | undefined) => {
  if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || amountCents <= 0) {
    return 0
  }

  return Math.round(amountCents / normalizeBillingPeriodMonths(billingPeriodMonths))
}

export {
  DEFAULT_BILLING_PERIOD_MONTHS,
  calculateMonthlyEquivalentCents,
  inferBillingPeriodMonthsFromChargeDates,
  normalizeBillingPeriodMonths,
  parsePatreonPledgeCadenceMonths,
  resolveBillingPeriodMonths
}
