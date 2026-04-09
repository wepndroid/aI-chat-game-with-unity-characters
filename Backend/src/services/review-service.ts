import type { CharacterStatus, CharacterVisibility, UserRole } from '@prisma/client'
import { getEffectiveUserRoleForTesting } from '../lib/auth-config'
import { prisma } from '../lib/prisma'

class ReviewVerificationError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

type ReviewCharacter = {
  id: string
  ownerId: string
  status: CharacterStatus
  visibility: CharacterVisibility
}

type ReviewActor = {
  id: string
  role: UserRole
  isEmailVerified: boolean
}

const getReviewActorOrThrow = async (userId: string): Promise<ReviewActor> => {
  const actor = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      role: true,
      isEmailVerified: true
    }
  })

  if (!actor) {
    throw new ReviewVerificationError(401, 'Session user was not found.')
  }

  return {
    ...actor,
    role: getEffectiveUserRoleForTesting(actor.role)
  }
}

const getCharacterForReviewOrThrow = async (characterIdOrSlug: string): Promise<ReviewCharacter> => {
  const character = await prisma.character.findFirst({
    where: {
      OR: [{ id: characterIdOrSlug }, { slug: characterIdOrSlug }]
    },
    select: {
      id: true,
      ownerId: true,
      status: true,
      visibility: true
    }
  })

  if (!character) {
    throw new ReviewVerificationError(404, 'Character not found.')
  }

  return character
}

const assertReviewEligibility = async (userId: string, characterIdOrSlug: string) => {
  const [actor, character] = await Promise.all([getReviewActorOrThrow(userId), getCharacterForReviewOrThrow(characterIdOrSlug)])

  if (!actor.isEmailVerified) {
    throw new ReviewVerificationError(403, 'Please verify your e-mail before posting a review.')
  }

  if (character.status !== 'APPROVED') {
    throw new ReviewVerificationError(403, 'This character is not available for public reviews.')
  }

  if (character.ownerId === userId) {
    throw new ReviewVerificationError(403, 'You cannot review your own character.')
  }
}

const assertReviewOwnerOrAdmin = (reviewOwnerId: string, actorUserId: string, actorRole: UserRole) => {
  if (reviewOwnerId === actorUserId) {
    return
  }

  if (actorRole === 'ADMIN') {
    return
  }

  throw new ReviewVerificationError(403, 'You are not allowed to modify this review.')
}

export {
  ReviewVerificationError,
  assertReviewOwnerOrAdmin,
  assertReviewEligibility,
  getCharacterForReviewOrThrow,
  getReviewActorOrThrow
}
