/**
 * Foreground pending-turn commits are a single Unit of Work: claim the pending
 * turn, create transcript rows, persist ledgers/quota state, write the Unity
 * session snapshot, and mark the turn committed. PostgreSQL row locks and
 * Prisma transaction timeouts can still make this path wait, so this policy
 * keeps the transaction budget explicit relative to Unity's request timeout
 * without adding an inner retry loop around the Unit of Work.
 */

import {
  classifyPrismaDatabasePressureError,
  type PrismaDatabasePressureReason
} from '../../lib/prisma-database-pressure'

type PendingTurnCommitTransactionOptions = {
  maxWait: number
  timeout: number
}

type PendingTurnCommitTransactionPressureReason = PrismaDatabasePressureReason

const PRISMA_DEFAULT_INTERACTIVE_TRANSACTION_TIMEOUT_MS = 5000
const AI_VRM_DEFAULT_REQUEST_TIMEOUT_BUDGET_MS = 30000

const PENDING_TURN_COMMIT_TRANSACTION_MAX_WAIT_MS = 5000
const PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS = 15000
const PENDING_TURN_COMMIT_SLOW_LOG_MS = 2500

const getPendingTurnCommitTransactionOptions = (): PendingTurnCommitTransactionOptions => ({
  maxWait: PENDING_TURN_COMMIT_TRANSACTION_MAX_WAIT_MS,
  timeout: PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS
})

const classifyPendingTurnCommitTransactionError = (
  error: unknown
): PendingTurnCommitTransactionPressureReason | null => {
  return classifyPrismaDatabasePressureError(error)
}

const shouldLogPendingTurnCommitTransactionDuration = (elapsedMs: number) => {
  return elapsedMs >= PENDING_TURN_COMMIT_SLOW_LOG_MS
}

export {
  AI_VRM_DEFAULT_REQUEST_TIMEOUT_BUDGET_MS,
  PENDING_TURN_COMMIT_SLOW_LOG_MS,
  PENDING_TURN_COMMIT_TRANSACTION_MAX_WAIT_MS,
  PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS,
  PRISMA_DEFAULT_INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  classifyPendingTurnCommitTransactionError,
  getPendingTurnCommitTransactionOptions,
  shouldLogPendingTurnCommitTransactionDuration
}
export type {
  PendingTurnCommitTransactionOptions,
  PendingTurnCommitTransactionPressureReason
}
