import assert from 'node:assert/strict'
import test from 'node:test'

import { createAsyncTtlCache } from './async-ttl-cache'

test('async TTL cache returns cached value before expiry', async () => {
  let now = 1_000
  let refreshCount = 0
  const cache = createAsyncTtlCache<string, { value: number }>({
    ttlMs: 100,
    maxEntries: 8,
    nowMs: () => now
  })

  const first = await cache.get('same-key', async () => ({ value: ++refreshCount }))
  now += 50
  const second = await cache.get('same-key', async () => ({ value: ++refreshCount }))

  assert.deepEqual(first, { value: 1 })
  assert.deepEqual(second, { value: 1 })
  assert.equal(refreshCount, 1)
})

test('async TTL cache refreshes values after expiry', async () => {
  let now = 1_000
  let refreshCount = 0
  const cache = createAsyncTtlCache<string, number>({
    ttlMs: 100,
    maxEntries: 8,
    nowMs: () => now
  })

  assert.equal(await cache.get('expiring-key', async () => ++refreshCount), 1)
  now += 101
  assert.equal(await cache.get('expiring-key', async () => ++refreshCount), 2)
  assert.equal(refreshCount, 2)
})

test('async TTL cache coalesces concurrent refreshes for the same key', async () => {
  let refreshCount = 0
  let resolveRefresh!: (value: string) => void
  const cache = createAsyncTtlCache<string, string>({
    ttlMs: 1_000,
    maxEntries: 8
  })

  const refresh = async () => {
    refreshCount += 1
    return new Promise<string>(resolve => {
      resolveRefresh = resolve
    })
  }

  const first = cache.get('shared-key', refresh)
  const second = cache.get('shared-key', refresh)
  resolveRefresh('shared-value')

  assert.equal(await first, 'shared-value')
  assert.equal(await second, 'shared-value')
  assert.equal(refreshCount, 1)
})

test('async TTL cache does not cache failed refreshes', async () => {
  let refreshCount = 0
  const cache = createAsyncTtlCache<string, string>({
    ttlMs: 1_000,
    maxEntries: 8
  })

  await assert.rejects(
    () =>
      cache.get('failing-key', async () => {
        refreshCount += 1
        throw new Error('provider unavailable')
      }),
    /provider unavailable/
  )

  assert.equal(
    await cache.get('failing-key', async () => {
      refreshCount += 1
      return 'recovered'
    }),
    'recovered'
  )
  assert.equal(refreshCount, 2)
})

test('async TTL cache evicts the least recently used entry when capacity is exceeded', async () => {
  let refreshCount = 0
  const cache = createAsyncTtlCache<string, number>({
    ttlMs: 1_000,
    maxEntries: 2
  })
  const nextValue = async () => ++refreshCount

  assert.equal(await cache.get('first', nextValue), 1)
  assert.equal(await cache.get('second', nextValue), 2)
  assert.equal(await cache.get('first', nextValue), 1)
  assert.equal(await cache.get('third', nextValue), 3)
  assert.equal(await cache.get('second', nextValue), 4)
  assert.equal(refreshCount, 4)
})
