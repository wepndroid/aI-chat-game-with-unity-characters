import { prisma } from '../../lib/prisma'
import type { LandingAttributionSnapshot } from './landing-page-attribution-service'

type LandingAcquisitionUserRow = {
  id: string
  acquisitionVisitId: string | null
}

type LandingAcquisitionVisitRow = {
  id: string
  landingPageId: string
  variantId: string
  shortUrlId: string | null
  visitorId: string
  source: string | null
  medium: string | null
  campaign: string | null
  content: string | null
  term: string | null
  attributionKey: string | null
  referrerHost: string | null
  entryPath: string | null
  landingUrl: string | null
  userAgent: string | null
  gaClientId: string | null
  gaSessionId: string | null
  signupClickedAt: Date | null
  signedUpUserId: string | null
  signupCompletedAt: Date | null
  firstVisitedAt: Date
  lastVisitedAt: Date
}

type LandingAcquisitionClaimTransactionClient = {
  user: {
    findUnique: (input: unknown) => Promise<LandingAcquisitionUserRow | null>
    update: (input: unknown) => Promise<LandingAcquisitionUserRow>
  }
  landingPageVisit: {
    findUnique: (input: unknown) => Promise<LandingAcquisitionVisitRow | null>
    update: (input: unknown) => Promise<LandingAcquisitionVisitRow>
    updateMany: (input: unknown) => Promise<{ count: number }>
    upsert: (input: unknown) => Promise<{ id: string }>
  }
}

type LandingAcquisitionClaimDatabase = LandingAcquisitionClaimTransactionClient & {
  $transaction: <T>(callback: (transactionClient: LandingAcquisitionClaimTransactionClient) => Promise<T>) => Promise<T>
}

type LandingAcquisitionClaimOutcome =
  | {
      outcome: 'claimed'
      visitId: string
    }
  | {
      outcome: 'already_claimed_by_user'
      visitId: string
    }
  | {
      outcome: 'user_already_has_acquisition'
      visitId: string
    }
  | {
      outcome: 'fresh_visit_created_for_user'
      visitId: string
    }
  | {
      outcome: 'missing_visit'
      visitId: null
    }
  | {
      outcome: 'missing_user'
      visitId: null
    }
  | {
      outcome: 'unique_constraint_race_ignored'
      visitId: null
    }

type LandingAcquisitionClaimOptions = {
  db?: LandingAcquisitionClaimDatabase
  now?: () => Date
}

const landingAcquisitionVisitSelect = {
  id: true,
  landingPageId: true,
  variantId: true,
  shortUrlId: true,
  visitorId: true,
  source: true,
  medium: true,
  campaign: true,
  content: true,
  term: true,
  attributionKey: true,
  referrerHost: true,
  entryPath: true,
  landingUrl: true,
  userAgent: true,
  gaClientId: true,
  gaSessionId: true,
  signupClickedAt: true,
  signedUpUserId: true,
  signupCompletedAt: true,
  firstVisitedAt: true,
  lastVisitedAt: true
} as const

const buildSyntheticAcquisitionAttributionKey = (userId: string, sourceVisitId: string) =>
  `signup:${userId}:${sourceVisitId}`

