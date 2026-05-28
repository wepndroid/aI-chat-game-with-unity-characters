import type { Prisma } from '@prisma/client'

import {
  classifyPrismaDatabasePressureError,
  getPrismaErrorCode,
  type PrismaDatabasePressureReason
} from '../../lib/prisma-database-pressure'

/**
 * Session activity persistence policy.
 *
 * `Session.lastSeenAt` is used by presence, marketing, and admin visibility
 * surfaces. It is not the session validity check: auth validity is decided from
 * the token hash, revocation state, expiry, and user state. Keep this telemetry
 * write bounded so routine authenticated traffic does not become database write
 * amplification on every request.
 */

type SessionLastSeenWriteClient = Pick<Prisma.TransactionClient, 'session'>

type SessionLastSeenRefreshWarning = {
  operation: 'session_last_seen_refresh'
  pressureReason: PrismaDatabasePressureReason
  prismaCode: string | null
  elapsedMs: number
}

type SessionLastSeenRefreshWarningLogger = (warning: SessionLastSeenRefreshWarning) => void

type RefreshSessionLastSeenIfStaleInput = {
  db: SessionLastSeenWriteClient
  sessionId: string
  lastSeenAt: Date | null
  now: Date
  thresholdMs?: number
  warningLogger?: SessionLastSeenRefreshWarningLogger
  elapsedClockMs?: () => number
}

type SessionLastSeenRefreshResult =
  | {
      status: 'fresh'
    }
  | {
      status: 'refreshed'
    }
  | {
      status: 'already_refreshed'
    }
  | {
      status: 'pressure_ignored'
      reason: PrismaDatabasePressureReason
    }

const SESSION_LAST_SEEN_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const defaultSessionLastSeenWarningLogger: SessionLastSeenRefreshWarningLogger = (warning) => {
  console.warn('[auth] session last-seen refresh skipped due to database pressure', warning)
}

const shouldRefreshSessionLastSeen = (
  lastSeenAt: Date | null,
  now: Date,
  thresholdMs = SESSION_LAST_SEEN_REFRESH_INTERVAL_MS
) => {
  if (!lastSeenAt) {
    return true
  }

  return now.getTime() - lastSeenAt.getTime() >= thresholdMs
}

const getElapsedMs = (startedAtMs: number, elapsedClockMs: () => number) =>
  Math.max(0, elapsedClockMs() - startedAtMs)

const refreshSessionLastSeenIfStale = async (
  input: RefreshSessionLastSeenIfStaleInput
): Promise<SessionLastSeenRefreshResult> => {
  const thresholdMs = input.thresholdMs ?? SESSION_LAST_SEEN_REFRESH_INTERVAL_MS

  if (!shouldRefreshSessionLastSeen(input.lastSeenAt, input.now, thresholdMs)) {
    return {
      status: 'fresh'
    }
  }

  const elapsedClockMs = input.elapsedClockMs ?? Date.now
  const startedAtMs = elapsedClockMs()
  const staleCutoff = new Date(input.now.getTime() - thresholdMs)

  try {
    const refreshed = await input.db.session.updateMany({
      where: {
        id: input.sessionId,
        OR: [
          {
            lastSeenAt: null
          },
          {
            lastSeenAt: {
              lt: staleCutoff
            }
          }
        ]
      },
      data: {
        lastSeenAt: input.now
      }
    })

    return refreshed.count > 0
      ? {
          status: 'refreshed'
        }
      : {
          status: 'already_refreshed'
        }
  } catch (error) {
    const pressureReason = classifyPrismaDatabasePressureError(error)
    if (!pressureReason) {
      throw error
    }

    const warningLogger = input.warningLogger ?? defaultSessionLastSeenWarningLogger
    warningLogger({
      operation: 'session_last_seen_refresh',
      pressureReason,
      prismaCode: getPrismaErrorCode(error),
      elapsedMs: getElapsedMs(startedAtMs, elapsedClockMs)
    })

    return {
      status: 'pressure_ignored',
      reason: pressureReason
    }
  }
}

export {
  SESSION_LAST_SEEN_REFRESH_INTERVAL_MS,
  refreshSessionLastSeenIfStale,
  shouldRefreshSessionLastSeen
}
export type {
  RefreshSessionLastSeenIfStaleInput,
  SessionLastSeenRefreshResult,
  SessionLastSeenRefreshWarning,
  SessionLastSeenRefreshWarningLogger,
  SessionLastSeenWriteClient
}
