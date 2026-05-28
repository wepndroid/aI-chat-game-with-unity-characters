import test from 'node:test'
import assert from 'node:assert/strict'

import { createRuntimeAdminSettingsRefreshCache } from './runtime-admin-settings-cache'

type Settings = {
  value: string
}

const clone = (value: Settings): Settings => ({ ...value })

test('runtime admin settings cache coalesces concurrent refreshes', async () => {
  let refreshCount = 0
  const cache = createRuntimeAdminSettingsRefreshCache<Settings>({
    clone,
    nowMs: () => 1000,
    ttlMs: 5000
  })

  const [left, right] = await Promise.all([
    cache.get(async () => {
      refreshCount += 1
      return { value: 'fresh' }
    }),
    cache.get(async () => {
      refreshCount += 1
      return { value: 'fresh' }
    })
  ])

  assert.equal(refreshCount, 1)
  assert.deepEqual(left, { value: 'fresh' })
  assert.deepEqual(right, { value: 'fresh' })
  assert.notEqual(left, right)
})

test('runtime admin settings cache returns stale settings when refresh fails after a successful read', async () => {
  let nowMs = 1000
  const staleFallbackErrors: unknown[] = []
  const cache = createRuntimeAdminSettingsRefreshCache<Settings>({
    clone,
    nowMs: () => nowMs,
    ttlMs: 1000,
    onStaleFallback: (error) => staleFallbackErrors.push(error)
  })

  await cache.get(async () => ({ value: 'cached' }))
  nowMs = 3000

  const value = await cache.get(async () => {
    throw new Error('database unavailable')
  })

  assert.deepEqual(value, { value: 'cached' })
  assert.equal(staleFallbackErrors.length, 1)
})