const isUniqueConstraintError = (error: unknown) => {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

const cloneClaimedVisitForUser = async (
  transactionClient: LandingAcquisitionClaimTransactionClient,
  userId: string,
  sourceVisit: LandingAcquisitionVisitRow,
  now: Date
): Promise<LandingAcquisitionClaimOutcome> => {
  const attributionKey = buildSyntheticAcquisitionAttributionKey(userId, sourceVisit.id)
  const freshVisit = await transactionClient.landingPageVisit.upsert({
    where: {
      visitorId_attributionKey: {
        visitorId: sourceVisit.visitorId,
        attributionKey
      }
    },
    update: {
      signedUpUserId: userId,
      signupCompletedAt: now
    },
    create: {
      landingPageId: sourceVisit.landingPageId,
      variantId: sourceVisit.variantId,
      shortUrlId: sourceVisit.shortUrlId,
      visitorId: sourceVisit.visitorId,
      source: sourceVisit.source,
      medium: sourceVisit.medium,
      campaign: sourceVisit.campaign,
      content: sourceVisit.content,
      term: sourceVisit.term,
      attributionKey,
      referrerHost: sourceVisit.referrerHost,
      entryPath: sourceVisit.entryPath,
      landingUrl: sourceVisit.landingUrl,
      userAgent: sourceVisit.userAgent,
      gaClientId: sourceVisit.gaClientId,
      gaSessionId: sourceVisit.gaSessionId,
      signupClickedAt: sourceVisit.signupClickedAt,
      signedUpUserId: userId,
      signupCompletedAt: now,
      firstVisitedAt: sourceVisit.firstVisitedAt,
      lastVisitedAt: sourceVisit.lastVisitedAt
    },
    select: {
      id: true
    }
  })

  await transactionClient.user.update({
    where: {
      id: userId
    },
    data: {
      acquisitionVisitId: freshVisit.id
    }
  })

  return {
    outcome: 'fresh_visit_created_for_user',
    visitId: freshVisit.id
  }
}

const claimExistingUserVisit = async (
  transactionClient: LandingAcquisitionClaimTransactionClient,
  userId: string,
  sourceVisit: LandingAcquisitionVisitRow,
  now: Date
): Promise<LandingAcquisitionClaimOutcome> => {
  await transactionClient.landingPageVisit.update({
    where: {
      id: sourceVisit.id
    },
    data: {
      signedUpUserId: userId,
      signupCompletedAt: sourceVisit.signupCompletedAt ?? now
    }
  })
  await transactionClient.user.update({
    where: {
      id: userId
    },
    data: {
      acquisitionVisitId: sourceVisit.id
    }
  })

  return {
    outcome: 'already_claimed_by_user',
    visitId: sourceVisit.id
  }
}

const claimUnclaimedVisit = async (
  transactionClient: LandingAcquisitionClaimTransactionClient,
  userId: string,
  sourceVisit: LandingAcquisitionVisitRow,
  now: Date
): Promise<LandingAcquisitionClaimOutcome> => {
  const claimResult = await transactionClient.landingPageVisit.updateMany({
    where: {
      id: sourceVisit.id,
      signedUpUserId: null
    },
    data: {
      signedUpUserId: userId,
      signupCompletedAt: now
    }
  })

  if (claimResult.count === 0) {
    const refreshedSourceVisit = await transactionClient.landingPageVisit.findUnique({
      where: {
        id: sourceVisit.id
      },
      select: landingAcquisitionVisitSelect
    })

    if (!refreshedSourceVisit) {
      return {
        outcome: 'missing_visit',
        visitId: null
      }
    }

    if (refreshedSourceVisit.signedUpUserId === userId) {
      return claimExistingUserVisit(transactionClient, userId, refreshedSourceVisit, now)
    }

    if (refreshedSourceVisit.signedUpUserId) {
      return cloneClaimedVisitForUser(transactionClient, userId, refreshedSourceVisit, now)
    }

    return {
      outcome: 'missing_visit',
      visitId: null
    }
  }

  await transactionClient.user.update({
    where: {
      id: userId
    },
    data: {
      acquisitionVisitId: sourceVisit.id
    }
  })

  return {
    outcome: 'claimed',
    visitId: sourceVisit.id
  }
}

/**
 * Claims landing attribution for the user's first signup without letting stale
 * visitor cookies block authentication. Acquisition is analytics metadata: the
 * user record owns exactly one acquisition visit, while shared-browser visits
 * that already belong to another user are cloned into a deterministic fresh
 * visit row for the current user.
 */
const claimLandingAcquisitionForUser = async (
  userId: string,
  attribution: LandingAttributionSnapshot | null,
  options?: LandingAcquisitionClaimOptions
): Promise<LandingAcquisitionClaimOutcome> => {
  if (!attribution) {
    return {
      outcome: 'missing_visit',
      visitId: null
    }
  }

  const db = options?.db ?? (prisma as unknown as LandingAcquisitionClaimDatabase)
  const now = options?.now?.() ?? new Date()

  try {
    return await db.$transaction(async (transactionClient) => {
      const existingUser = await transactionClient.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          acquisitionVisitId: true
        }
      })

      if (!existingUser) {
        return {
          outcome: 'missing_user',
          visitId: null
        }
      }

      if (existingUser.acquisitionVisitId) {
        return {
          outcome: 'user_already_has_acquisition',
          visitId: existingUser.acquisitionVisitId
        }
      }

      const sourceVisit = await transactionClient.landingPageVisit.findUnique({
        where: {
          id: attribution.visitId
        },
        select: landingAcquisitionVisitSelect
      })

      if (!sourceVisit) {
        return {
          outcome: 'missing_visit',
          visitId: null
        }
      }

      if (sourceVisit.signedUpUserId === userId) {
        return claimExistingUserVisit(transactionClient, userId, sourceVisit, now)
      }

      if (sourceVisit.signedUpUserId) {
        return cloneClaimedVisitForUser(transactionClient, userId, sourceVisit, now)
      }

      return claimUnclaimedVisit(transactionClient, userId, sourceVisit, now)
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return {
        outcome: 'unique_constraint_race_ignored',
        visitId: null
      }
    }

    throw error
  }
}

export {
  claimLandingAcquisitionForUser
}
export type {
  LandingAcquisitionClaimDatabase,
  LandingAcquisitionClaimOptions,
  LandingAcquisitionClaimOutcome
}
