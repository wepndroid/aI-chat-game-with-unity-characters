import test from 'node:test'
import assert from 'node:assert/strict'

import { Prisma } from '@prisma/client'
import {
  buildMarketingEmailAutomationEligibleUserIdsQuery,
  buildMarketingSubscriptionEligibilityPredicate
} from './marketing-email-automation-eligibility-query'

const inspectPostgresSql = (fragment: Prisma.Sql) => {
  const postgresFragment = fragment as Prisma.Sql & { text?: string }

  return {
    text: postgresFragment.text ?? postgresFragment.sql,
    values: fragment.values
  }
}

test('marketing eligible-user query binds automation id before eligibility timestamps', () => {
  const thresholdIso = '2026-05-01T00:00:00.000Z'
  const query = inspectPostgresSql(
    buildMarketingEmailAutomationEligibleUserIdsQuery({
      automationId: 'automation-1',
      statusCondition: 'verified_no_subscription',
      thresholdIso,
      nowIso: '2026-05-25T08:00:00.000Z',
      limit: 100
    })
  )

  assert.equal(query.values[0], 'automation-1')
  assert.equal(query.values[1], thresholdIso)
  assert.equal(query.values.at(-1), 100)
  assert.match(query.text, /recipient\."automationId"\s*=\s*\$1/)
  assert.match(query.text, /u\."createdAt"\s*<=\s*\$2::timestamptz/)
  assert.doesNotMatch(query.text, /u\."createdAt"\s*<=\s*\$1::timestamptz/)
})

test('marketing active-subscription eligible-user query composes entitlement predicates without stealing automation id placeholder', () => {
  const thresholdIso = '2026-05-01T00:00:00.000Z'
  const nowIso = '2026-05-25T08:00:00.000Z'
  const query = inspectPostgresSql(
    buildMarketingEmailAutomationEligibleUserIdsQuery({
      automationId: 'automation-active',
      statusCondition: 'active_subscription',
      thresholdIso,
      nowIso,
      limit: 25
    })
  )

  assert.equal(query.values[0], 'automation-active')
  assert.equal(query.values[1], thresholdIso)
  assert.equal(query.values[2], nowIso)
  assert.equal(query.values.at(-1), 25)
  assert.match(query.text, /recipient\."automationId"\s*=\s*\$1/)
  assert.match(query.text, /FROM "Entitlement" AS entitlement/)
  assert.match(query.text, /entitlement\."validUntil"\s*>\s*\$3::timestamptz/)
})

test('marketing active subscription SQL is based on active entitlements instead of Patreon billing dates', () => {
  const fragment = inspectPostgresSql(
    buildMarketingSubscriptionEligibilityPredicate(
      'active_subscription',
      '2026-05-01T00:00:00.000Z',
      '2026-05-19T10:00:00.000Z'
    )
  )

  assert.match(fragment.text, /FROM "Entitlement" AS entitlement/)
  assert.equal(fragment.text.includes('PatreonAccount'), false)
  assert.equal(fragment.text.includes('nextChargeDate'), false)
})

test('marketing canceled subscription SQL excludes users with active playable entitlements', () => {
  const fragment = inspectPostgresSql(
    buildMarketingSubscriptionEligibilityPredicate(
      'canceled_subscription',
      '2026-05-01T00:00:00.000Z',
      '2026-05-19T10:00:00.000Z'
    )
  )

  assert.match(fragment.text, /NOT\s+EXISTS/)
  assert.match(fragment.text, /FROM "Entitlement" AS entitlement/)
  assert.equal(fragment.text.includes('PatreonAccount'), false)
  assert.equal(fragment.text.includes('nextChargeDate'), false)
})
