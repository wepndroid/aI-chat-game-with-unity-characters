import type { NextFunction, Request, Response } from 'express'
import { authConfig } from '../lib/auth-config'
import { resolveAuthenticatedSessionUser } from '../services/auth-service'

const isAdminBypassForTestingEnabled =
  process.env.ADMIN_TEST_BYPASS === 'true' || process.env.NEXT_PUBLIC_ADMIN_TEST_BYPASS === 'true'

const resolveTokenFromRequest = (request: Request) => {
  const tokenFromCookie = request.cookies?.[authConfig.cookieName]

  if (typeof tokenFromCookie === 'string' && tokenFromCookie.length > 0) {
    return tokenFromCookie
  }

  return null
}

const optionalAuth = (request: Request, _response: Response, next: NextFunction) => {
  const token = resolveTokenFromRequest(request)

  if (!token) {
    next()
    return
  }

  const run = async () => {
    const authenticatedSessionUser = await resolveAuthenticatedSessionUser(token)

    if (!authenticatedSessionUser) {
      request.authUser = undefined
      next()
      return
    }

    request.authUser = authenticatedSessionUser

    next()
  }

  run().catch(() => {
    request.authUser = undefined
    next()
  })
}

const requireAuth = (request: Request, response: Response, next: NextFunction) => {
  optionalAuth(request, response, () => {
    if (!request.authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    next()
  })
}

const requireAdmin = (request: Request, response: Response, next: NextFunction) => {
  requireAuth(request, response, () => {
    if (isAdminBypassForTestingEnabled) {
      next()
      return
    }

    if (!request.authUser?.isEmailVerified) {
      response.status(403).json({
        message: 'Email verification required.'
      })
      return
    }

    if (request.authUser?.role !== 'ADMIN') {
      response.status(403).json({
        message: 'Admin permission required.'
      })
      return
    }

    next()
  })
}

const requireVerifiedEmail = (request: Request, response: Response, next: NextFunction) => {
  requireAuth(request, response, () => {
    if (!request.authUser?.isEmailVerified) {
      response.status(403).json({
        message: 'Email verification required.'
      })
      return
    }

    next()
  })
}

export { optionalAuth, requireAdmin, requireAuth, requireVerifiedEmail }
