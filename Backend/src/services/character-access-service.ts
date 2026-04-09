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

/** Approved characters are visible in the public catalog; visibility is always treated as public. */
const isPublicApprovedCharacter = (character: CharacterAccessSubject) => {
  return character.status === 'APPROVED'
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
      owner: { role: 'ADMIN' }
    }
  }

  if (galleryScope === 'community') {
    return {
      status: 'APPROVED',
      owner: { role: { not: 'ADMIN' } }
    }
  }

  return {
    status: 'APPROVED'
  }
}

const buildCharacterListWhereClause = (
  actor: CharacterAccessActor,
  params: {
    status?: CharacterStatus
    search?: string
    galleryScope?: GalleryScope
    /** Restrict list to this user’s characters (caller must authorize: self or admin). */
    listOwnerId?: string
    /** When true, admin `curated` lists every admin-owned row (admin UI). Default catalog omits non–public-approved. */
    adminCuratedAll?: boolean
    /** When true, admin `community` lists every non-admin-owned row (moderation UI). Default matches public Community tab. */
    adminCommunityAll?: boolean
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

  if (params.listOwnerId) {
    return {
      ownerId: params.listOwnerId,
      ...searchClause,
      ...statusClause
    } satisfies Prisma.CharacterWhereInput
  }

  if (actor?.role === 'ADMIN') {
    if (galleryScope === 'all') {
      return {
        ...buildPublicGalleryBranch('all'),
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }

    if (galleryScope === 'mine' && actor) {
      return {
        ownerId: actor.userId,
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }

    if (galleryScope === 'curated') {
      const catalogOnly = !params.adminCuratedAll && params.status === undefined

      return {
        owner: { role: 'ADMIN' },
        ...(catalogOnly
          ? {
              status: 'APPROVED'
            }
          : {}),
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }

    if (galleryScope === 'community') {
      const catalogOnly = !params.adminCommunityAll && params.status === undefined

      return {
        owner: { role: { not: 'ADMIN' } },
        ...(params.adminCommunityAll && params.status === undefined
          ? {
              status: {
                not: 'REJECTED'
              }
            }
          : {}),
        ...(catalogOnly
          ? {
              status: 'APPROVED'
            }
          : {}),
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }

    return {
      ...searchClause,
      ...statusClause
    } satisfies Prisma.CharacterWhereInput
  }

  if (actor && galleryScope === 'mine') {
    return {
      ownerId: actor.userId,
      ...searchClause,
      ...statusClause
    } satisfies Prisma.CharacterWhereInput
  }

  if (actor) {
    // Keep public gallery tabs catalog-pure for signed-in users.
    // Personal rows belong to the dedicated "Your Characters" tab.
    if (galleryScope === 'all' || galleryScope === 'curated' || galleryScope === 'community') {
      return {
        ...buildPublicGalleryBranch(galleryScope),
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }
  }

  return {
    ...buildPublicGalleryBranch(galleryScope),
    ...searchClause
  } satisfies Prisma.CharacterWhereInput
}

export { buildCharacterListWhereClause, canCreateCharacter, canModerateCharacterStatus, resolveCharacterAccess }
export type { CharacterAccessActor, CharacterAccessSubject, ResolvedCharacterAccess }
