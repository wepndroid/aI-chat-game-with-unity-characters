import test from 'node:test'
import assert from 'node:assert/strict'
import { EntitlementSource, EntitlementStatus, Prisma } from '@prisma/client'

import {
  buildActiveEntitlementWhere,
  buildActivePatreonEntitlementRelationQuery,
  buildActivePatreonEntitlementWhere,
  buildActivePlayablePatreonEntitlementExistsSql,
  buildActivePlayablePatreonEntitlementWhere,
  hasPlayablePaidEntitlement
} from './active-patreon-entitlement-projection'

const NOW = new Date('2026-05-22T10:22:25.000Z')

const inspectSql = (fragment: Prisma.Sql) => ({
  sql: fragment.sql,
  values: fragment.values
})

test('buildActiveEntitlementWhere centralizes active entitlement expiry semantics without provider coupling', () => {
  assert.deepEqual(buildActiveEntitlementWhere(NOW), {
    status: EntitlementStatus.ACTIVE,
    OR: [
      {
        validUntil: null
      },
      {
        validUntil: {
          gt: NOW
        }
      }
    ]
  })
})

test('buildActivePatreonEntitlementWhere adds Patreon source to the shared active predicate', () => {
  assert.deepEqual(buildActivePatreonEntitlementWhere(NOW), {
    source: EntitlementSource.PATREON,
    ...buildActiveEntitlementWhere(NOW)
  })
})

test('buildActivePlayablePatreonEntitlementWhere limits product-access reads to playable paid tiers', () => {
  assert.deepEqual(buildActivePlayablePatreonEntitlementWhere(NOW), {
    ...buildActivePatreonEntitlementWhere(NOW),
    tierCode: {
      in: ['basic', 'premium', 'just_models', 'secretwaifu_access']
    }
  })
})

test('relation query keeps updatedAt in the projection for Prisma ordered relation safety', () => {
  const query = buildActivePatreonEntitlementRelationQuery(NOW, {
    take: 1
  })

  assert.equal(query.select.tierCode, true)
  assert.equal(query.select.updatedAt, true)
  assert.deepEqual(query.orderBy, {
    updatedAt: 'desc'
  })
})

test('raw SQL product-access predicate uses Entitlement rows instead of Patreon billing dates', () => {
  const fragment = inspectSql(buildActivePlayablePatreonEntitlementExistsSql(Prisma.sql`u."id"`, NOW))

  assert.match(fragment.sql, /FROM "Entitlement" AS entitlement/)
  assert.match(fragment.sql, /entitlement\."source" = 'PATREON'/)
  assert.match(fragment.sql, /entitlement\."status" = 'ACTIVE'/)
  assert.equal(fragment.sql.includes('PatreonAccount'), false)
  assert.equal(fragment.sql.includes('nextChargeDate'), false)
})

test('hasPlayablePaidEntitlement recognizes canonical paid tiers and migration aliases only', () => {
  assert.equal(hasPlayablePaidEntitlement([{ tierCode: 'premium' }]), true)
  assert.equal(hasPlayablePaidEntitlement([{ tierCode: 'just_models' }]), true)
  assert.equal(hasPlayablePaidEntitlement([{ tierCode: 'free' }]), false)
  assert.equal(hasPlayablePaidEntitlement([{ tierCode: 'inactive' }]), false)
})
