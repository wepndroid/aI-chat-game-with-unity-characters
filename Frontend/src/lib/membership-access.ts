import type { SessionUser } from '@/lib/session-user'

const MEMBERSHIP_ROUTE = '/members'
const MEMBERSHIP_REQUIRED_CODE = 'MEMBERSHIP_REQUIRED'
const MEMBERSHIP_REQUIRED_MESSAGE = 'Start a membership first to play SecretWaifu.'

const canSessionUserAccessGame = (sessionUser: Pick<SessionUser, 'role' | 'effectiveTierCode'> | null | undefined) => {
  if (!sessionUser) {
    return false
  }

  if (sessionUser.role === 'ADMIN') {
    return true
  }

  const tierCode = sessionUser.effectiveTierCode?.trim().toLowerCase()
  return tierCode === 'basic' || tierCode === 'premium' || tierCode === 'admin'
}

export {
  MEMBERSHIP_REQUIRED_CODE,
  MEMBERSHIP_REQUIRED_MESSAGE,
  MEMBERSHIP_ROUTE,
  canSessionUserAccessGame
}
