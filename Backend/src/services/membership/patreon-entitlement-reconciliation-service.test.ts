import test from 'node:test'
import assert from 'node:assert/strict'
import { EntitlementSource, EntitlementStatus } from '@prisma/client'

import {
  reconcilePatreonEntitlements,
  reconcilePatreonEntitlementsAsBackgroundWork
} from './patreon-entitlement-reconciliation-service'

const NOW = new Date('2026-05-22T10:22:25.000Z')
const EXPIRED_VALID_UNTIL = new Date('2026-05-22T00:00:00.000Z')
const LAST_CHARGE_DATE = new Date('2026-05-22T09:55:09.000Z')

type FakeEntitlementRow = {
  id: string
  userId: string
  source: EntitlementSource
  tierCode: string
  status: EntitlementStatus
  validUntil: Date | null
  user: {
    email: string
    patreonAccount: {
      membershipStatus: string | null
      tierCents: number | null
      lastChargeStatus: string | null
      lastChargeDate: Date | null
      nextChargeDate: Date | null
    } | null
  }
}

const makeRow = (overrides: Partial<FakeEntitlementRow> = {}): FakeEntitlementRow => ({
  id: 'entitlement-1',
  userId: 'user-1',
  source: EntitlementSource.PATREON,
  tierCode: 'premium',
  status: EntitlementStatus.ACTIVE,
  validUntil: EXPIRED_VALID_UNTIL,
  user: {
    email: 'westpossmac@gmail.com',
    patreonAccount: {
      membershipStatus: 'active_patron',
      tierCents: 1299,
      lastChargeStatus: 'Paid',
      lastChargeDate: LAST_CHARGE_DATE,
      nextChargeDate: EXPIRED_VALID_UNTIL
    }
  },
  ...overrides
})

const createDb = (rows: FakeEntitlementRow[]) => {
  const calls: Array<{ name: string; query: any }> = []

  return {
    calls,
    db: {
      entitlement: {
        findMany: async (query: any) => {
          calls.push({
            name: 'entitlement.findMany',
            query
          })
          return rows.filter((row) => row.validUntil && row.validUntil.getTime() <= NOW.getTime())
        },
        updateMany: async (query: any) => {
          calls.push({
            name: 'entitlement.updateMany',
            query
          })
          const row = rows.find((candidate) => candidate.id === query.where.id)
          if (!row || row.validUntil === null || row.validUntil.getTime() > NOW.getTime()) {
            return {
              count: 0
            }
          }

          row.validUntil = query.data.validUntil
          return {
            count: 1
          }
        }
      }
    }
  }
}

test('reconcilePatreonEntitlements reports active paid Patreon entitlements with expired validUntil', async () => {
  const { db, calls } = createDb([makeRow()])

  const result = await reconcilePatreonEntitlements({
    db: db as never,
    now: NOW,
    apply: false
  })

  assert.equal(result.inspectedEntitlements, 1)
  assert.equal(result.repairableEntitlements, 1)
  assert.equal(result.updatedEntitlements, 0)
  assert.deepEqual(result.entries.map((entry) => ({
    entitlementId: entry.entitlementId,
    userId: entry.userId,
    email: entry.email,
    tierCode: entry.tierCode,
    currentValidUntil: entry.currentValidUntil,
    proposedValidUntil: entry.proposedValidUntil,
    reason: entry.reason,
    repairable: entry.repairable
  })), [
    {
      entitlementId: 'entitlement-1',
      userId: 'user-1',
      email: 'westpossmac@gmail.com',
      tierCode: 'premium',
      currentValidUntil: EXPIRED_VALID_UNTIL.toISOString(),
      proposedValidUntil: null,
      reason: 'active_patron_currently_entitled',
      repairable: true
    }
  ])
  assert.equal(calls.some((call) => call.name === 'entitlement.updateMany'), false)
})

test('reconcilePatreonEntitlements applies the repair idempotently', async () => {
  const row = makeRow()
  const { db } = createDb([row])

  const firstResult = await reconcilePatreonEntitlements({
    db: db as never,
    now: NOW,
    apply: true
  })
  const secondResult = await reconcilePatreonEntitlements({
    db: db as never,
    now: NOW,
    apply: true
  })

  assert.equal(firstResult.updatedEntitlements, 1)
  assert.equal(row.validUntil, null)
  assert.equal(secondResult.inspectedEntitlements, 0)
  assert.equal(secondResult.updatedEntitlements, 0)
})

test('reconcilePatreonEntitlements excludes refunds and unknown tiers from the conservative repair set', async () => {
  const { db } = createDb([
    makeRow({
      id: 'refund-row',
      userId: 'refund-user',
      user: {
        email: 'refund@example.test',
        patreonAccount: {
          membershipStatus: 'active_patron',
          tierCents: 1299,
          lastChargeStatus: 'Refunded',
          lastChargeDate: LAST_CHARGE_DATE,
          nextChargeDate: EXPIRED_VALID_UNTIL
        }
      }
    }),
    makeRow({
      id: 'unknown-tier-row',
      userId: 'unknown-tier-user',
      tierCode: 'inactive'
    })
  ])

  const result = await reconcilePatreonEntitlements({
    db: db as never,
    now: NOW,
    apply: true
  })

  assert.equal(result.repairableEntitlements, 0)
  assert.equal(result.updatedEntitlements, 0)
})

test('reconcilePatreonEntitlementsAsBackgroundWork observes the reconciliation tick without database gating', async () => {
  const { db } = createDb([makeRow()])
  const observedOperations: string[] = []

  const result = await reconcilePatreonEntitlementsAsBackgroundWork({
    db: db as never,
    now: NOW,
    apply: false,
    runObservedBackgroundWork: async (operationName, work) => {
      observedOperations.push(operationName)
      return work()
    }
  })

  assert.deepEqual(observedOperations, ['patreon_entitlement_reconciliation'])
  assert.equal(result.inspectedEntitlements, 1)
  assert.equal(result.repairableEntitlements, 1)
})
