import type { CharacterStatus, CharacterVisibility, UserRole } from '@prisma/client'

type CharacterReadActor = {
  userId: string
  role: UserRole
} | null

type CharacterAccessActor = {
  userId: string
  role: UserRole
  isEmailVerified: boolean
} | null

type CharacterAccessSubject = {
  id: string
  ownerId: string
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated?: boolean
}

type CharacterActionContext = {
  hasPlayableStory?: boolean
  hasModel?: boolean
  canAccessGame?: boolean
}

type CharacterAccessUnavailableReason =
  | 'AUTH_REQUIRED'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'MEMBERSHIP_REQUIRED'
  | 'NOT_APPROVED'
  | 'NO_PLAYABLE_STORY'
  | 'NO_MODEL'
  | null

type ResolvedCharacterAccess = {
  canListCharacter: boolean
  canReadCharacter: boolean
  canAccessPrivateOrUnlisted: boolean
  canCreateCharacter: boolean
  canModerateCharacterStatus: boolean
  canStartChat: boolean
  startChatRequiresAuth: boolean
  startChatRequiresVerifiedEmail: boolean
  startChatUnavailableReason: CharacterAccessUnavailableReason
  canPreviewModel: boolean
  previewModelRequiresAuth: boolean
  previewModelRequiresVerifiedEmail: boolean
  previewModelUnavailableReason: CharacterAccessUnavailableReason
}

const canCreateCharacter = (actor: CharacterAccessActor) => {
  return Boolean(actor)
}

const canModerateCharacterStatus = (actor: CharacterAccessActor) => {
  return actor?.role === 'ADMIN'
}

/** Public approved characters are readable by anonymous visitors; other visibility levels require an actor. */
const isPublicApprovedCharacter = (character: CharacterAccessSubject) => {
  return character.status === 'APPROVED' && character.visibility === 'PUBLIC'
}

const canAccessPrivateOrUnlisted = (actor: CharacterReadActor, character: CharacterAccessSubject) => {
  if (!actor) {
    return false
  }

  if (actor.role === 'ADMIN') {
    return true
  }

  return actor.userId === character.ownerId
}

/**
 * Object-level character read policy shared by character routes and composed
 * resources such as stories. Chat and model-preview gates add stricter
 * email/membership checks after this resource visibility decision.
 */
const canReadCharacter = (actor: CharacterReadActor, character: CharacterAccessSubject) => {
  if (isPublicApprovedCharacter(character)) {
    return true
  }

  if (character.status === 'APPROVED' && character.visibility === 'UNLISTED' && actor) {
    return true
  }

  return canAccessPrivateOrUnlisted(actor, character)
}

const resolveStartChatUnavailableReason = (
  actor: CharacterAccessActor,
  character: CharacterAccessSubject,
  canRead: boolean,
  context: CharacterActionContext
): CharacterAccessUnavailableReason => {
  if (!canRead || character.status !== 'APPROVED') {
    return 'NOT_APPROVED'
  }

  if (!actor) {
    return 'AUTH_REQUIRED'
  }

  if (!actor.isEmailVerified) {
    return 'EMAIL_VERIFICATION_REQUIRED'
  }

  if (context.canAccessGame === false) {
    return 'MEMBERSHIP_REQUIRED'
  }

  if (!context.hasPlayableStory) {
    return 'NO_PLAYABLE_STORY'
  }

  return null
}

const resolvePreviewModelUnavailableReason = (
  actor: CharacterAccessActor,
  character: CharacterAccessSubject,
  canRead: boolean,
  context: CharacterActionContext
): CharacterAccessUnavailableReason => {
  if (!canRead || character.status !== 'APPROVED') {
    return 'NOT_APPROVED'
  }

  if (!actor) {
    return 'AUTH_REQUIRED'
  }

  if (!actor.isEmailVerified) {
    return 'EMAIL_VERIFICATION_REQUIRED'
  }

  if (!context.hasModel) {
    return 'NO_MODEL'
  }

  return null
}

const resolveCharacterAccess = (
  actor: CharacterAccessActor,
  character: CharacterAccessSubject,
  context: CharacterActionContext = {}
): ResolvedCharacterAccess => {
  const canRead = canReadCharacter(actor, character)
  const canAccessPrivate = canAccessPrivateOrUnlisted(actor, character)
  const startChatUnavailableReason = resolveStartChatUnavailableReason(actor, character, canRead, context)
  const previewModelUnavailableReason = resolvePreviewModelUnavailableReason(actor, character, canRead, context)

  return {
    canListCharacter: canRead,
    canReadCharacter: canRead,
    canAccessPrivateOrUnlisted: canAccessPrivate,
    canCreateCharacter: canCreateCharacter(actor),
    canModerateCharacterStatus: canModerateCharacterStatus(actor),
    canStartChat: startChatUnavailableReason === null,
    startChatRequiresAuth: startChatUnavailableReason === 'AUTH_REQUIRED',
    startChatRequiresVerifiedEmail: startChatUnavailableReason === 'EMAIL_VERIFICATION_REQUIRED',
    startChatUnavailableReason,
    canPreviewModel: previewModelUnavailableReason === null,
    previewModelRequiresAuth: previewModelUnavailableReason === 'AUTH_REQUIRED',
    previewModelRequiresVerifiedEmail: previewModelUnavailableReason === 'EMAIL_VERIFICATION_REQUIRED',
    previewModelUnavailableReason
  }
}

export {
  canReadCharacter,
  canCreateCharacter,
  canModerateCharacterStatus,
  resolveCharacterAccess
}
export type {
  CharacterAccessActor,
  CharacterReadActor,
  CharacterAccessSubject,
  CharacterActionContext,
  CharacterAccessUnavailableReason,
  ResolvedCharacterAccess
}
