import { EntitlementSource, EntitlementStatus, type PrismaClient } from '@prisma/client'
import {
  runObservedBackgroundWork as defaultRunObservedBackgroundWork,
  type ObservedBackgroundWorkRunner
} from '../../lib/background-work-monitor'
import { prisma } from '../../lib/prisma'
import { resolvePatreonEntitlementDecision } from './patreon-entitlement-policy'

type PatreonEntitlementReconciliationRow = {
  id: string
  userId: string
  tierCode: string
  validUntil: Date | null
  user: {
    email: string
    patreonAccount: {
      membershipStatus: string | null
      tierCents: number | null
      lastChargeStatus: string | null
      lastChargeDate: Date | null
      nextChargeDate: Date | null
    } | null
  }
}

type PatreonEntitlementReconciliationDatabase = {
  entitlement: {
    findMany: (query: unknown) => Promise<PatreonEntitlementReconciliationRow[]>
    updateMany: (query: unknown) => Promise<{ count: number }>
  }
}

type PatreonEntitlementReconciliationEntry = {
  entitlementId: string
  userId: string
  email: string
  tierCode: string
  membershipStatus: string
  tierCents: number
  lastChargeStatus: string | null
  lastChargeDate: string | null
  nextChargeDate: string | null
  currentValidUntil: string
  proposedValidUntil: string | null
  reason: string
  repairable: boolean
}

type PatreonEntitlementReconciliationResult = {
  inspectedEntitlements: number
  repairableEntitlements: number
  updatedEntitlements: number
  entries: PatreonEntitlementReconciliationEntry[]
}

type ReconcilePatreonEntitlementsInput = {
  db?: PatreonEntitlementReconciliationDatabase
  now?: Date
  apply?: boolean
  limit?: number
}

type ReconcilePatreonEntitlementsBackgroundInput = ReconcilePatreonEntitlementsInput & {
  runObservedBackgroundWork?: ObservedBackgroundWorkRunner
  logger?: Pick<Console, 'warn'>
}

type ReconcilePatreonEntitlementsBackgroundResult = PatreonEntitlementReconciliationResult

const DEFAULT_RECONCILIATION_LIMIT = 100

const toIsoOrNull = (value: Date | null | undefined) => value?.toISOString() ?? null

const resolveDb = (db?: PatreonEntitlementReconciliationDatabase) =>
  db ?? (prisma as unknown as PatreonEntitlementReconciliationDatabase)

/**
 * Finds local Patreon entitlements that contradict the approved access policy.
 *
 * The repair is intentionally narrow: it only clears `validUntil` for an
 * already-active Patreon entitlement when the linked Patreon account is still
 * `active_patron`, has a positive billing amount, has no refund/fraud marker,
 * and the entitlement tier is a known paid product tier. It does not create
 * missing rows, change tiers, reactivate inactive rows, or contact Patreon.
 */
const reconcilePatreonEntitlements = async (
  input: ReconcilePatreonEntitlementsInput = {}
): Promise<PatreonEntitlementReconciliationResult> => {
  const db = resolveDb(input.db)
  const now = input.now ?? new Date()
  const apply = input.apply === true
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_RECONCILIATION_LIMIT))

  const rows = await db.entitlement.findMany({
    where: {
      source: EntitlementSource.PATREON,
      status: EntitlementStatus.ACTIVE,
      validUntil: {
        lte: now
      },
      user: {
        patreonAccount: {
          is: {
            membershipStatus: 'active_patron',
            tierCents: {
              gt: 0
            }
          }
        }
      }
    },
    orderBy: [
      {
        validUntil: 'asc'
      },
      {
        updatedAt: 'asc'
      }
    ],
    take: limit,
    select: {
      id: true,
      userId: true,
      tierCode: true,
      validUntil: true,
      user: {
        select: {
          email: true,
          patreonAccount: {
            select: {
              membershipStatus: true,
              tierCents: true,
              lastChargeStatus: true,
              lastChargeDate: true,
              nextChargeDate: true
            }
          }
        }
      }
    }
  }) as PatreonEntitlementReconciliationRow[]

  const entries: PatreonEntitlementReconciliationEntry[] = []

  for (const row of rows) {
    const account = row.user.patreonAccount
    if (!account || (account.tierCents ?? 0) <= 0) {
      continue
    }

    const decision = resolvePatreonEntitlementDecision({
      now,
      membershipStatus: account.membershipStatus,
      tierCode: row.tierCode,
      lastChargeStatus: account.lastChargeStatus,
      nextChargeDate: account.nextChargeDate,
      isGifted: false
    })

    if (decision.status !== EntitlementStatus.ACTIVE || decision.validUntil !== null) {
      continue
    }

    entries.push({
      entitlementId: row.id,
      userId: row.userId,
      email: row.user.email,
      tierCode: row.tierCode,
      membershipStatus: account.membershipStatus ?? 'unknown',
      tierCents: account.tierCents ?? 0,
      lastChargeStatus: account.lastChargeStatus,
      lastChargeDate: toIsoOrNull(account.lastChargeDate),
      nextChargeDate: toIsoOrNull(account.nextChargeDate),
      currentValidUntil: row.validUntil ? row.validUntil.toISOString() : now.toISOString(),
      proposedValidUntil: null,
      reason: decision.reason,
      repairable: true
    })
  }

  let updatedEntitlements = 0

  if (apply) {
    for (const entry of entries) {
      const result = await db.entitlement.updateMany({
        where: {
          id: entry.entitlementId,
          source: EntitlementSource.PATREON,
          status: EntitlementStatus.ACTIVE,
          validUntil: {
            lte: now
          }
        },
        data: {
          validUntil: null,
          updatedAt: now
        }
      })

      updatedEntitlements += result.count
    }
  }

  return {
    inspectedEntitlements: rows.length,
    repairableEntitlements: entries.length,
    updatedEntitlements,
    entries
  }
}

const reconcilePatreonEntitlementsAsBackgroundWork = async (
  input: ReconcilePatreonEntitlementsBackgroundInput = {}
): Promise<ReconcilePatreonEntitlementsBackgroundResult> => {
  const {
    runObservedBackgroundWork = defaultRunObservedBackgroundWork,
    logger = console,
    ...reconciliationInput
  } = input

  return runObservedBackgroundWork(
    'patreon_entitlement_reconciliation',
    () => reconcilePatreonEntitlements(reconciliationInput),
    { logger }
  )
}

export {
  DEFAULT_RECONCILIATION_LIMIT,
  reconcilePatreonEntitlements,
  reconcilePatreonEntitlementsAsBackgroundWork
}
export type {
  PatreonEntitlementReconciliationDatabase,
  PatreonEntitlementReconciliationEntry,
  PatreonEntitlementReconciliationResult,
  ReconcilePatreonEntitlementsBackgroundResult
}
