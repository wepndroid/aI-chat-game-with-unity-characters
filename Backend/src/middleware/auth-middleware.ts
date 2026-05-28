import type { NextFunction, Request, Response } from 'express'
import { authConfig } from '../lib/auth-config'
import { sendApiError } from '../lib/api-contract'
import { sendBannedAccountForbidden } from '../lib/banned-account-response'
import { resolveAuthenticatedSessionUser } from '../services/auth-service'

/**
 * Session resolution (`optionalAuth` / `requireAuth`) loads the user and checks `user.isBanned`.
 * Banned users always get 403 + `ACCOUNT_BANNED` before route handlers run.
 */

const resolveTokenFromRequest = (request: Request) => {
  const tokenFromCookie = request.cookies?.[authConfig.cookieName]

  if (typeof tokenFromCookie === 'string' && tokenFromCookie.length > 0) {
    return tokenFromCookie
  }

  const authHeader = request.header('authorization')
  if (authHeader && authHeader.length > 0) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
    if (match?.[1]) {
      const bearer = match[1].trim()
      if (bearer.length > 0) {
        return bearer
      }
    }
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

    if (authenticatedSessionUser === 'banned') {
      sendBannedAccountForbidden(_response)
      return
    }

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
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    next()
  })
}

const requireAdmin = (request: Request, response: Response, next: NextFunction) => {
  requireAuth(request, response, () => {
    if (request.authUser?.role !== 'ADMIN') {
      sendApiError(response, 403, 'FORBIDDEN', 'Forbidden.')
      return
    }

    next()
  })
}

const requireVerifiedEmail = (request: Request, response: Response, next: NextFunction) => {
  requireAuth(request, response, () => {
    if (!request.authUser?.isEmailVerified) {
      sendApiError(response, 403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification required.')
      return
    }

    next()
  })
}

export { optionalAuth, requireAdmin, requireAuth, requireVerifiedEmail }
