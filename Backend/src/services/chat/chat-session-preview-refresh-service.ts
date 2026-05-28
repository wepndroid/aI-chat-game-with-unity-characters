import {
  ChatMessageRole,
  ChatSessionPreviewRefreshJobStatus,
  type PrismaClient
} from '@prisma/client'
import { randomUUID } from 'node:crypto'

import {
  classifyPrismaDatabasePressureError,
  getPrismaErrorCode
} from '../../lib/prisma-database-pressure'
import { prisma } from '../../lib/prisma'
import {
  runObservedBackgroundWork as defaultRunObservedBackgroundWork,
  type ObservedBackgroundWorkRunner
} from '../../lib/background-work-monitor'

/**
 * Durable outbox for mutable chat-session preview metadata.
 *
 * Pending-turn commit owns durable transcript writes and enqueues one preview
 * job in the same transaction. This service owns the later, retryable projection
 * from committed USER message content into `ChatSession.previewText`. The
 * projection is idempotent: retrying a job writes the same preview text and the
 * original USER message timestamp, so delayed repairs do not reorder old
 * sessions as if they were newly active.
 */

type ChatSessionPreviewRefreshJobRow = {
  id: string
  sessionId: string
  pendingTurnId: string
  userMessageId: string
  assistantMessageId: string
  status: ChatSessionPreviewRefreshJobStatus
  attemptCount: number
  nextAttemptAt: Date
  lastAttemptAt: Date | null
  processedAt: Date | null
  leaseOwner: string | null
  leaseExpiresAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

type ChatSessionPreviewRefreshJobWriteClient = Pick<PrismaClient, 'chatSessionPreviewRefreshJob'>

type ChatSessionPreviewRefreshDatabase = Pick<
  PrismaClient,
  'chatSessionPreviewRefreshJob' | 'chatMessage' | 'chatSession'
>

type EnqueueChatSessionPreviewRefreshJobInput = {
  sessionId: string
  pendingTurnId: string
  userMessageId: string
  assistantMessageId: string
}

type ProcessDueChatSessionPreviewRefreshJobsInput = {
  db?: ChatSessionPreviewRefreshDatabase
  batchSize?: number
  leaseOwner?: string
  now?: () => Date
}

type ProcessDueChatSessionPreviewRefreshJobsAsBackgroundWorkInput =
  ProcessDueChatSessionPreviewRefreshJobsInput & {
    runObservedBackgroundWork?: ObservedBackgroundWorkRunner
  }

type ProcessChatSessionPreviewRefreshJobInput = {
  db?: ChatSessionPreviewRefreshDatabase
  now?: () => Date
}

type ChatSessionPreviewRefreshJobProcessingResult =
  | 'succeeded'
  | 'retry_scheduled'
  | 'failed'
  | 'skipped'

type ProcessDueChatSessionPreviewRefreshJobsResult = {
  inspectedJobs: number
  claimedJobs: number
  succeededJobs: number
  retryScheduledJobs: number
  failedJobs: number
  skippedJobs: number
}

type ProcessDueChatSessionPreviewRefreshJobsBackgroundResult = ProcessDueChatSessionPreviewRefreshJobsResult

type ResetFailedChatSessionPreviewRefreshJobsInput = {
  db?: ChatSessionPreviewRefreshDatabase
  now?: () => Date
}

const MAX_SESSION_PREVIEW_CHARS = 220
const CHAT_SESSION_PREVIEW_REFRESH_BATCH_SIZE = 10
const CHAT_SESSION_PREVIEW_JOB_LEASE_MS = 60_000
const CHAT_SESSION_PREVIEW_MAX_ATTEMPTS = 5
const CHAT_SESSION_PREVIEW_RETRY_BASE_DELAY_MS = 30_000
const CHAT_SESSION_PREVIEW_RETRY_MAX_DELAY_MS = 15 * 60_000

class PermanentPreviewRefreshError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PermanentPreviewRefreshError'
    this.code = code
  }
}

const createLeaseOwner = () => `chat-session-preview-${process.pid}-${randomUUID()}`

const toPreviewText = (content: string) => content.slice(0, MAX_SESSION_PREVIEW_CHARS)

const calculateRetryDelayMs = (attemptCount: number) => {
  const exponentialDelay = CHAT_SESSION_PREVIEW_RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attemptCount - 1))
  return Math.min(exponentialDelay, CHAT_SESSION_PREVIEW_RETRY_MAX_DELAY_MS)
}

