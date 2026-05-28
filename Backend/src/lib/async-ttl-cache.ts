type AsyncTtlCacheOptions<TValue> = {
  ttlMs: number
  maxEntries: number
  nowMs?: () => number
  clone?: (value: TValue) => TValue
}

type AsyncTtlCache<TKey extends string, TValue> = {
  get(key: TKey, refresh: () => Promise<TValue>): Promise<TValue>
  clear(): void
  delete(key: TKey): boolean
  size(): number
}

type CacheEntry<TValue> = {
  value: TValue
  expiresAt: number
}

/**
 * Creates a small process-local async cache for derived, non-authoritative values.
 *
 * The cache coalesces concurrent refreshes by key, applies TTL expiry, and evicts
 * least-recently-used entries when capacity is exceeded. Keys should contain only
 * non-secret values; callers that cache prompt-derived data must hash or redact
 * prompt text before constructing a key.
 */
const createAsyncTtlCache = <TKey extends string, TValue>(
  options: AsyncTtlCacheOptions<TValue>
): AsyncTtlCache<TKey, TValue> => {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
    throw new Error('Async TTL cache requires a positive ttlMs.')
  }
  if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
    throw new Error('Async TTL cache requires a positive integer maxEntries.')
  }

  const nowMs = options.nowMs ?? Date.now
  const clone = options.clone ?? ((value: TValue) => value)
  const entries = new Map<TKey, CacheEntry<TValue>>()
  const inFlight = new Map<TKey, Promise<TValue>>()

  const touch = (key: TKey, entry: CacheEntry<TValue>) => {
    entries.delete(key)
    entries.set(key, entry)
  }

  const remember = (key: TKey, value: TValue) => {
    entries.set(key, {
      value: clone(value),
      expiresAt: nowMs() + options.ttlMs
    })

    while (entries.size > options.maxEntries) {
      const oldest = entries.keys().next().value
      if (oldest === undefined) {
        break
      }
      entries.delete(oldest)
    }
  }

  return {
    async get(key, refresh) {
      const cached = entries.get(key)
      if (cached) {
        if (cached.expiresAt > nowMs()) {
          touch(key, cached)
          return clone(cached.value)
        }
        entries.delete(key)
      }

      const currentRefresh = inFlight.get(key)
      if (currentRefresh) {
        return currentRefresh.then(clone)
      }

      const refreshPromise = refresh()
        .then(value => {
          remember(key, value)
          const stored = entries.get(key)
          return stored ? stored.value : value
        })
        .finally(() => {
          inFlight.delete(key)
        })

      inFlight.set(key, refreshPromise)
      return refreshPromise.then(clone)
    },

    clear() {
      entries.clear()
      inFlight.clear()
    },

    delete(key) {
      inFlight.delete(key)
      return entries.delete(key)
    },

    size() {
      return entries.size
    }
  }
}

export { createAsyncTtlCache }
export type { AsyncTtlCache, AsyncTtlCacheOptions }
