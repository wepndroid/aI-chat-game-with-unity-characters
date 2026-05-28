import test from 'node:test'
import assert from 'node:assert/strict'
import { RevenueEventKind } from '@prisma/client'
import { resolvePatreonRevenueEventKind } from './patreon-revenue-event-kind'

test('resolvePatreonRevenueEventKind treats the first known active paid snapshot as an initial purchase', () => {
  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'premium',
      currentAmountCents: 1299,
      currentBillingPeriodMonths: 1,
      previous: null
    }),
    RevenueEventKind.INITIAL_PURCHASE
  )
})

test('resolvePatreonRevenueEventKind treats a newly active paid snapshot after inactivity as reactivation', () => {
  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'basic',
      currentAmountCents: 799,
      currentBillingPeriodMonths: 1,
      previous: {
        wasActive: false,
        tierCode: 'basic',
        amountCents: 799,
        billingPeriodMonths: 1
      }
    }),
    RevenueEventKind.REACTIVATION
  )
})

test('resolvePatreonRevenueEventKind compares canonical product tier rank before charged amount', () => {
  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'premium',
      currentAmountCents: 1299,
      currentBillingPeriodMonths: 1,
      previous: {
        wasActive: true,
        tierCode: 'basic',
        amountCents: 799,
        billingPeriodMonths: 1
      }
    }),
    RevenueEventKind.UPGRADE
  )

  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'basic',
      currentAmountCents: 799,
      currentBillingPeriodMonths: 1,
      previous: {
        wasActive: true,
        tierCode: 'premium',
        amountCents: 1299,
        billingPeriodMonths: 1
      }
    }),
    RevenueEventKind.DOWNGRADE
  )
})

test('resolvePatreonRevenueEventKind keeps same-tier discounted annual premium snapshots as renewals', () => {
  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'premium',
      currentAmountCents: 13_094,
      currentBillingPeriodMonths: 12,
      previous: {
        wasActive: true,
        tierCode: 'premium',
        amountCents: 1299,
        billingPeriodMonths: 1
      }
    }),
    RevenueEventKind.RENEWAL
  )

  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'premium',
      currentAmountCents: 1299,
      currentBillingPeriodMonths: 1,
      previous: {
        wasActive: true,
        tierCode: 'premium',
        amountCents: 13_094,
        billingPeriodMonths: 12
      }
    }),
    RevenueEventKind.RENEWAL
  )
})

test('resolvePatreonRevenueEventKind falls back to monthly-equivalent amounts for unknown legacy tier identity', () => {
  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'legacy-premium',
      currentAmountCents: 15_588,
      currentBillingPeriodMonths: 12,
      previous: {
        wasActive: true,
        tierCode: 'legacy-basic',
        amountCents: 9_588,
        billingPeriodMonths: 12
      }
    }),
    RevenueEventKind.UPGRADE
  )

  assert.equal(
    resolvePatreonRevenueEventKind({
      currentTierCode: 'legacy-basic',
      currentAmountCents: 9_588,
      currentBillingPeriodMonths: 12,
      previous: {
        wasActive: true,
        tierCode: 'legacy-premium',
        amountCents: 15_588,
        billingPeriodMonths: 12
      }
    }),
    RevenueEventKind.DOWNGRADE
  )
})
