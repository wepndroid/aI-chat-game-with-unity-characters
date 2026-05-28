import {
  runObservedBackgroundWork as defaultRunObservedBackgroundWork,
  type ObservedBackgroundWorkRunner
} from '../../lib/background-work-monitor'
import { prisma } from '../../lib/prisma'
import { reportPrismaEngineFatalError } from '../../lib/prisma-engine-fatal-reporter'
import {
  processCharacterActivityMessageLedgerRows as defaultProcessCharacterActivityMessageLedgerRows,
  type CharacterActivityLedgerProcessingResult
} from './character-activity-count-service'
import {
  processDueChatSessionPreviewRefreshJobs as defaultProcessDueChatSessionPreviewRefreshJobs,
  type ProcessDueChatSessionPreviewRefreshJobsResult
} from './chat-session-preview-refresh-service'

type ChatCommitBackgroundLogger = Pick<Console, 'error' | 'warn'>

type CharacterActivityProcessor = typeof defaultProcessCharacterActivityMessageLedgerRows
type ChatSessionPreviewRefreshProcessor = typeof defaultProcessDueChatSessionPreviewRefreshJobs
type ChatCommitFatalReporter = typeof reportPrismaEngineFatalError

type ChatCommitBackgroundTaskOutcome<T> =
  | {
      status: 'succeeded'
      value: T
    }
  | {
      status: 'failed'
    }
  | {
      status: 'fatal_prisma_engine_panic'
    }

type ChatCommitPreviewRefreshOutcome =
  | ChatCommitBackgroundTaskOutcome<ProcessDueChatSessionPreviewRefreshJobsResult>
  | {
      status: 'not_started_after_fatal'
    }

type ChatCommitBackgroundWorkCompleted = {
  status: 'completed'
  characterActivity: ChatCommitBackgroundTaskOutcome<CharacterActivityLedgerProcessingResult>
  previewRefresh: ChatCommitPreviewRefreshOutcome
}

type ChatCommitBackgroundWorkFailed = {
  status: 'failed'
  reason: 'background_work_failed' | 'prisma_engine_panic'
}

type ChatCommitBackgroundWorkResult =
  | ChatCommitBackgroundWorkCompleted
  | ChatCommitBackgroundWorkFailed

type ProcessChatCommitBackgroundWorkInput = {
  pendingTurnId: string
  sessionId: string
  postCommitMessageIds: string[]
  batchSize?: number
  leaseOwner?: string
  logger?: ChatCommitBackgroundLogger
  prismaClient?: Parameters<CharacterActivityProcessor>[0]
  runObservedBackgroundWork?: ObservedBackgroundWorkRunner
  fatalReporter?: ChatCommitFatalReporter
  processCharacterActivityMessageLedgerRows?: CharacterActivityProcessor
  processDueChatSessionPreviewRefreshJobs?: ChatSessionPreviewRefreshProcessor
}

type SafeUnknownErrorSummary = {
  errorName?: string
  errorCode?: string
  clientVersion?: string
}

const CHAT_COMMIT_BACKGROUND_OPERATION_NAME = 'chat_commit_post_response_effects'
const DEFAULT_PREVIEW_REFRESH_BATCH_SIZE = 5

const getErrorRecord = (error: unknown) => error && typeof error === 'object' ? error as Record<string, unknown> : null

