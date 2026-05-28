import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateMonthlyEquivalentCents,
  inferBillingPeriodMonthsFromChargeDates,
  parsePatreonPledgeCadenceMonths,
  resolveBillingPeriodMonths
} from './subscription-billing'

test('parsePatreonPledgeCadenceMonths reads Patreon annual cadence', () => {
  assert.equal(parsePatreonPledgeCadenceMonths('12'), 12)
  assert.equal(parsePatreonPledgeCadenceMonths(12), 12)
})

test('calculateMonthlyEquivalentCents amortizes annual subscription amounts', () => {
  assert.equal(calculateMonthlyEquivalentCents(15_588, 12), 1299)
  assert.equal(calculateMonthlyEquivalentCents(9_588, 12), 799)
})

test('resolveBillingPeriodMonths can infer annual cadence for existing rows without pledge cadence', () => {
  const lastChargeDate = new Date('2026-01-01T00:00:00.000Z')
  const nextChargeDate = new Date('2027-01-01T00:00:00.000Z')

  assert.equal(inferBillingPeriodMonthsFromChargeDates({ lastChargeDate, nextChargeDate }), 12)
  assert.equal(resolveBillingPeriodMonths({ pledgeCadenceMonths: 1, lastChargeDate, nextChargeDate }), 12)
})
