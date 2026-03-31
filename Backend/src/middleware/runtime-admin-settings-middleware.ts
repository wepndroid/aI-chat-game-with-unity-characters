import type { NextFunction, Request, Response } from 'express'
import { authConfig } from '../lib/auth-config'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { resolveAuthenticatedSessionUser } from '../services/auth-service'

const requestMinuteMap = new Map<string, { count: number; minuteKey: number }>()

const resolveTokenFromRequest = (request: Request) => {
  const tokenFromCookie = request.cookies?.[authConfig.cookieName]
  if (typeof tokenFromCookie === 'string' && tokenFromCookie.length > 0) {
    return tokenFromCookie
  }
  return null
}

const isRoutePrefixMatch = (path: string, prefix: string) => {
  const normalizedPrefix = prefix.trim()
  return normalizedPrefix.length > 0 && path.startsWith(normalizedPrefix)
}

const runtimeAdminSettingsMiddleware = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const settings = await getRuntimeAdminSettings()
    const method = request.method.toUpperCase()
    const path = request.path
    const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
    const now = new Date()
    const nowMs = now.getTime()
    const minuteKey = Math.floor(nowMs / 60000)

    const sessionToken = resolveTokenFromRequest(request)
    const resolvedAuthUser = sessionToken ? await resolveAuthenticatedSessionUser(sessionToken).catch(() => null) : null
    const isAdminUser = Boolean(resolvedAuthUser && resolvedAuthUser !== 'banned' && resolvedAuthUser.role === 'ADMIN')

    const maintenance = settings.maintenance
    const startAtMs = maintenance.startAtIso ? Date.parse(maintenance.startAtIso) : NaN
    const endAtMs = maintenance.endAtIso ? Date.parse(maintenance.endAtIso) : NaN
    const inWindow =
      (Number.isNaN(startAtMs) || nowMs >= startAtMs) && (Number.isNaN(endAtMs) || nowMs <= endAtMs)
    const maintenanceActive = maintenance.enabled && inWindow
    /** Admins always bypass maintenance, read-only mode, and route blocks so they can operate the site. */
    const adminBypass = isAdminUser
    const isAuthOrHealthRoute = path.startsWith('/api/auth') || path.startsWith('/api/health')

    if (maintenanceActive && !adminBypass && !isAuthOrHealthRoute) {
      response.status(503).json({
        message: maintenance.message,
        code: 'MAINTENANCE_MODE'
      })
      return
    }

    if (maintenance.readOnlyMode && !adminBypass && isWrite) {
      response.status(503).json({
        message: 'Read-only maintenance mode is enabled. Please try again later.',
        code: 'READ_ONLY_MODE'
      })
      return
    }

    if (!adminBypass && maintenance.blockedRoutePrefixes.some((prefix) => isRoutePrefixMatch(path, prefix))) {
      response.status(503).json({
        message: 'This route is temporarily blocked by maintenance policy.',
        code: 'MAINTENANCE_ROUTE_BLOCKED'
      })
      return
    }

    if (!settings.featureSwitches.publicUploadsEnabled && (path.startsWith('/api/characters/assets/upload') || (path === '/api/characters' && isWrite))) {
      response.status(503).json({
        message: 'Public uploads are currently disabled.',
        code: 'FEATURE_DISABLED_PUBLIC_UPLOADS'
      })
      return
    }

    if (!settings.featureSwitches.communityPageEnabled && path === '/api/characters' && method === 'GET') {
      const galleryScopeRaw = request.query.galleryScope
      const galleryScope = typeof galleryScopeRaw === 'string' ? galleryScopeRaw.toLowerCase() : ''
      if (galleryScope === 'community') {
        response.status(503).json({
          message: 'Community gallery is currently disabled.',
          code: 'FEATURE_DISABLED_COMMUNITY_PAGE'
        })
        return
      }
    }

    const perMinuteLimit = path.startsWith('/api/auth')
      ? settings.requestLimits.authPerMinute
      : path.startsWith('/api/characters/assets/upload')
        ? settings.requestLimits.uploadPerMinute
        : settings.requestLimits.generalPerMinute

    const requestKey = `${request.ip || 'unknown'}:${path.startsWith('/api/auth') ? 'auth' : path.startsWith('/api/characters/assets/upload') ? 'upload' : 'general'}`
    const current = requestMinuteMap.get(requestKey)
    if (!current || current.minuteKey !== minuteKey) {
      requestMinuteMap.set(requestKey, { count: 1, minuteKey })
    } else {
      current.count += 1
      if (current.count > perMinuteLimit) {
        response.status(429).json({
          message: 'Too many requests. Please slow down and try again shortly.',
          code: 'RATE_LIMITED'
        })
        return
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}

export { runtimeAdminSettingsMiddleware }