const sanitizePreviewRefreshError = (error: unknown) => {
  const pressureReason = classifyPrismaDatabasePressureError(error)
  if (pressureReason) {
    return `prisma_${pressureReason}`
  }

  const prismaCode = getPrismaErrorCode(error)
  if (prismaCode) {
    return `prisma_${prismaCode}`
  }

  if (error instanceof PermanentPreviewRefreshError) {
    return error.code
  }

  return error instanceof Error && error.name ? error.name : 'unknown_error'
}

const enqueueChatSessionPreviewRefreshJob = async (
  db: ChatSessionPreviewRefreshJobWriteClient,
  input: EnqueueChatSessionPreviewRefreshJobInput
) => {
  return db.chatSessionPreviewRefreshJob.upsert({
    where: {
      userMessageId: input.userMessageId
    },
    create: {
      sessionId: input.sessionId,
      pendingTurnId: input.pendingTurnId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId
    },
    update: {
      sessionId: input.sessionId,
      pendingTurnId: input.pendingTurnId,
      assistantMessageId: input.assistantMessageId
    }
  })
}

const claimPreviewRefreshJob = async (
  db: ChatSessionPreviewRefreshDatabase,
  job: ChatSessionPreviewRefreshJobRow,
  input: {
    now: Date
    leaseOwner: string
  }
) => {
  const leaseExpiresAt = new Date(input.now.getTime() + CHAT_SESSION_PREVIEW_JOB_LEASE_MS)
  const claimed = await db.chatSessionPreviewRefreshJob.updateMany({
    where: {
      id: job.id,
      OR: [
        {
          status: ChatSessionPreviewRefreshJobStatus.PENDING,
          nextAttemptAt: {
            lte: input.now
          }
        },
        {
          status: ChatSessionPreviewRefreshJobStatus.PROCESSING,
          leaseExpiresAt: {
            lte: input.now
          }
        }
      ]
    },
    data: {
      status: ChatSessionPreviewRefreshJobStatus.PROCESSING,
      attemptCount: {
        increment: 1
      },
      lastAttemptAt: input.now,
      leaseOwner: input.leaseOwner,
      leaseExpiresAt,
      lastError: null
    }
  })

  if (claimed.count !== 1) {
    return null
  }

  return db.chatSessionPreviewRefreshJob.findUnique({
    where: {
      id: job.id
    }
  }) as Promise<ChatSessionPreviewRefreshJobRow | null>
}

const markPreviewRefreshJobSucceeded = async (
  db: ChatSessionPreviewRefreshDatabase,
  job: ChatSessionPreviewRefreshJobRow,
  processedAt: Date
) => {
  await db.chatSessionPreviewRefreshJob.update({
    where: {
      id: job.id
    },
    data: {
      status: ChatSessionPreviewRefreshJobStatus.SUCCEEDED,
      processedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null
    }
  })
}

const markPreviewRefreshJobFailed = async (
  db: ChatSessionPreviewRefreshDatabase,
  job: ChatSessionPreviewRefreshJobRow,
  input: {
    now: Date
    error: unknown
  }
): Promise<ChatSessionPreviewRefreshJobProcessingResult> => {
  const terminal = input.error instanceof PermanentPreviewRefreshError || job.attemptCount >= CHAT_SESSION_PREVIEW_MAX_ATTEMPTS
  const retryDelayMs = calculateRetryDelayMs(job.attemptCount)

  await db.chatSessionPreviewRefreshJob.update({
    where: {
      id: job.id
    },
    data: {
      status: terminal
        ? ChatSessionPreviewRefreshJobStatus.FAILED
        : ChatSessionPreviewRefreshJobStatus.PENDING,
      nextAttemptAt: terminal ? job.nextAttemptAt : new Date(input.now.getTime() + retryDelayMs),
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: sanitizePreviewRefreshError(input.error)
    }
  })

  return terminal ? 'failed' : 'retry_scheduled'
}

const processChatSessionPreviewRefreshJob = async (
  job: ChatSessionPreviewRefreshJobRow,
  input: ProcessChatSessionPreviewRefreshJobInput = {}
): Promise<ChatSessionPreviewRefreshJobProcessingResult> => {
  const db = input.db ?? prisma
  const now = input.now?.() ?? new Date()

  try {
    const previewSource = await db.chatMessage.findFirst({
      where: {
        id: job.userMessageId,
        sessionId: job.sessionId,
        role: ChatMessageRole.USER
      },
      select: {
        content: true,
        createdAt: true
      }
    })

    if (!previewSource) {
      throw new PermanentPreviewRefreshError(
        'preview_source_message_missing',
        'Preview refresh source user message is missing.'
      )
    }

    await db.chatSession.update({
      where: {
        id: job.sessionId
      },
      data: {
        previewText: toPreviewText(previewSource.content),
        lastUpdatedAt: previewSource.createdAt
      }
    })
    await markPreviewRefreshJobSucceeded(db, job, now)
    return 'succeeded'
  } catch (error) {
    return markPreviewRefreshJobFailed(db, job, {
      now,
      error
    })
  }
}

