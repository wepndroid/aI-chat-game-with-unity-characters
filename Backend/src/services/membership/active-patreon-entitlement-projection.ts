import { EntitlementSource, EntitlementStatus, Prisma } from '@prisma/client'
import { postgresTimestamptzValue } from '../../lib/database/postgres-sql'
import { normalizeMembershipTierCode } from '../../lib/membership-tier-policy'

type ActivePatreonEntitlementRelationQueryOptions = {
  take?: number
}

const activePatreonEntitlementOrderBy = {
  updatedAt: 'desc' as const
}

const activePatreonEntitlementSelect = {
  tierCode: true,
  updatedAt: true
}

const PLAYABLE_PATREON_ENTITLEMENT_TIER_CODES = ['basic', 'premium', 'just_models', 'secretwaifu_access'] as const

const hasPlayablePaidEntitlement = (entitlements: Array<{ tierCode: string | null | undefined }>) => {
  return entitlements.some((entitlement) => {
    const normalizedTierCode = normalizeMembershipTierCode(entitlement.tierCode)
    return Boolean(normalizedTierCode && normalizedTierCode !== 'free')
  })
}

/**
 * Centralizes active entitlement expiry semantics for runtime and read models.
 * Product access treats `validUntil = null` as open-ended access and any
 * non-null value as the internal product-access expiry date.
 */
const buildActiveEntitlementWhere = (now: Date) => ({
  status: EntitlementStatus.ACTIVE,
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
})

const buildActivePatreonEntitlementWhere = (now: Date) => ({
  source: EntitlementSource.PATREON,
  ...buildActiveEntitlementWhere(now)
})

const buildActivePlayablePatreonEntitlementWhere = (now: Date) => ({
  ...buildActivePatreonEntitlementWhere(now),
  tierCode: {
    in: [...PLAYABLE_PATREON_ENTITLEMENT_TIER_CODES]
  }
})

/**
 * Raw-SQL companion for stores that need bounded candidate selection without
 * hydrating rows through Prisma relation filters. The tier set mirrors
 * `normalizeMembershipTierCode` aliases that map to paid, playable products.
 */
const buildActivePlayablePatreonEntitlementExistsSql = (userIdExpression: Prisma.Sql, now: Date | string) => Prisma.sql`
  EXISTS (
    SELECT 1
    FROM "Entitlement" AS entitlement
    WHERE entitlement."userId" = ${userIdExpression}
      AND entitlement."source" = 'PATREON'
      AND entitlement."status" = 'ACTIVE'
      AND entitlement."tierCode" IN ('basic', 'premium', 'just_models', 'secretwaifu_access')
      AND (
        entitlement."validUntil" IS NULL
        OR entitlement."validUntil" > ${postgresTimestamptzValue(now)}
      )
  )
`

/**
 * Prisma 6.19.0 can panic when a nested ordered relation selects only business
 * fields and omits the ordering key. Keep `updatedAt` in every narrowed
 * projection that orders by `updatedAt`.
 */
const buildActivePatreonEntitlementRelationQuery = (
  now: Date,
  options: ActivePatreonEntitlementRelationQueryOptions = {}
) => ({
  where: buildActivePatreonEntitlementWhere(now),
  orderBy: activePatreonEntitlementOrderBy,
  ...(options.take !== undefined
    ? {
        take: options.take
      }
    : {}),
  select: activePatreonEntitlementSelect
})

const buildActivePatreonEntitlementFlatQuery = (userIds: string[], now: Date) => ({
  where: {
    userId: {
      in: userIds
    },
    ...buildActivePatreonEntitlementWhere(now)
  },
  orderBy: [
    {
      userId: 'asc' as const
    },
    activePatreonEntitlementOrderBy
  ],
  select: {
    userId: true,
    ...activePatreonEntitlementSelect
  }
})

export {
  PLAYABLE_PATREON_ENTITLEMENT_TIER_CODES,
  buildActiveEntitlementWhere,
  buildActivePatreonEntitlementFlatQuery,
  buildActivePatreonEntitlementRelationQuery,
  buildActivePatreonEntitlementWhere,
  buildActivePlayablePatreonEntitlementExistsSql,
  buildActivePlayablePatreonEntitlementWhere,
  hasPlayablePaidEntitlement
}
