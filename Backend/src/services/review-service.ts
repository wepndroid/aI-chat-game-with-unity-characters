import type { CharacterStatus, CharacterVisibility, Prisma, UserRole } from '@prisma/client'
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
  isPatreonGated: boolean
  minimumTierCents: number | null
}

type ReviewActor = {
  id: string
  role: UserRole
  isEmailVerified: boolean
}

const mapEntitlementTierCodeToCents = (tierCode: string) => {
  if (tierCode === 'secretwaifu_access') {
    return 1650
  }

  if (tierCode === 'just_models') {
    return 900
  }

  const explicitAmountMatch = tierCode.match(/(\d{3,5})/)

  if (explicitAmountMatch) {
    const parsedValue = Number.parseInt(explicitAmountMatch[1], 10)
    return Number.isNaN(parsedValue) ? 0 : parsedValue
  }

  return 0
}

const resolveBestPatreonTierCents = async (userId: string) => {
  const now = new Date()

  const [activeEntitlements, patreonAccount] = await Promise.all([
    prisma.entitlement.findMany({
      where: {
        userId,
        source: 'PATREON',
        status: 'ACTIVE',
        OR: [
          {
            validUntil: null
          },
          {
            validUntil: {
              gt: now
            }
          }
        ]
      },
      select: {
        tierCode: true
      }
    }),
    prisma.patreonAccount.findUnique({
      where: {
        userId
      },
      select: {
        tierCents: true,
        membershipStatus: true,
        nextChargeDate: true
      }
    })
  ])

  const entitlementTierCents = activeEntitlements.reduce((highestTierCents, entitlement) => {
    const entitlementTierCents = mapEntitlementTierCodeToCents(entitlement.tierCode)
    return Math.max(highestTierCents, entitlementTierCents)
  }, 0)

  const accountTierCents =
    patreonAccount?.membershipStatus === 'active_patron' &&
    (patreonAccount.nextChargeDate === null || patreonAccount.nextChargeDate > now) &&
    (patreonAccount.tierCents ?? 0) > 0
      ? patreonAccount.tierCents ?? 0
      : 0

  return Math.max(entitlementTierCents, accountTierCents)
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
      visibility: true,
      isPatreonGated: true,
      minimumTierCents: true
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

  const subscriptionTierCents = await resolveBestPatreonTierCents(userId)

  if (actor.role !== 'ADMIN' && subscriptionTierCents <= 0) {
    throw new ReviewVerificationError(403, 'An active Patreon subscription is required to post reviews.')
  }

  if (character.status !== 'APPROVED' || character.visibility !== 'PUBLIC') {
    throw new ReviewVerificationError(403, 'This character is not available for public reviews.')
  }

  if (character.ownerId === userId) {
    throw new ReviewVerificationError(403, 'You cannot review your own character.')
  }

  if (character.isPatreonGated && actor.role !== 'ADMIN') {
    const minimumTierCents = character.minimumTierCents ?? 1

    if (subscriptionTierCents < minimumTierCents) {
      throw new ReviewVerificationError(403, 'A higher Patreon tier is required to review this character.')
    }
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
  getReviewActorOrThrow,
  resolveBestPatreonTierCents
}
