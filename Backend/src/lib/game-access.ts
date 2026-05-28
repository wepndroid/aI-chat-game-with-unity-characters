import type { Request, Response } from 'express'
import { MINIMUM_GAME_ACCESS_TIER, canTierAccessGame, type EffectiveMembershipTierCode } from './membership-tier-policy'
import { sendApiError } from './api-contract'

const MEMBERSHIP_REQUIRED_CODE = 'MEMBERSHIP_REQUIRED'
const MEMBERSHIP_REQUIRED_MESSAGE = 'Start a membership first to play SecretWaifu.'
const MEMBERSHIP_ROUTE = '/members'

const buildMembershipRequiredDetails = () => ({
  required_tier: MINIMUM_GAME_ACCESS_TIER,
  membership_url: MEMBERSHIP_ROUTE
})

const sendMembershipRequiredError = (response: Response) => {
  sendApiError(
    response,
    403,
    MEMBERSHIP_REQUIRED_CODE,
    MEMBERSHIP_REQUIRED_MESSAGE,
    buildMembershipRequiredDetails()
  )
}

const isGameAccessAllowed = (tierCode: EffectiveMembershipTierCode | null | undefined) => {
  return canTierAccessGame(tierCode)
}

type GameAccessRequestContext = {
  /**
   * Effective authenticated runtime tier captured by requireGameAccess.
   * Downstream provider adapters must derive routing from this server-owned
   * value instead of public request bodies or quota display strings.
   */
  effectiveTierCode: EffectiveMembershipTierCode
}

const getRequiredGameAccessContext = (request: Request): GameAccessRequestContext => {
  if (!request.gameAccessContext) {
    throw new Error('Game access context is missing. Ensure requireGameAccess runs before this route.')
  }

  return request.gameAccessContext
}

export {
  MEMBERSHIP_REQUIRED_CODE,
  MEMBERSHIP_REQUIRED_MESSAGE,
  MEMBERSHIP_ROUTE,
  buildMembershipRequiredDetails,
  getRequiredGameAccessContext,
  isGameAccessAllowed,
  sendMembershipRequiredError
}
export type { GameAccessRequestContext }
