import type { Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'

/**
 * Retention worker for runtime-only state.
 *
 * PostgreSQL keeps the durable history (`UserActivityState`, messages,
 * purchases, etc.). Auth sessions, pending-turn buffers, launch handoff
 * contexts, and failed-login throttle windows are transient and must not grow
 * forever after cutover. This module owns that cleanup policy and logs only
 * aggregate counts or sanitized failure metadata.
 */

type TransientStateRetentionClient = Pick<
  Prisma.TransactionClient,
  'session' | 'chatPendingTurn' | 'unityLaunchContext' | 'failedLoginAttempt'
>

type TransientStateRetentionLogger = Pick<Console, 'info' | 'error'>

type PruneTransientStateInput = {
  db: TransientStateRetentionClient
  now: Date
  retentionMs?: number
}

type RunTransientStateRetentionOnceInput = {
  db?: TransientStateRetentionClient
  now?: () => Date
  logger?: TransientStateRetentionLogger
  retentionMs?: number
}

type StartTransientStateRetentionWorkerInput = RunTransientStateRetentionOnceInput & {
  intervalMs?: number
}

type TransientStateRetentionResult = {
  sessionsDeleted: number
  pendingTurnsDeleted: number
  unityLaunchContextsDeleted: number
  failedLoginAttemptsDeleted: number
}

type TransientStateRetentionWorker = {
  stop: () => void
}

const TRANSIENT_STATE_RETENTION_MS = 24 * 60 * 60 * 1000
const TRANSIENT_STATE_RETENTION_INTERVAL_MS = 60 * 60 * 1000

const sanitizeRetentionError = (error: unknown) => ({
  name: error instanceof Error ? error.name : 'UnknownError'
})

const pruneTransientState = async (
  input: PruneTransientStateInput
): Promise<TransientStateRetentionResult> => {
  const retentionMs = input.retentionMs ?? TRANSIENT_STATE_RETENTION_MS
  const cutoff = new Date(input.now.getTime() - retentionMs)
  const [sessions, pendingTurns, unityLaunchContexts, failedLoginAttempts] = await Promise.all([
    input.db.session.deleteMany({
      where: {
        OR: [
          {
            expiresAt: {
              lt: cutoff
            }
          },
          {
            revokedAt: {
              lt: cutoff
            }
          }
        ]
      }
    }),
    input.db.chatPendingTurn.deleteMany({
      where: {
        OR: [
          {
            status: 'COMMITTED',
            OR: [{ committedAt: { lt: cutoff } }, { committedAt: null, updatedAt: { lt: cutoff } }]
          },
          {
            status: 'ABORTED',
            OR: [{ abortedAt: { lt: cutoff } }, { abortedAt: null, updatedAt: { lt: cutoff } }]
          },
          {
            status: 'EXPIRED',
            OR: [{ expiredAt: { lt: cutoff } }, { expiredAt: null, updatedAt: { lt: cutoff } }]
          }
        ]
      }
    }),
    input.db.unityLaunchContext.deleteMany({
      where: {
        OR: [
          {
            expiresAt: {
              lt: cutoff
            }
          },
          {
            consumedAt: {
              lt: cutoff
            }
          }
        ]
      }
    }),
    input.db.failedLoginAttempt.deleteMany({
      where: {
        OR: [
          {
            lockUntil: {
              lt: cutoff
            }
          },
          {
            lockUntil: null,
            windowStartAt: {
              lt: cutoff
            }
          }
        ]
      }
    })
  ])

  return {
    sessionsDeleted: sessions.count,
    pendingTurnsDeleted: pendingTurns.count,
    unityLaunchContextsDeleted: unityLaunchContexts.count,
    failedLoginAttemptsDeleted: failedLoginAttempts.count
  }
}

const runTransientStateRetentionOnce = async (input: RunTransientStateRetentionOnceInput = {}) => {
  const db = input.db ?? prisma
  const logger = input.logger ?? console
  const now = input.now?.() ?? new Date()

  try {
    const result = await pruneTransientState({
      db,
      now,
      retentionMs: input.retentionMs
    })
    logger.info('[retention] transient state retention completed', result)
  } catch (error) {
    logger.error('[retention] transient state retention failed', sanitizeRetentionError(error))
  }
}

const startTransientStateRetentionWorker = (
  input: StartTransientStateRetentionWorkerInput = {}
): TransientStateRetentionWorker => {
  const intervalMs = input.intervalMs ?? TRANSIENT_STATE_RETENTION_INTERVAL_MS
  let inFlight = false

  const run = () => {
    if (inFlight) {
      return
    }

    inFlight = true
    void runTransientStateRetentionOnce(input).finally(() => {
      inFlight = false
    })
  }

  run()
  const interval = setInterval(run, intervalMs)
  interval.unref?.()

  return {
    stop: () => clearInterval(interval)
  }
}

export {
  TRANSIENT_STATE_RETENTION_INTERVAL_MS,
  TRANSIENT_STATE_RETENTION_MS,
  pruneTransientState,
  runTransientStateRetentionOnce,
  startTransientStateRetentionWorker
}
export type {
  PruneTransientStateInput,
  RunTransientStateRetentionOnceInput,
  StartTransientStateRetentionWorkerInput,
  TransientStateRetentionClient,
  TransientStateRetentionLogger,
  TransientStateRetentionResult,
  TransientStateRetentionWorker
}
