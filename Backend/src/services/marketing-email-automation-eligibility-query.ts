import { Prisma } from '@prisma/client'
import { postgresTimestamptzValue } from '../lib/database/postgres-sql'
import { buildActivePlayablePatreonEntitlementExistsSql } from './membership/active-patreon-entitlement-projection'
import type { MarketingAutomationStatusCondition } from './marketing-email-automation-status-condition'

type MarketingEmailAutomationEligibleUserIdsQueryInput = {
  automationId: string
  statusCondition: MarketingAutomationStatusCondition
  thresholdIso: string
  nowIso: string
  limit: number
}

const buildMarketingEmailTimestampSql = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

const buildMarketingSubscriptionEligibilityPredicate = (
  condition: Extract<MarketingAutomationStatusCondition, 'active_subscription' | 'canceled_subscription'>,
  thresholdIso: string,
  nowIso: string
) => {
  const activeEntitlementExists = buildActivePlayablePatreonEntitlementExistsSql(Prisma.sql`u."id"`, nowIso)

  if (condition === 'active_subscription') {
    return Prisma.sql`
        u."isEmailVerified" = TRUE
        AND u."patreonActiveAt" <= ${buildMarketingEmailTimestampSql(thresholdIso)}
        AND ${activeEntitlementExists}
      `
  }

  return Prisma.sql`
      u."isEmailVerified" = TRUE
      AND EXISTS (SELECT 1 FROM "RevenueEvent" AS revenue WHERE revenue."userId" = u."id")
      AND NOT ${activeEntitlementExists}
      AND (SELECT MAX(revenue."chargedAt") FROM "RevenueEvent" AS revenue WHERE revenue."userId" = u."id") <= ${buildMarketingEmailTimestampSql(thresholdIso)}
    `
}

const buildMarketingAutomationEligibilityPredicate = (
  condition: MarketingAutomationStatusCondition,
  thresholdIso: string,
  nowIso: string
) => {
  if (condition === 'email_unverified') {
    return Prisma.sql`u."isEmailVerified" = FALSE AND u."createdAt" <= ${buildMarketingEmailTimestampSql(thresholdIso)}`
  }

  if (condition === 'verified_no_subscription') {
    return Prisma.sql`
        u."isEmailVerified" = TRUE
        AND u."createdAt" <= ${buildMarketingEmailTimestampSql(thresholdIso)}
        AND NOT EXISTS (SELECT 1 FROM "RevenueEvent" AS revenue WHERE revenue."userId" = u."id")
      `
  }

  if (condition === 'engaged_no_subscription') {
    return Prisma.sql`
        u."isEmailVerified" = TRUE
        AND NOT EXISTS (SELECT 1 FROM "RevenueEvent" AS revenue WHERE revenue."userId" = u."id")
        AND (
          EXISTS (SELECT 1 FROM "ChatSession" AS chatSession WHERE chatSession."userId" = u."id")
          OR EXISTS (SELECT 1 FROM "UserActivityState" AS activity WHERE activity."userId" = u."id")
        )
        AND (
          COALESCE(
            (
              SELECT activity."lastSeenAt"
              FROM "UserActivityState" AS activity
              WHERE activity."userId" = u."id"
            ),
            u."createdAt"
          )
        ) <= ${buildMarketingEmailTimestampSql(thresholdIso)}
      `
  }

  if (condition === 'active_subscription' || condition === 'canceled_subscription') {
    return buildMarketingSubscriptionEligibilityPredicate(condition, thresholdIso, nowIso)
  }

  return Prisma.sql`u."isEmailVerified" = TRUE AND u."createdAt" <= ${buildMarketingEmailTimestampSql(thresholdIso)}`
}

/**
 * Builds the bounded candidate-id query for marketing automation enqueue work.
 *
 * This module owns Prisma placeholder order for the query. Keep every runtime
 * value as a Prisma interpolation and never write manual PostgreSQL positional
 * markers here; Prisma assigns those markers from fragment order when rendering
 * the prepared statement for PostgreSQL.
 */
const buildMarketingEmailAutomationEligibleUserIdsQuery = (input: MarketingEmailAutomationEligibleUserIdsQueryInput) => {
  const predicate = buildMarketingAutomationEligibilityPredicate(input.statusCondition, input.thresholdIso, input.nowIso)

  return Prisma.sql`
      SELECT u."id"
      FROM "User" AS u
      WHERE u."role" <> 'ADMIN'
        AND u."isBanned" = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM "MarketingEmailAutomationRecipient" AS recipient
          WHERE recipient."automationId" = ${input.automationId}
            AND recipient."recipientUserId" = u."id"
        )
        AND ${predicate}
      ORDER BY u."createdAt" ASC, u."id" ASC
      LIMIT ${input.limit}
    `
}

export {
  buildMarketingEmailAutomationEligibleUserIdsQuery,
  buildMarketingSubscriptionEligibilityPredicate
}
export type {
  MarketingEmailAutomationEligibleUserIdsQueryInput
}
