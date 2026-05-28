type RuntimeAdminSettingsRefreshCacheOptions<T> = {
  clone: (value: T) => T
  nowMs?: () => number
  onStaleFallback?: (error: unknown) => void
  ttlMs: number
}

type RuntimeAdminSettingsRefreshCache<T> = {
  clear: () => void
  get: (refresh: () => Promise<T>) => Promise<T>
  set: (value: T) => void
}

/**
 * Small in-process cache that coalesces concurrent runtime-settings refreshes.
 *
 * Runtime settings are read on many API paths. Sharing one in-flight refresh
 * prevents cache-expiry bursts from turning into identical database reads while
 * still serving stale settings if a refresh fails after a previous good read.
 */
const createRuntimeAdminSettingsRefreshCache = <T>(
  options: RuntimeAdminSettingsRefreshCacheOptions<T>
): RuntimeAdminSettingsRefreshCache<T> => {
  let cachedValue: T | null = null
  let cachedValueExpiresAtMs = 0
  let inFlightRefresh: Promise<T> | null = null

  const nowMs = options.nowMs ?? Date.now

  const set = (value: T) => {
    cachedValue = options.clone(value)
    cachedValueExpiresAtMs = nowMs() + options.ttlMs
  }

  const get = async (refresh: () => Promise<T>) => {
    if (cachedValue && nowMs() < cachedValueExpiresAtMs) {
      return options.clone(cachedValue)
    }

    if (!inFlightRefresh) {
      inFlightRefresh = refresh()
        .then((value) => {
          set(value)
          return options.clone(value)
        })
        .catch((error: unknown) => {
          if (cachedValue) {
            options.onStaleFallback?.(error)
            return options.clone(cachedValue)
          }
          throw error
        })
        .finally(() => {
          inFlightRefresh = null
        })
    }

    return options.clone(await inFlightRefresh)
  }

  const clear = () => {
    cachedValue = null
    cachedValueExpiresAtMs = 0
    inFlightRefresh = null
  }

  return {
    clear,
    get,
    set
  }
}

export {
  createRuntimeAdminSettingsRefreshCache
}
export type {
  RuntimeAdminSettingsRefreshCache
}
