import { Router } from 'express'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'

const healthRoutes = Router()

healthRoutes.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'ai-chat-game-backend',
    timestamp: new Date().toISOString()
  })
})

/** Public maintenance snapshot (same window logic as runtime middleware). Skips auth; path is under /api/health so maintenance lock does not apply. */
healthRoutes.get('/health/maintenance', async (_request, response, next) => {
  try {
    const settings = await getRuntimeAdminSettings()
    const maintenance = settings.maintenance
    const nowMs = Date.now()
    const startAtMs = maintenance.startAtIso ? Date.parse(maintenance.startAtIso) : NaN
    const endAtMs = maintenance.endAtIso ? Date.parse(maintenance.endAtIso) : NaN
    const inWindow =
      (Number.isNaN(startAtMs) || nowMs >= startAtMs) && (Number.isNaN(endAtMs) || nowMs <= endAtMs)
    const active = maintenance.enabled && inWindow

    response.json({
      data: {
        active,
        message: maintenance.message
      }
    })
  } catch (error) {
    next(error)
  }
})

export default healthRoutes
