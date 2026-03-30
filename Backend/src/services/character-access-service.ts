import type { CharacterStatus, CharacterVisibility, Prisma, UserRole } from '@prisma/client'
import { prisma } from '../lib/prisma'

type CharacterAccessActor = {
  userId: string
  role: UserRole
} | null

type CharacterAccessSubject = {
  id: string
  ownerId: string
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
  minimumTierCents: number | null
}

type ResolvedCharacterAccess = {
  canListCharacter: boolean
  canReadCharacter: boolean
  canAccessPrivateOrUnlisted: boolean
  canAccessPatreonGatedContent: boolean
  canCreateCharacter: boolean
  canModerateCharacterStatus: boolean
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

const canCreateCharacter = (actor: CharacterAccessActor) => {
  return Boolean(actor)
}

const canModerateCharacterStatus = (actor: CharacterAccessActor) => {
  return actor?.role === 'ADMIN'
}

const isPublicApprovedCharacter = (character: CharacterAccessSubject) => {
  return character.status === 'APPROVED' && character.visibility === 'PUBLIC'
}

const canAccessPrivateOrUnlisted = (actor: CharacterAccessActor, character: CharacterAccessSubject) => {
  if (!actor) {
    return false
  }

  if (actor.role === 'ADMIN') {
    return true
  }

  return actor.userId === character.ownerId
}

const canReadCharacter = (actor: CharacterAccessActor, character: CharacterAccessSubject) => {
  if (isPublicApprovedCharacter(character)) {
    return true
  }

  return canAccessPrivateOrUnlisted(actor, character)
}

const canAccessPatreonGatedContent = async (actor: CharacterAccessActor, character: CharacterAccessSubject) => {
  if (!character.isPatreonGated) {
    return true
  }

  if (!actor) {
    return false
  }

  if (actor.role === 'ADMIN' || actor.userId === character.ownerId) {
    return true
  }

  const minimumTierCents = character.minimumTierCents ?? 1
  const availableTierCents = await resolveBestPatreonTierCents(actor.userId)

  return availableTierCents >= minimumTierCents
}

const resolveCharacterAccess = async (actor: CharacterAccessActor, character: CharacterAccessSubject): Promise<ResolvedCharacterAccess> => {
  const canRead = canReadCharacter(actor, character)
  const canAccessPrivate = canAccessPrivateOrUnlisted(actor, character)
  const canAccessGated = canRead ? await canAccessPatreonGatedContent(actor, character) : false

  return {
    canListCharacter: canRead,
    canReadCharacter: canRead,
    canAccessPrivateOrUnlisted: canAccessPrivate,
    canAccessPatreonGatedContent: canAccessGated,
    canCreateCharacter: canCreateCharacter(actor),
    canModerateCharacterStatus: canModerateCharacterStatus(actor)
  }
}

type GalleryScope = 'all' | 'curated' | 'community' | 'mine'

/** Official (curated) gallery: VRMs owned by admin accounts. Community: owned by non-admin users. */
const buildPublicGalleryBranch = (galleryScope: GalleryScope): Prisma.CharacterWhereInput => {
  if (galleryScope === 'curated') {
    return {
      status: 'APPROVED',
      visibility: 'PUBLIC',
      owner: { role: 'ADMIN' }
    }
  }

  if (galleryScope === 'community') {
    return {
      status: 'APPROVED',
      visibility: 'PUBLIC',
      owner: { role: { not: 'ADMIN' } }
    }
  }

  return {
    status: 'APPROVED',
    visibility: 'PUBLIC'
  }
}

const buildCharacterListWhereClause = (
  actor: CharacterAccessActor,
  params: {
    status?: CharacterStatus
    visibility?: CharacterVisibility
    search?: string
    galleryScope?: GalleryScope
  }
) => {
  const galleryScope = params.galleryScope ?? 'all'
  const normalizedSearch = params.search?.trim()
  const searchClause = normalizedSearch
    ? {
        OR: [
          {
            name: {
              contains: normalizedSearch,
              mode: 'insensitive' as const
            }
          },
          {
            slug: {
              contains: normalizedSearch,
              mode: 'insensitive' as const
            }
          }
        ]
      }
    : {}

  const statusClause = params.status ? { status: params.status } : {}
  const visibilityClause = params.visibility ? { visibility: params.visibility } : {}

  if (actor?.role === 'ADMIN') {
    if (galleryScope === 'mine' && actor) {
      return {
        ownerId: actor.userId,
        ...searchClause,
        ...statusClause,
        ...visibilityClause
      } satisfies Prisma.CharacterWhereInput
    }

    if (galleryScope === 'curated') {
      return {
        owner: { role: 'ADMIN' },
        ...searchClause,
        ...statusClause,
        ...visibilityClause
      } satisfies Prisma.CharacterWhereInput
    }

    if (galleryScope === 'community') {
      return {
        owner: { role: { not: 'ADMIN' } },
        ...searchClause,
        ...statusClause,
        ...visibilityClause
      } satisfies Prisma.CharacterWhereInput
    }

    return {
      ...searchClause,
      ...statusClause,
      ...visibilityClause
    } satisfies Prisma.CharacterWhereInput
  }

  if (actor && galleryScope === 'mine') {
    return {
      ownerId: actor.userId,
      ...searchClause,
      ...statusClause,
      ...visibilityClause
    } satisfies Prisma.CharacterWhereInput
  }

  if (actor) {
    const publicBranch = buildPublicGalleryBranch(galleryScope)

    return {
      AND: [
        {
          OR: [
            {
              ownerId: actor.userId
            },
            publicBranch
          ]
        },
        searchClause,
        statusClause,
        visibilityClause
      ]
    } satisfies Prisma.CharacterWhereInput
  }

  return {
    ...buildPublicGalleryBranch(galleryScope),
    ...searchClause
  } satisfies Prisma.CharacterWhereInput
}

export { buildCharacterListWhereClause, canCreateCharacter, canModerateCharacterStatus, resolveCharacterAccess }
export type { CharacterAccessActor, CharacterAccessSubject, ResolvedCharacterAccess }
