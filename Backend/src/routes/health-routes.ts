import { Router, type Response } from 'express'
import {
  getFatalShutdownState as getProcessFatalShutdownState,
  type FatalShutdownState
} from '../lib/fatal-shutdown-controller'
import {
  getRuntimeAdminSettings as getDatabaseRuntimeAdminSettings,
  type RuntimeAdminSettings
} from '../lib/runtime-admin-settings'

const SERVICE_NAME = 'ai-chat-game-backend'

type CreateHealthRoutesOptions = {
  getFatalShutdownState?: () => FatalShutdownState | null
  getRuntimeAdminSettings?: () => Promise<RuntimeAdminSettings>
  now?: () => Date
}

const sendFatalShutdownResponse = (response: Response, fatalShutdown: FatalShutdownState, now: Date) => {
  response.status(503).json({
    status: 'terminating',
    reason: fatalShutdown.reason,
    service: SERVICE_NAME,
    timestamp: now.toISOString()
  })
}

const getActiveMaintenanceSnapshot = (settings: RuntimeAdminSettings, now: Date) => {
  const maintenance = settings.maintenance
  const nowMs = now.getTime()
  const startAtMs = maintenance.startAtIso ? Date.parse(maintenance.startAtIso) : NaN
  const endAtMs = maintenance.endAtIso ? Date.parse(maintenance.endAtIso) : NaN
  const inWindow =
    (Number.isNaN(startAtMs) || nowMs >= startAtMs) && (Number.isNaN(endAtMs) || nowMs <= endAtMs)

  return {
    active: maintenance.enabled && inWindow,
    message: maintenance.message
  }
}

/**
 * Builds backend health routes with explicit dependency seams for tests.
 *
 * Fatal shutdown state must be checked before DB-backed maintenance settings
 * reads. After a Prisma Query Engine panic, process restart is the recovery
 * boundary and health probes should not keep touching Prisma during the drain.
 */
const createHealthRoutes = (options: CreateHealthRoutesOptions = {}) => {
  const healthRoutes = Router()
  const getFatalShutdownState = options.getFatalShutdownState ?? getProcessFatalShutdownState
  const getRuntimeAdminSettings = options.getRuntimeAdminSettings ?? getDatabaseRuntimeAdminSettings
  const now = options.now ?? (() => new Date())

  healthRoutes.get('/health', (_request, response) => {
    const requestTime = now()
    const fatalShutdown = getFatalShutdownState()
    if (fatalShutdown) {
      sendFatalShutdownResponse(response, fatalShutdown, requestTime)
      return
    }

    response.json({
      status: 'ok',
      service: SERVICE_NAME,
      timestamp: requestTime.toISOString()
    })
  })

  /** Public maintenance snapshot (same window logic as runtime middleware). Skips auth; path is under /api/health so maintenance lock does not apply. */
  healthRoutes.get('/health/maintenance', async (_request, response, next) => {
    const requestTime = now()
    const fatalShutdown = getFatalShutdownState()
    if (fatalShutdown) {
      sendFatalShutdownResponse(response, fatalShutdown, requestTime)
      return
    }

    try {
      response.json({
        data: getActiveMaintenanceSnapshot(await getRuntimeAdminSettings(), requestTime)
      })
    } catch (error) {
      next(error)
    }
  })

  return healthRoutes
}

const healthRoutes = createHealthRoutes()

export { createHealthRoutes }
export type { CreateHealthRoutesOptions }
export default healthRoutes
