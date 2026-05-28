import test from 'node:test'
import assert from 'node:assert/strict'
import { EntitlementStatus } from '@prisma/client'

import {
  isRefundLikePatreonChargeStatus,
  resolvePatreonEntitlementDecision
} from './patreon-entitlement-policy'

const NOW = new Date('2026-05-22T10:22:25.000Z')
const PAST_NEXT_CHARGE_DATE = new Date('2026-05-22T00:00:00.000Z')
const FUTURE_NEXT_CHARGE_DATE = new Date('2026-06-22T00:00:00.000Z')

const resolveDecision = (overrides: Partial<Parameters<typeof resolvePatreonEntitlementDecision>[0]> = {}) =>
  resolvePatreonEntitlementDecision({
    now: NOW,
    membershipStatus: 'active_patron',
    tierCode: 'premium',
    lastChargeStatus: 'Paid',
    nextChargeDate: PAST_NEXT_CHARGE_DATE,
    isGifted: false,
    ...overrides
  })

test('active paid patrons keep product access when Patreon next charge date is already in the past', () => {
  const decision = resolveDecision()

  assert.equal(decision.status, EntitlementStatus.ACTIVE)
  assert.equal(decision.validUntil, null)
  assert.equal(decision.reason, 'active_patron_currently_entitled')
})

test('active paid patrons do not use future Patreon next charge date as product access expiry', () => {
  const decision = resolveDecision({
    nextChargeDate: FUTURE_NEXT_CHARGE_DATE
  })

  assert.equal(decision.status, EntitlementStatus.ACTIVE)
  assert.equal(decision.validUntil, null)
  assert.equal(decision.reason, 'active_patron_currently_entitled')
})

test('refund and fraud charge states immediately deactivate the entitlement', () => {
  for (const lastChargeStatus of ['Refunded', 'fraud_review']) {
    const decision = resolveDecision({
      lastChargeStatus
    })

    assert.equal(decision.status, EntitlementStatus.INACTIVE)
    assert.equal(decision.validUntil?.toISOString(), NOW.toISOString())
    assert.equal(decision.reason, 'refund_like_charge_status')
  }
})

test('former patrons retain paid-through access until a future next charge date', () => {
  const decision = resolveDecision({
    membershipStatus: 'former_patron',
    nextChargeDate: FUTURE_NEXT_CHARGE_DATE
  })

  assert.equal(decision.status, EntitlementStatus.ACTIVE)
  assert.equal(decision.validUntil?.toISOString(), FUTURE_NEXT_CHARGE_DATE.toISOString())
  assert.equal(decision.reason, 'paid_through_cancellation')
})

test('former patrons with no remaining paid-through window are inactive', () => {
  for (const nextChargeDate of [null, PAST_NEXT_CHARGE_DATE]) {
    const decision = resolveDecision({
      membershipStatus: 'former_patron',
      nextChargeDate
    })

    assert.equal(decision.status, EntitlementStatus.INACTIVE)
    assert.equal(decision.validUntil?.toISOString(), (nextChargeDate ?? NOW).toISOString())
    assert.equal(decision.reason, 'expired_or_inactive_patron')
  }
})

test('gifted memberships retain access until the gifted paid-through end date', () => {
  const decision = resolveDecision({
    membershipStatus: 'former_patron',
    isGifted: true,
    nextChargeDate: FUTURE_NEXT_CHARGE_DATE
  })

  assert.equal(decision.status, EntitlementStatus.ACTIVE)
  assert.equal(decision.validUntil?.toISOString(), FUTURE_NEXT_CHARGE_DATE.toISOString())
  assert.equal(decision.reason, 'gifted_paid_through')
})

test('unknown and free tier identities do not grant Patreon product access', () => {
  for (const tierCode of ['inactive', 'free', null]) {
    const decision = resolveDecision({
      tierCode
    })

    assert.equal(decision.status, EntitlementStatus.INACTIVE)
    assert.equal(decision.validUntil?.toISOString(), NOW.toISOString())
    assert.equal(decision.reason, 'unknown_tier')
  }
})

test('refund-like charge detection is case-insensitive and ignores paid states', () => {
  assert.equal(isRefundLikePatreonChargeStatus('Refunded'), true)
  assert.equal(isRefundLikePatreonChargeStatus('fraud_review'), true)
  assert.equal(isRefundLikePatreonChargeStatus('Paid'), false)
  assert.equal(isRefundLikePatreonChargeStatus(null), false)
})
