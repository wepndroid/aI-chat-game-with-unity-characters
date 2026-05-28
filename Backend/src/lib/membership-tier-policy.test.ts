import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEffectiveMembershipTierFromUserRow } from '../services/membership/membership-tier-service'
import { canTierAccessGame, canTierAccessMemberBenefits, resolveHighestMembershipTierCode } from './membership-tier-policy'
import { resolveTierQuotaFromSnapshot } from './tier-quota'

test('membership benefits require at least the basic tier', () => {
  assert.equal(canTierAccessMemberBenefits('free'), false)
  assert.equal(canTierAccessMemberBenefits(null), false)
  assert.equal(canTierAccessMemberBenefits('basic'), true)
  assert.equal(canTierAccessMemberBenefits('premium'), true)
  assert.equal(canTierAccessMemberBenefits('admin'), true)
})

test('game access requires at least the basic tier', () => {
  assert.equal(canTierAccessGame('free'), false)
  assert.equal(canTierAccessGame(null), false)
  assert.equal((canTierAccessGame as (tierCode: string | null) => boolean)('unknown'), false)
  assert.equal(canTierAccessGame('basic'), true)
  assert.equal(canTierAccessGame('premium'), true)
  assert.equal(canTierAccessGame('admin'), true)
})

test('membership tier comparison resolves the highest active entitlement identity', () => {
  assert.equal(resolveHighestMembershipTierCode(['free', 'basic']), 'basic')
  assert.equal(resolveHighestMembershipTierCode(['basic', 'premium']), 'premium')
  assert.equal(resolveHighestMembershipTierCode(['unknown', null]), 'free')
})

test('effective membership resolver uses tier identity instead of billing amount', () => {
  const tierCode = resolveEffectiveMembershipTierFromUserRow({
    role: 'USER',
    tierCode: null,
    entitlementGrants: [{ tierCode: 'premium' }]
  })

  assert.equal(tierCode, 'premium')
})

test('quota policy does not grant product tier from Patreon billing cents alone', () => {
  const tierQuota = resolveTierQuotaFromSnapshot({
    role: 'USER',
    tierCode: null,
    activeEntitlementTierCode: null,
    patreonAccount: {
      tierCents: 1650,
      membershipStatus: 'active_patron',
      pledgeCadenceMonths: 1,
      lastChargeDate: new Date('2026-05-01T00:00:00.000Z'),
      nextChargeDate: new Date('2026-06-01T00:00:00.000Z')
    }
  })

  assert.equal(tierQuota.tierCode, 'free')
  assert.equal(tierQuota.limit, 0)
  assert.equal(tierQuota.voiceEnabled, false)
})

test('quota policy grants basic from active tier identity regardless of billing cents', () => {
  const tierQuota = resolveTierQuotaFromSnapshot({
    role: 'USER',
    tierCode: null,
    activeEntitlementTierCode: 'basic',
    patreonAccount: {
      tierCents: 100,
      membershipStatus: 'active_patron',
      pledgeCadenceMonths: 1,
      lastChargeDate: new Date('2026-05-01T00:00:00.000Z'),
      nextChargeDate: new Date('2026-06-01T00:00:00.000Z')
    }
  })

  assert.equal(tierQuota.tierCode, 'basic')
  assert.equal(tierQuota.voiceEnabled, true)
})