const processDueChatSessionPreviewRefreshJobs = async (
  input: ProcessDueChatSessionPreviewRefreshJobsInput = {}
): Promise<ProcessDueChatSessionPreviewRefreshJobsResult> => {
  const db = input.db ?? prisma
  const now = input.now?.() ?? new Date()
  const leaseOwner = input.leaseOwner ?? createLeaseOwner()
  const dueJobs = await db.chatSessionPreviewRefreshJob.findMany({
    where: {
      OR: [
        {
          status: ChatSessionPreviewRefreshJobStatus.PENDING,
          nextAttemptAt: {
            lte: now
          }
        },
        {
          status: ChatSessionPreviewRefreshJobStatus.PROCESSING,
          leaseExpiresAt: {
            lte: now
          }
        }
      ]
    },
    orderBy: [
      {
        nextAttemptAt: 'asc'
      },
      {
        createdAt: 'asc'
      },
      {
        id: 'asc'
      }
    ],
    take: input.batchSize ?? CHAT_SESSION_PREVIEW_REFRESH_BATCH_SIZE
  }) as ChatSessionPreviewRefreshJobRow[]

  const result: ProcessDueChatSessionPreviewRefreshJobsResult = {
    inspectedJobs: dueJobs.length,
    claimedJobs: 0,
    succeededJobs: 0,
    retryScheduledJobs: 0,
    failedJobs: 0,
    skippedJobs: 0
  }

  for (const job of dueJobs) {
    const claimedJob = await claimPreviewRefreshJob(db, job, {
      now,
      leaseOwner
    })

    if (!claimedJob) {
      result.skippedJobs += 1
      continue
    }

    result.claimedJobs += 1
    const jobResult = await processChatSessionPreviewRefreshJob(claimedJob, {
      db,
      now: () => now
    })

    if (jobResult === 'succeeded') {
      result.succeededJobs += 1
    } else if (jobResult === 'retry_scheduled') {
      result.retryScheduledJobs += 1
    } else if (jobResult === 'failed') {
      result.failedJobs += 1
    } else {
      result.skippedJobs += 1
    }
  }

  return result
}

const processDueChatSessionPreviewRefreshJobsAsBackgroundWork = async (
  input: ProcessDueChatSessionPreviewRefreshJobsAsBackgroundWorkInput = {}
): Promise<ProcessDueChatSessionPreviewRefreshJobsBackgroundResult> => {
  const {
    runObservedBackgroundWork = defaultRunObservedBackgroundWork,
    ...processingInput
  } = input

  return runObservedBackgroundWork(
    'chat_session_preview_refresh',
    () => processDueChatSessionPreviewRefreshJobs(processingInput),
    { logger: console }
  )
}

const resetFailedChatSessionPreviewRefreshJobs = async (
  input: ResetFailedChatSessionPreviewRefreshJobsInput = {}
) => {
  const db = input.db ?? prisma
  const now = input.now?.() ?? new Date()

  const result = await db.chatSessionPreviewRefreshJob.updateMany({
    where: {
      status: ChatSessionPreviewRefreshJobStatus.FAILED
    },
    data: {
      status: ChatSessionPreviewRefreshJobStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: now,
      lastAttemptAt: null,
      processedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null
    }
  })

  return result.count
}

export {
  CHAT_SESSION_PREVIEW_JOB_LEASE_MS,
  CHAT_SESSION_PREVIEW_MAX_ATTEMPTS,
  CHAT_SESSION_PREVIEW_REFRESH_BATCH_SIZE,
  CHAT_SESSION_PREVIEW_RETRY_BASE_DELAY_MS,
  CHAT_SESSION_PREVIEW_RETRY_MAX_DELAY_MS,
  MAX_SESSION_PREVIEW_CHARS,
  enqueueChatSessionPreviewRefreshJob,
  processChatSessionPreviewRefreshJob,
  processDueChatSessionPreviewRefreshJobs,
  processDueChatSessionPreviewRefreshJobsAsBackgroundWork,
  resetFailedChatSessionPreviewRefreshJobs,
  sanitizePreviewRefreshError
}
export type {
  ChatSessionPreviewRefreshJobProcessingResult,
  ChatSessionPreviewRefreshJobRow,
  ProcessDueChatSessionPreviewRefreshJobsBackgroundResult,
  ProcessDueChatSessionPreviewRefreshJobsResult
}
