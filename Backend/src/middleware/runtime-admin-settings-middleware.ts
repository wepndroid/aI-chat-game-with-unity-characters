import type { NextFunction, Request, Response } from 'express'
import { authConfig } from '../lib/auth-config'
import {
  getRuntimeAdminSettings as getRuntimeAdminSettingsDefault,
  type RuntimeAdminSettings
} from '../lib/runtime-admin-settings'
import {
  resolveAuthenticatedSessionUser as resolveAuthenticatedSessionUserDefault
} from '../services/auth-service'
import type { ResolveSessionResult } from '../services/auth-service'

type RuntimeAdminSettingsMiddlewareOptions = {
  getRuntimeAdminSettings?: () => Promise<RuntimeAdminSettings>
  resolveAuthenticatedSessionUser?: (sessionToken: string) => Promise<ResolveSessionResult>
}

const requestMinuteMap = new Map<string, { count: number; minuteKey: number }>()

const getClientIpFromRequest = (request: Request) => {
  const cfConnectingIp = request.header('cf-connecting-ip')?.trim()
  if (cfConnectingIp) {
    return cfConnectingIp
  }

  const forwardedFor = request.header('x-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()
  if (forwardedIp) {
    return forwardedIp
  }

  const ip = request.ip?.trim()
  if (ip) {
    return ip
  }

  const socketIp = request.socket.remoteAddress?.trim()
  return socketIp || 'unknown'
}

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

const isPassiveAuthProbeRoute = (path: string, method: string) => {
  const normalizedMethod = method.toUpperCase()
  const normalizedPath = path.toLowerCase()
  if (normalizedMethod !== 'GET') {
    return false
  }

  return normalizedPath === '/api/auth/me' || normalizedPath === '/api/auth/webgl-token'
}

const isAuthOrHealthRoute = (path: string) => {
  const normalizedPath = path.toLowerCase()
  return (
    normalizedPath.startsWith('/api/auth') ||
    normalizedPath.startsWith('/api/health') ||
    normalizedPath.startsWith('/auth') ||
    normalizedPath.startsWith('/health')
  )
}

const isHealthRoute = (path: string) => {
  const normalizedPath = path.toLowerCase()
  return normalizedPath.startsWith('/api/health') || normalizedPath.startsWith('/health')
}

/**
 * Builds the global runtime-admin policy middleware.
 *
 * Health routes are intentionally bypassed before reading settings. After a
 * Prisma engine panic, health probes are part of the shutdown/restart contract
 * and must not touch Prisma from this global middleware.
 */
const createRuntimeAdminSettingsMiddleware = (options: RuntimeAdminSettingsMiddlewareOptions = {}) => {
  const getRuntimeAdminSettings = options.getRuntimeAdminSettings ?? getRuntimeAdminSettingsDefault
  const resolveAuthenticatedSessionUser =
    options.resolveAuthenticatedSessionUser ?? resolveAuthenticatedSessionUserDefault

  return async (request: Request, response: Response, next: NextFunction) => {
    const method = request.method.toUpperCase()
    const path = request.path

    if (isHealthRoute(path)) {
      next()
      return
    }

    try {
      const settings = await getRuntimeAdminSettings()
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
      const authOrHealthRoute = isAuthOrHealthRoute(path)

      if (maintenanceActive && !adminBypass && !authOrHealthRoute) {
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

      if (isPassiveAuthProbeRoute(path, method)) {
        next()
        return
      }

      if (adminBypass) {
        next()
        return
      }

      const limiterScope = path.startsWith('/api/auth')
        ? 'auth'
        : path.startsWith('/api/characters/assets/upload')
          ? 'upload'
          : 'general'

      const actorKey =
        resolvedAuthUser && resolvedAuthUser !== 'banned'
          ? `user:${resolvedAuthUser.userId}`
          : `ip:${getClientIpFromRequest(request)}`
      const requestKey = `${actorKey}:${limiterScope}`
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
}

const runtimeAdminSettingsMiddleware = createRuntimeAdminSettingsMiddleware()

export {
  createRuntimeAdminSettingsMiddleware,
  runtimeAdminSettingsMiddleware
}
