import type { Prisma } from '@prisma/client'

import {
  classifyPrismaDatabasePressureError,
  getPrismaErrorCode,
  type PrismaDatabasePressureReason
} from '../../lib/prisma-database-pressure'

/**
 * Durable user activity persistence.
 *
 * Auth `Session` rows are transient token state and are pruned after expiry.
 * This service owns the long-lived "last seen" summary used by admin,
 * analytics, and marketing read models. It deliberately stores only the user
 * id and timestamps: token hashes, IP addresses, user agents, and raw request
 * metadata stay out of durable activity telemetry.
 */

type UserActivityStateWriteClient = Pick<Prisma.TransactionClient, 'userActivityState'>

type UserActivityStateWarning = {
  operation: 'user_activity_state_record'
  pressureReason: PrismaDatabasePressureReason
  prismaCode: string | null
  elapsedMs: number
}

type UserActivityStateWarningLogger = (warning: UserActivityStateWarning) => void

type RecordUserActivityStateInput = {
  db: UserActivityStateWriteClient
  userId: string
  lastSeenAt: Date
  warningLogger?: UserActivityStateWarningLogger
  elapsedClockMs?: () => number
}

type RefreshUserActivityStateIfStaleInput = {
  db: UserActivityStateWriteClient
  userId: string
  lastSeenAt: Date | null
  now: Date
  thresholdMs?: number
  warningLogger?: UserActivityStateWarningLogger
  elapsedClockMs?: () => number
}

type RecordUserActivityStateResult =
  | {
      status: 'recorded'
    }
  | {
      status: 'pressure_ignored'
      reason: PrismaDatabasePressureReason
    }

type RefreshUserActivityStateResult =
  | {
      status: 'fresh'
    }
  | RecordUserActivityStateResult

const USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const defaultUserActivityStateWarningLogger: UserActivityStateWarningLogger = (warning) => {
  console.warn('[auth] user activity state update skipped due to database pressure', warning)
}

const shouldRefreshUserActivityState = (
  lastSeenAt: Date | null,
  now: Date,
  thresholdMs = USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS
) => {
  if (!lastSeenAt) {
    return true
  }

  return now.getTime() - lastSeenAt.getTime() >= thresholdMs
}

const getElapsedMs = (startedAtMs: number, elapsedClockMs: () => number) =>
  Math.max(0, elapsedClockMs() - startedAtMs)

const recordUserActivityState = async (
  input: RecordUserActivityStateInput
): Promise<RecordUserActivityStateResult> => {
  const elapsedClockMs = input.elapsedClockMs ?? Date.now
  const startedAtMs = elapsedClockMs()

  try {
    await input.db.userActivityState.upsert({
      where: {
        userId: input.userId
      },
      create: {
        userId: input.userId,
        lastSeenAt: input.lastSeenAt,
        createdAt: input.lastSeenAt,
        updatedAt: input.lastSeenAt
      },
      update: {
        lastSeenAt: input.lastSeenAt,
        updatedAt: input.lastSeenAt
      }
    })

    return {
      status: 'recorded'
    }
  } catch (error) {
    const pressureReason = classifyPrismaDatabasePressureError(error)
    if (!pressureReason) {
      throw error
    }

    const warningLogger = input.warningLogger ?? defaultUserActivityStateWarningLogger
    warningLogger({
      operation: 'user_activity_state_record',
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

const refreshUserActivityStateIfStale = async (
  input: RefreshUserActivityStateIfStaleInput
): Promise<RefreshUserActivityStateResult> => {
  const thresholdMs = input.thresholdMs ?? USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS

  if (!shouldRefreshUserActivityState(input.lastSeenAt, input.now, thresholdMs)) {
    return {
      status: 'fresh'
    }
  }

  return recordUserActivityState({
    db: input.db,
    userId: input.userId,
    lastSeenAt: input.now,
    warningLogger: input.warningLogger,
    elapsedClockMs: input.elapsedClockMs
  })
}

export {
  USER_ACTIVITY_STATE_REFRESH_INTERVAL_MS,
  recordUserActivityState,
  refreshUserActivityStateIfStale,
  shouldRefreshUserActivityState
}
export type {
  RecordUserActivityStateInput,
  RecordUserActivityStateResult,
  RefreshUserActivityStateIfStaleInput,
  RefreshUserActivityStateResult,
  UserActivityStateWarning,
  UserActivityStateWarningLogger,
  UserActivityStateWriteClient
}
