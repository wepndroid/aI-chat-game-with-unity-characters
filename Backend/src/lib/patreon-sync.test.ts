import test from 'node:test'
import assert from 'node:assert/strict'
import { EntitlementStatus } from '@prisma/client'
import { extractMembershipSnapshot, resolveSyncedPatreonEntitlementDecision } from './patreon-sync'
import type { PatreonIdentityResponse } from './patreon-client'

const previousCampaignId = process.env.PATREON_CAMPAIGN_ID

const createIdentityResponse = (): PatreonIdentityResponse => ({
  data: {
    id: 'patreon-user-1',
    type: 'user'
  },
  included: [
    {
      id: 'member-other-campaign',
      type: 'member',
      attributes: {
        patron_status: 'active_patron',
        currently_entitled_amount_cents: 100,
        pledge_cadence: '1'
      },
      relationships: {
        campaign: {
          data: {
            id: 'campaign-other'
          }
        },
        currently_entitled_tiers: {
          data: [
            {
              id: 'tier-other'
            }
          ]
        }
      }
    },
    {
      id: 'member-secretwaifu-campaign',
      type: 'member',
      attributes: {
        patron_status: 'active_patron',
        currently_entitled_amount_cents: 500,
        pledge_cadence: '12'
      },
      relationships: {
        campaign: {
          data: {
            id: 'campaign-secretwaifu'
          }
        },
        currently_entitled_tiers: {
          data: [
            {
              id: 'tier-secretwaifu'
            }
          ]
        }
      }
    },
    {
      id: 'tier-other',
      type: 'tier',
      attributes: {
        title: 'Other Campaign Tier',
        amount_cents: 100
      }
    },
    {
      id: 'tier-secretwaifu',
      type: 'tier',
      attributes: {
        title: 'SecretWaifu Access',
        amount_cents: 500
      }
    }
  ]
})

test.after(() => {
  if (previousCampaignId === undefined) {
    delete process.env.PATREON_CAMPAIGN_ID
    return
  }

  process.env.PATREON_CAMPAIGN_ID = previousCampaignId
})

test('extractMembershipSnapshot selects the configured campaign membership', () => {
  process.env.PATREON_CAMPAIGN_ID = 'campaign-secretwaifu'

  const snapshot = extractMembershipSnapshot(createIdentityResponse())

  assert.equal(snapshot.campaignMemberId, 'member-secretwaifu-campaign')
  assert.equal(snapshot.campaignId, 'campaign-secretwaifu')
  assert.deepEqual(snapshot.entitledTierIds, ['tier-secretwaifu'])
  assert.equal(snapshot.currentlyEntitledAmountCents, 500)
  assert.equal(snapshot.pledgeCadenceMonths, 12)
})

test('extractMembershipSnapshot falls back to the first membership only when no campaign is configured', () => {
  delete process.env.PATREON_CAMPAIGN_ID

  const snapshot = extractMembershipSnapshot(createIdentityResponse())

  assert.equal(snapshot.campaignMemberId, 'member-other-campaign')
  assert.equal(snapshot.campaignId, 'campaign-other')
  assert.deepEqual(snapshot.entitledTierIds, ['tier-other'])
})

test('extractMembershipSnapshot does not use an unrelated first membership when campaign is configured', () => {
  process.env.PATREON_CAMPAIGN_ID = 'campaign-missing'

  const snapshot = extractMembershipSnapshot(createIdentityResponse())

  assert.equal(snapshot.campaignMemberId, null)
  assert.equal(snapshot.campaignId, null)
  assert.equal(snapshot.patronStatus, 'not_connected')
  assert.deepEqual(snapshot.entitledTierIds, [])
})

test('resolveSyncedPatreonEntitlementDecision does not persist expired validUntil for active renewal-day patrons', () => {
  const now = new Date('2026-05-22T10:22:25.000Z')
  const nextChargeDate = new Date('2026-05-22T00:00:00.000Z')

  const decision = resolveSyncedPatreonEntitlementDecision({
    now,
    membershipStatus: 'active_patron',
    tierCode: 'premium',
    lastChargeStatus: 'Paid',
    nextChargeDate,
    isGifted: false
  })

  assert.equal(decision.status, EntitlementStatus.ACTIVE)
  assert.equal(decision.validUntil, null)
  assert.equal(decision.reason, 'active_patron_currently_entitled')
})
