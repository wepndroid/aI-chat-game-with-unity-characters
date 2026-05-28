import type { NextFunction, Request, Response } from 'express'
import { sendApiError } from '../lib/api-contract'
import { isGameAccessAllowed, sendMembershipRequiredError } from '../lib/game-access'
import { resolveEffectiveMembershipTierForUser } from '../services/membership/membership-tier-service'

/**
 * Server-side game runtime entitlement boundary.
 *
 * Website browsing stays open to Free users, but Unity/Desktop/WebGL token minting
 * and expensive runtime generation must pass through this middleware so client-side
 * redirects, stale bearer tokens, or direct API calls cannot bypass membership.
 */
const requireGameAccess = async (request: Request, response: Response, next: NextFunction) => {
  const authUser = request.authUser
  if (!authUser) {
    sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
    return
  }

  const effectiveTierCode = await resolveEffectiveMembershipTierForUser(authUser.userId)
  if (!isGameAccessAllowed(effectiveTierCode)) {
    sendMembershipRequiredError(response)
    return
  }

  request.gameAccessContext = {
    effectiveTierCode
  }

  next()
}

export { requireGameAccess }
