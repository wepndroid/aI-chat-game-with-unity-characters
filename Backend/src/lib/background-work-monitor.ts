type BackgroundWorkMonitorLogger = Pick<Console, 'warn'>

type BackgroundWorkMonitorOptions = {
  logger?: BackgroundWorkMonitorLogger
  nowMs?: () => number
  slowOperationMs?: number
}

type ObservedBackgroundWorkRunner = <T>(
  operationName: string,
  work: () => Promise<T>,
  options?: BackgroundWorkMonitorOptions
) => Promise<T>

type SafeBackgroundWorkErrorSummary = {
  errorName?: string
  errorCode?: string
}

const DEFAULT_BACKGROUND_WORK_SLOW_OPERATION_MS = 750

const getStringProperty = (error: unknown, propertyName: string) => {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const value = (error as Record<string, unknown>)[propertyName]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

const toSafeBackgroundWorkErrorSummary = (error: unknown): SafeBackgroundWorkErrorSummary => {
  const errorName = error instanceof Error && error.name.trim().length > 0
    ? error.name
    : getStringProperty(error, 'name')

  return {
    ...(errorName ? { errorName } : {}),
    ...(getStringProperty(error, 'code') ? { errorCode: getStringProperty(error, 'code') } : {})
  }
}

/**
 * Observes a complete background worker tick without changing scheduling.
 *
 * This helper is intentionally not a critical-section primitive: it does not
 * gate, queue, throttle, or retry work. Use it only around full worker ticks so
 * slow/failure logs describe the worker as a whole, including any provider I/O,
 * without implying the elapsed time was spent inside the database.
 */
const runObservedBackgroundWork: ObservedBackgroundWorkRunner = async (
  operationName,
  work,
  options = {}
) => {
  const logger = options.logger ?? console
  const nowMs = options.nowMs ?? Date.now
  const slowOperationMs = options.slowOperationMs ?? DEFAULT_BACKGROUND_WORK_SLOW_OPERATION_MS
  const startedAtMs = nowMs()

  try {
    const value = await work()
    const elapsedMs = nowMs() - startedAtMs
    if (elapsedMs >= slowOperationMs) {
      logger.warn('[background] Slow background work completed.', {
        operationName,
        elapsedMs,
        outcome: 'completed'
      })
    }
    return value
  } catch (error) {
    const elapsedMs = nowMs() - startedAtMs
    logger.warn('[background] Background work failed.', {
      operationName,
      elapsedMs,
      outcome: 'failed',
      error: toSafeBackgroundWorkErrorSummary(error)
    })
    throw error
  }
}

export {
  DEFAULT_BACKGROUND_WORK_SLOW_OPERATION_MS,
  runObservedBackgroundWork,
  toSafeBackgroundWorkErrorSummary
}
export type {
  BackgroundWorkMonitorOptions,
  ObservedBackgroundWorkRunner,
  SafeBackgroundWorkErrorSummary
}