const getStringProperty = (error: unknown, propertyName: string) => {
  const value = getErrorRecord(error)?.[propertyName]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

const toSafeUnknownErrorSummary = (error: unknown): SafeUnknownErrorSummary => {
  const errorName =
    error instanceof Error && error.name.trim().length > 0
      ? error.name
      : getStringProperty(error, 'name') ?? getErrorRecord(error)?.constructor?.name

  return {
    ...(typeof errorName === 'string' && errorName.trim().length > 0 ? { errorName } : {}),
    ...(getStringProperty(error, 'code') ? { errorCode: getStringProperty(error, 'code') } : {}),
    ...(getStringProperty(error, 'clientVersion') ? { clientVersion: getStringProperty(error, 'clientVersion') } : {})
  }
}

const logNonFatalBackgroundTaskError = (
  logger: ChatCommitBackgroundLogger,
  input: {
    component: string
    pendingTurnId: string
    sessionId: string
    error: unknown
  }
) => {
  logger.error('[chat-commit-background-work] Post-commit background task failed.', {
    component: input.component,
    pendingTurnId: input.pendingTurnId,
    sessionId: input.sessionId,
    error: toSafeUnknownErrorSummary(input.error)
  })
}

/**
 * Runs chat-commit post-response work as one observed background tick.
 *
 * The commit route
 * starts character-activity and preview-refresh processors after the foreground
 * response. This coordinator preserves response timing while keeping both
 * low-priority post-commit processors in one best-effort worker tick.
 */
const processChatCommitBackgroundWork = async (
  input: ProcessChatCommitBackgroundWorkInput
): Promise<ChatCommitBackgroundWorkResult> => {
  const logger = input.logger ?? console
  const fatalReporter = input.fatalReporter ?? reportPrismaEngineFatalError
  const observeBackgroundWork = input.runObservedBackgroundWork ?? defaultRunObservedBackgroundWork
  const processCharacterActivityMessageLedgerRows =
    input.processCharacterActivityMessageLedgerRows ?? defaultProcessCharacterActivityMessageLedgerRows
  const processDueChatSessionPreviewRefreshJobs =
    input.processDueChatSessionPreviewRefreshJobs ?? defaultProcessDueChatSessionPreviewRefreshJobs
  const prismaClient = input.prismaClient ?? prisma
  const leaseOwner = input.leaseOwner ?? `commit-route-${input.pendingTurnId}`
  const batchSize = input.batchSize ?? DEFAULT_PREVIEW_REFRESH_BATCH_SIZE

  const runTask = async <T>(
    component: string,
    work: () => Promise<T>
  ): Promise<ChatCommitBackgroundTaskOutcome<T>> => {
    try {
      return {
        status: 'succeeded',
        value: await work()
      }
    } catch (error) {
      const fatalClassification = fatalReporter({
        error,
        source: 'handled_background',
        logContext: {
          component,
          pendingTurnId: input.pendingTurnId,
          sessionId: input.sessionId
        }
      })
      if (fatalClassification) {
        return {
          status: 'fatal_prisma_engine_panic'
        }
      }

      logNonFatalBackgroundTaskError(logger, {
        component,
        pendingTurnId: input.pendingTurnId,
        sessionId: input.sessionId,
        error
      })
      return {
        status: 'failed'
      }
    }
  }

  try {
    return await observeBackgroundWork(
      CHAT_COMMIT_BACKGROUND_OPERATION_NAME,
      async (): Promise<ChatCommitBackgroundWorkCompleted> => {
        const characterActivity = await runTask('chat-character-activity', () =>
          processCharacterActivityMessageLedgerRows(prismaClient, {
            messageIds: input.postCommitMessageIds
          })
        )

        if (characterActivity.status === 'fatal_prisma_engine_panic') {
          return {
            status: 'completed',
            characterActivity,
            previewRefresh: {
              status: 'not_started_after_fatal'
            }
          }
        }

        const previewRefresh = await runTask('chat-session-preview-refresh', () =>
          processDueChatSessionPreviewRefreshJobs({
            batchSize,
            leaseOwner
          })
        )

        return {
          status: 'completed',
          characterActivity,
          previewRefresh
        }
      },
      { logger }
    )
  } catch (error) {
    const fatalClassification = fatalReporter({
      error,
      source: 'handled_background',
      logContext: {
        component: 'chat-commit-background-work',
        pendingTurnId: input.pendingTurnId,
        sessionId: input.sessionId
      }
    })
    if (fatalClassification) {
      return {
        status: 'failed',
        reason: 'prisma_engine_panic'
      }
    }

    logNonFatalBackgroundTaskError(logger, {
      component: 'chat-commit-background-work',
      pendingTurnId: input.pendingTurnId,
      sessionId: input.sessionId,
      error
    })
    return {
      status: 'failed',
      reason: 'background_work_failed'
    }
  }
}

export {
  processChatCommitBackgroundWork
}
export type {
  ChatCommitBackgroundTaskOutcome,
  ChatCommitBackgroundWorkResult,
  ProcessChatCommitBackgroundWorkInput
}
