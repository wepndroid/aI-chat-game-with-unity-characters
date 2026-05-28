import { Prisma } from '@prisma/client'
import type { CharacterStatus, CharacterVisibility, UserRole } from '@prisma/client'
import { postgresEnumValue } from '../../lib/database/postgres-sql'
import type { CharacterAccessActor } from './character-access-policy'

type GalleryScope = 'all' | 'curated' | 'community' | 'mine'

type CharacterListQueryParams = {
  status?: CharacterStatus
  search?: string
  galleryScope?: GalleryScope
  /** Restrict list to this user’s characters (caller must authorize: self or admin). */
  listOwnerId?: string
  /** When true, admin `curated` lists every admin-owned row (admin UI). Default catalog omits non-public-approved. */
  adminCuratedAll?: boolean
  /** When true, admin `community` lists every non-admin-owned row (moderation UI). Default matches public Community tab. */
  adminCommunityAll?: boolean
}

const buildVisibleApprovedCatalogClause = (actor: CharacterAccessActor): Prisma.CharacterWhereInput => ({
  status: 'APPROVED',
  visibility: actor ? { in: ['PUBLIC', 'UNLISTED'] satisfies CharacterVisibility[] } : 'PUBLIC'
})

const escapeSqlLikePattern = (value: string) => value.replace(/[\\%_]/g, (match) => `\\${match}`)

const joinSqlConditions = (conditions: Prisma.Sql[]) => {
  return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
}

const characterStatusValue = (status: CharacterStatus) => postgresEnumValue(status, 'CharacterStatus')
const characterVisibilityValue = (visibility: CharacterVisibility) => postgresEnumValue(visibility, 'CharacterVisibility')
const userRoleValue = (role: UserRole) => postgresEnumValue(role, 'UserRole')

const addStatusSqlCondition = (conditions: Prisma.Sql[], status: CharacterStatus) => {
  conditions.push(Prisma.sql`c."status" = ${characterStatusValue(status)}`)
}

const addSearchSqlCondition = (conditions: Prisma.Sql[], search: string | undefined) => {
  const normalizedSearch = search?.trim()
  if (!normalizedSearch) {
    return
  }

  const pattern = `%${escapeSqlLikePattern(normalizedSearch)}%`
  conditions.push(Prisma.sql`(c."name" LIKE ${pattern} ESCAPE '\' OR c."slug" LIKE ${pattern} ESCAPE '\')`)
}

const addCatalogVisibilitySqlCondition = (conditions: Prisma.Sql[], actor: CharacterAccessActor) => {
  if (actor) {
    conditions.push(
      Prisma.sql`c."visibility" IN (${Prisma.join((['PUBLIC', 'UNLISTED'] satisfies CharacterVisibility[]).map(characterVisibilityValue))})`
    )
    return
  }

  conditions.push(Prisma.sql`c."visibility" = ${characterVisibilityValue('PUBLIC')}`)
}

const addVisibleApprovedCatalogSqlConditions = (conditions: Prisma.Sql[], actor: CharacterAccessActor) => {
  addStatusSqlCondition(conditions, 'APPROVED')
  addCatalogVisibilitySqlCondition(conditions, actor)
}

/** Official (curated) gallery: VRMs owned by admin accounts. Community: owned by non-admin users. */
const addPublicGallerySqlConditions = (
  conditions: Prisma.Sql[],
  actor: CharacterAccessActor,
  galleryScope: Exclude<GalleryScope, 'mine'>,
  status: CharacterStatus
) => {
  addStatusSqlCondition(conditions, status)
  addCatalogVisibilitySqlCondition(conditions, actor)

  if (galleryScope === 'curated') {
    conditions.push(Prisma.sql`owner."role" = ${userRoleValue('ADMIN')}`)
  }

  if (galleryScope === 'community') {
    conditions.push(Prisma.sql`owner."role" != ${userRoleValue('ADMIN')}`)
  }
}

/** Official (curated) gallery: VRMs owned by admin accounts. Community: owned by non-admin users. */
const buildPublicGalleryBranch = (actor: CharacterAccessActor, galleryScope: GalleryScope): Prisma.CharacterWhereInput => {
  const visibleApprovedCatalogClause = buildVisibleApprovedCatalogClause(actor)

  if (galleryScope === 'curated') {
    return {
      ...visibleApprovedCatalogClause,
      owner: { role: 'ADMIN' }
    }
  }

  if (galleryScope === 'community') {
    return {
      ...visibleApprovedCatalogClause,
      owner: { role: { not: 'ADMIN' } }
    }
  }

  return visibleApprovedCatalogClause
}

