import { EMAIL_VERIFICATION_PROFILE_HREF, REGISTERED_CHARACTER_SIGN_UP_HREF } from '@/lib/registered-character-access'
import type { CharacterActionAccess } from '@/lib/character-api'
import { MEMBERSHIP_ROUTE } from '@/lib/membership-access'

type CharacterActionSessionUser = {
  id: string
  isEmailVerified: boolean
} | null

type StartChatInterception =
  | { action: 'email-verification' }
  | { action: 'missing-story' }
  | { action: 'unavailable' }

const buildStoryLaunchHref = (storyId: string) => {
  return `/play?launchStoryId=${encodeURIComponent(storyId)}`
}

const resolveStartChatHref = (
  sessionUser: CharacterActionSessionUser,
  access: Pick<
    CharacterActionAccess,
    'can_start_chat' | 'start_chat_requires_verified_email' | 'start_chat_unavailable_reason'
  >,
  storyId: string | null
) => {
  if (!sessionUser) {
    return REGISTERED_CHARACTER_SIGN_UP_HREF
  }

  if (!sessionUser.isEmailVerified || access.start_chat_requires_verified_email) {
    return EMAIL_VERIFICATION_PROFILE_HREF
  }

  if (!storyId) {
    return null
  }

  if (!access.can_start_chat && access.start_chat_unavailable_reason === 'MEMBERSHIP_REQUIRED') {
    return MEMBERSHIP_ROUTE
  }

  if (!access.can_start_chat && access.start_chat_unavailable_reason === 'NOT_APPROVED') {
    return null
  }

  return buildStoryLaunchHref(storyId)
}

const resolveStartChatInterception = (
  sessionUser: CharacterActionSessionUser,
  access: Pick<
    CharacterActionAccess,
    'can_start_chat' | 'start_chat_requires_verified_email' | 'start_chat_unavailable_reason'
  >,
  storyId: string | null
): StartChatInterception | null => {
  if (!sessionUser) {
    return null
  }

  if (!sessionUser.isEmailVerified || access.start_chat_requires_verified_email) {
    return { action: 'email-verification' }
  }

  if (!storyId) {
    return { action: 'missing-story' }
  }

  if (!access.can_start_chat) {
    if (access.start_chat_unavailable_reason === 'MEMBERSHIP_REQUIRED') {
      return null
    }

    if (access.start_chat_unavailable_reason === 'NO_PLAYABLE_STORY') {
      return null
    }

    return { action: 'unavailable' }
  }

  return null
}

export {
  buildStoryLaunchHref,
  resolveStartChatHref,
  resolveStartChatInterception
}
export type {
  CharacterActionSessionUser,
  StartChatInterception
}
