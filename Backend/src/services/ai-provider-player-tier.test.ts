import assert from 'node:assert/strict'
import test from 'node:test'

import { toAiProviderPlayerTier } from './ai-provider-player-tier'

test('provider player tier maps product tiers to core queue tiers', () => {
  assert.equal(toAiProviderPlayerTier('free'), 'free')
  assert.equal(toAiProviderPlayerTier('basic'), 'basic')
  assert.equal(toAiProviderPlayerTier('premium'), 'premium')
})

test('provider player tier maps admins to the premium core queue', () => {
  assert.equal(toAiProviderPlayerTier('admin'), 'premium')
})

test('provider player tier rejects quota override strings instead of forwarding them to core', () => {
  assert.throws(
    () => toAiProviderPlayerTier('custom_unlimited' as Parameters<typeof toAiProviderPlayerTier>[0]),
    /Unsupported membership tier/
  )
})