const buildCharacterListWhereClause = (
  actor: CharacterAccessActor,
  params: CharacterListQueryParams
) => {
  const galleryScope = params.galleryScope ?? 'all'
  const normalizedSearch = params.search?.trim()
  const searchClause = normalizedSearch
    ? {
        OR: [
          {
            name: {
              contains: normalizedSearch
            }
          },
          {
            slug: {
              contains: normalizedSearch
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
        ...buildPublicGalleryBranch(actor, 'all'),
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
        ...(catalogOnly ? buildVisibleApprovedCatalogClause(actor) : {}),
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
        ...(catalogOnly ? buildVisibleApprovedCatalogClause(actor) : {}),
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
        ...buildPublicGalleryBranch(actor, galleryScope),
        ...searchClause,
        ...statusClause
      } satisfies Prisma.CharacterWhereInput
    }
  }

  return {
    ...buildPublicGalleryBranch(actor, galleryScope),
    ...searchClause
  } satisfies Prisma.CharacterWhereInput
}

/**
 * Builds the raw-SQL WHERE fragment for the aggregate popular-character query.
 *
 * This is the SQL companion to `buildCharacterListWhereClause()`. Keep catalog
 * visibility semantics in sync between both helpers so optimized popular lists
 * cannot bypass the authorization rules used by the Prisma-backed list path.
 */
const buildPopularCharacterListWhereSql = (
  actor: CharacterAccessActor,
  params: CharacterListQueryParams
): Prisma.Sql => {
  const conditions: Prisma.Sql[] = []
  const galleryScope = params.galleryScope ?? 'all'

  if (params.listOwnerId) {
    conditions.push(Prisma.sql`c."ownerId" = ${params.listOwnerId}`)
    addSearchSqlCondition(conditions, params.search)
    if (params.status) {
      addStatusSqlCondition(conditions, params.status)
    }
    return joinSqlConditions(conditions)
  }

  if (actor?.role === 'ADMIN') {
    if (galleryScope === 'all') {
      addPublicGallerySqlConditions(conditions, actor, 'all', params.status ?? 'APPROVED')
      addSearchSqlCondition(conditions, params.search)
      return joinSqlConditions(conditions)
    }

    if (galleryScope === 'mine') {
      conditions.push(Prisma.sql`c."ownerId" = ${actor.userId}`)
      addSearchSqlCondition(conditions, params.search)
      if (params.status) {
        addStatusSqlCondition(conditions, params.status)
      }
      return joinSqlConditions(conditions)
    }

    if (galleryScope === 'curated') {
      conditions.push(Prisma.sql`owner."role" = ${userRoleValue('ADMIN')}`)
      if (params.status) {
        addStatusSqlCondition(conditions, params.status)
      } else if (!params.adminCuratedAll) {
        addVisibleApprovedCatalogSqlConditions(conditions, actor)
      }
      addSearchSqlCondition(conditions, params.search)
      return joinSqlConditions(conditions)
    }

    if (galleryScope === 'community') {
      conditions.push(Prisma.sql`owner."role" != ${userRoleValue('ADMIN')}`)
      if (params.status) {
        addStatusSqlCondition(conditions, params.status)
      } else if (params.adminCommunityAll) {
        conditions.push(Prisma.sql`c."status" != ${characterStatusValue('REJECTED')}`)
      } else {
        addVisibleApprovedCatalogSqlConditions(conditions, actor)
      }
      addSearchSqlCondition(conditions, params.search)
      return joinSqlConditions(conditions)
    }

    addSearchSqlCondition(conditions, params.search)
    if (params.status) {
      addStatusSqlCondition(conditions, params.status)
    }
    return joinSqlConditions(conditions)
  }

  if (actor && galleryScope === 'mine') {
    conditions.push(Prisma.sql`c."ownerId" = ${actor.userId}`)
    addSearchSqlCondition(conditions, params.search)
    if (params.status) {
      addStatusSqlCondition(conditions, params.status)
    }
    return joinSqlConditions(conditions)
  }

  if (actor && (galleryScope === 'all' || galleryScope === 'curated' || galleryScope === 'community')) {
    addPublicGallerySqlConditions(conditions, actor, galleryScope, params.status ?? 'APPROVED')
    addSearchSqlCondition(conditions, params.search)
    return joinSqlConditions(conditions)
  }

  addPublicGallerySqlConditions(conditions, actor, galleryScope === 'mine' ? 'all' : galleryScope, 'APPROVED')
  addSearchSqlCondition(conditions, params.search)
  return joinSqlConditions(conditions)
}

export { buildCharacterListWhereClause, buildPopularCharacterListWhereSql }
export type { CharacterListQueryParams, GalleryScope }
