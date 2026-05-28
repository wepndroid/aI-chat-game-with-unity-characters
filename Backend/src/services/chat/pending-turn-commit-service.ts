import { ChatMessageRole, ChatQuotaReservationStatus, Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import {
  claimPendingTurnForCommit,
  cleanupExpiredPendingTurnsForUser as cleanupExpiredPendingTurnsForUserDefault,
  findPendingTurnById as findPendingTurnByIdDefault,
  markPendingTurnCommitted as markPendingTurnCommittedDefault,
  type PendingTurn
} from './chat-pending-turn-service'
import {
  getUnitySessionState as getUnitySessionStateDefault,
  prepareUnitySessionStateUpsert,
  upsertPreparedUnitySessionState,
  type PreparedUnitySessionStateUpsert,
  type UnitySessionState
} from './unity-session-state-service'
import {
  classifyPendingTurnCommitTransactionError,
  getPendingTurnCommitTransactionOptions,
  shouldLogPendingTurnCommitTransactionDuration,
  type PendingTurnCommitTransactionPressureReason
} from './pending-turn-commit-transaction-policy'
import { enqueueChatSessionPreviewRefreshJob } from './chat-session-preview-refresh-service'

type PendingTurnCommitPayload = {
  sessionId: string
  clientTurnId: string
  assistantMessageSha256: string
  unityState: {
    metadataVersion: number
    metadata: Record<string, unknown>
  }
}

type PendingTurnCommitMessage = {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  createdAt: Date
  audioUrl?: string | null
}

type PendingTurnCommitReservation = {
  id: string
  usageId: string
  status: ChatQuotaReservationStatus
}

type PendingTurnCommitError = {
  ok: false
  status: number
  code: string
  message: string
  details?: Record<string, unknown>
}

type PendingTurnCommitSuccess = {
  ok: true
  pendingTurn: PendingTurn
  idempotencyReplayed: boolean
  userMessage: PendingTurnCommitMessage
  assistantMessage: PendingTurnCommitMessage
  unityState: UnitySessionState
  postCommitMessageIds: string[]
}

type PendingTurnCommitResult = PendingTurnCommitError | PendingTurnCommitSuccess

type PendingTurnCommitTransactionClient = Prisma.TransactionClient

type PendingTurnCommitDatabase = {
  $transaction: <T>(
    callback: (tx: PendingTurnCommitTransactionClient) => Promise<T>,
    options?: {
      maxWait?: number
      timeout?: number
    }
  ) => Promise<T>
  chatMessage: {
    findUnique: Prisma.TransactionClient['chatMessage']['findUnique']
  }
  chatQuotaReservation: {
    findUnique: Prisma.TransactionClient['chatQuotaReservation']['findUnique']
  }
  chatSession: {
    findUnique: Prisma.TransactionClient['chatSession']['findUnique']
  }
}

type CommitPendingTurnDependencies = {
  now: () => Date
  db: PendingTurnCommitDatabase
  cleanupExpiredPendingTurnsForUser: typeof cleanupExpiredPendingTurnsForUserDefault
  findPendingTurnById: typeof findPendingTurnByIdDefault
  getUnitySessionState: typeof getUnitySessionStateDefault
}

type CommitPendingTurnInput = {
  userId: string
  pendingTurnId: string
  payload: PendingTurnCommitPayload
}

type CoreTransactionInput = {
  db: Pick<PendingTurnCommitDatabase, '$transaction'>
  pendingTurn: PendingTurn
  reservation: PendingTurnCommitReservation
  characterId: string | null
  preparedUnityState: PreparedUnitySessionStateUpsert
  claimPendingTurn?: typeof claimPendingTurnForCommit
  markPendingTurnCommitted?: typeof markPendingTurnCommittedDefault
  writeUnitySessionState?: (
    tx: PendingTurnCommitTransactionClient,
    preparedState: PreparedUnitySessionStateUpsert
  ) => Promise<UnitySessionState>
  nowMs?: () => number
  transactionLogger?: PendingTurnCommitTransactionLogger
}

const GAMEPLAY_CLIENT_MESSAGE_PREFIX = 'event:'
const PENDING_TURN_COMMIT_TRANSACTION_OPERATION_NAME = 'chat.pendingTurn.commitTransaction'

type PendingTurnCommitTransactionLogDetails = {
  operationName: typeof PENDING_TURN_COMMIT_TRANSACTION_OPERATION_NAME
  pendingTurnId: string
  sessionId: string
  elapsedMs: number
  pressureReason: PendingTurnCommitTransactionPressureReason | 'slow_transaction'
  errorCode?: string
  errorName?: string
}

type PendingTurnCommitTransactionLogger = (
  message: string,
  details: PendingTurnCommitTransactionLogDetails
) => void

const toStoredGameplayClientMessageId = (clientEventId: string) => `${GAMEPLAY_CLIENT_MESSAGE_PREFIX}${clientEventId}`

const buildStoredClientMessageId = (pendingTurn: PendingTurn) => {
  return pendingTurn.kind === 'gameplay'
    ? toStoredGameplayClientMessageId(pendingTurn.clientTurnId)
    : pendingTurn.clientTurnId
}

const toNormalizableHash = (value: string) => value.toLowerCase()

const buildCommitError = (
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): PendingTurnCommitError => ({
  ok: false,
  status,
  code,
  message,
  ...(details ? { details } : {})
})

const defaultPendingTurnCommitTransactionLogger: PendingTurnCommitTransactionLogger = (message, details) => {
  console.warn(message, details)
}

const getKnownErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

const getErrorName = (error: unknown) => {
  return error instanceof Error ? error.name : undefined
}

const buildTransactionLogDetails = (input: {
  pendingTurn: PendingTurn
  elapsedMs: number
  pressureReason: PendingTurnCommitTransactionLogDetails['pressureReason']
  error?: unknown
}): PendingTurnCommitTransactionLogDetails => {
  const errorCode = getKnownErrorCode(input.error)
  const errorName = getErrorName(input.error)

  return {
    operationName: PENDING_TURN_COMMIT_TRANSACTION_OPERATION_NAME,
    pendingTurnId: input.pendingTurn.id,
    sessionId: input.pendingTurn.sessionId,
    elapsedMs: input.elapsedMs,
    pressureReason: input.pressureReason,
    ...(errorCode ? { errorCode } : {}),
    ...(errorName ? { errorName } : {})
  }
}

const loadCommittedMessages = async (
  db: PendingTurnCommitDatabase,
  pendingTurn: PendingTurn
): Promise<{
  userMessage: PendingTurnCommitMessage | null
  assistantMessage: PendingTurnCommitMessage | null
}> => {
  if (!pendingTurn.committedUserMessageId || !pendingTurn.committedAssistantMessageId) {
    return {
      userMessage: null,
      assistantMessage: null
    }
  }

  const [userMessage, assistantMessage] = await Promise.all([
    db.chatMessage.findUnique({
      where: {
        id: pendingTurn.committedUserMessageId
      },
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        createdAt: true,
        clientMessageId: true
      }
    }),
    db.chatMessage.findUnique({
      where: {
        id: pendingTurn.committedAssistantMessageId
      },
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        createdAt: true,
        clientMessageId: true,
        audioUrl: true
      }
    })
  ])

  return {
    userMessage,
    assistantMessage
  }
}

const commitPendingTurnCoreTransaction = async ({
  db,
  pendingTurn,
  reservation,
  characterId,
  preparedUnityState,
  claimPendingTurn = claimPendingTurnForCommit,
  markPendingTurnCommitted = markPendingTurnCommittedDefault,
  writeUnitySessionState = upsertPreparedUnitySessionState,
  nowMs = Date.now,
  transactionLogger = defaultPendingTurnCommitTransactionLogger
}: CoreTransactionInput) => {
  const startedAtMs = nowMs()

  try {
    // Atomic commit boundary: pending-turn claim, transcript rows, durable
    // post-commit ledgers, quota reservation finalization, Unity state, and
    // committed mark.
    const transactionResult = await db.$transaction(
      async (tx) => {
        const claimed = await claimPendingTurn(tx, pendingTurn.id)
        if (!claimed) {
          throw new Error('Pending turn is no longer available for commit.')
        }

        const storedClientMessageId = buildStoredClientMessageId(pendingTurn)
        const userMessage = await tx.chatMessage.create({
          data: {
            sessionId: pendingTurn.sessionId,
            role: ChatMessageRole.USER,
            content: pendingTurn.kind === 'gameplay' ? pendingTurn.gameplayDisplayText ?? '' : pendingTurn.messageText ?? '',
            clientMessageId: storedClientMessageId
          },
          select: {
            id: true,
            sessionId: true,
            role: true,
            content: true,
            createdAt: true
          }
        })

        const assistantMessage = await tx.chatMessage.create({
          data: {
            sessionId: pendingTurn.sessionId,
            role: ChatMessageRole.ASSISTANT,
            content: pendingTurn.assistantText,
            audioUrl: pendingTurn.voiceAudioUrl,
            clientMessageId: storedClientMessageId
          },
          select: {
            id: true,
            sessionId: true,
            role: true,
            content: true,
            createdAt: true,
            audioUrl: true
          }
        })

        await enqueueChatSessionPreviewRefreshJob(tx, {
          sessionId: pendingTurn.sessionId,
          pendingTurnId: pendingTurn.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id
        })

        if (characterId) {
          for (const message of [userMessage, assistantMessage]) {
            await tx.characterActivityMessageLedger.create({
              data: {
                messageId: message.id,
                sessionId: message.sessionId,
                characterId,
                role: message.role,
                messageCreatedAt: message.createdAt
              }
            })
          }
        }

        if (pendingTurn.kind === 'normal') {
          const usageData: Prisma.ChatMessageUsageUpdateInput = {
            messagesUsed: {
              increment: 1
            }
          }

          if (pendingTurn.voiceConsumed) {
            usageData.voiceMessagesUsed = {
              increment: 1
            }
          }

          await tx.chatMessageUsage.update({
            where: {
              id: reservation.usageId
            },
            data: usageData
          })
        }

        const unityState = await writeUnitySessionState(tx, preparedUnityState)
        const finalizedAt = new Date()
        const finalized = await tx.chatQuotaReservation.updateMany({
          where: {
            id: reservation.id,
            status: ChatQuotaReservationStatus.RESERVED
          },
          data: {
            status: ChatQuotaReservationStatus.FINALIZED,
            sessionId: pendingTurn.sessionId,
            messageId: userMessage.id,
            requestFingerprint: pendingTurn.requestFingerprint,
            voiceRequested: pendingTurn.voiceRequested,
            voiceConsumed: pendingTurn.voiceConsumed,
            voiceTaskId: pendingTurn.voiceTaskId,
            finalizedAt,
            errorReason: null
          }
        })

        if (finalized.count !== 1) {
          throw new Error('Pending turn reservation is not available for commit.')
        }

        await markPendingTurnCommitted(tx, {
          pendingTurnId: pendingTurn.id,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id
        })

        return {
          userMessage,
          assistantMessage,
          unityState,
          finalizedAt
        }
      },
      getPendingTurnCommitTransactionOptions()
    )

    const elapsedMs = nowMs() - startedAtMs
    if (shouldLogPendingTurnCommitTransactionDuration(elapsedMs)) {
      transactionLogger(
        '[chat] Pending turn commit transaction was slow.',
        buildTransactionLogDetails({
          pendingTurn,
          elapsedMs,
          pressureReason: 'slow_transaction'
        })
      )
    }

    return transactionResult
  } catch (error) {
    const pressureReason = classifyPendingTurnCommitTransactionError(error)
    if (pressureReason) {
      transactionLogger(
        '[chat] Pending turn commit transaction reported database pressure.',
        buildTransactionLogDetails({
          pendingTurn,
          elapsedMs: nowMs() - startedAtMs,
          pressureReason,
          error
        })
      )
    }

    throw error
  }
}

const commitPendingTurnWithDependencies = async (
  input: CommitPendingTurnInput & CommitPendingTurnDependencies
): Promise<PendingTurnCommitResult> => {
  await input.cleanupExpiredPendingTurnsForUser(input.userId)

  const pendingTurn = await input.findPendingTurnById(input.pendingTurnId)
  if (!pendingTurn || pendingTurn.userId !== input.userId || pendingTurn.sessionId !== input.payload.sessionId) {
    return buildCommitError(404, 'NOT_FOUND', 'Pending turn not found.')
  }

  if (pendingTurn.clientTurnId !== input.payload.clientTurnId) {
    return buildCommitError(403, 'FORBIDDEN', 'Pending turn client id does not match.')
  }

  const chatSession = await input.db.chatSession.findUnique({
    where: {
      id: pendingTurn.sessionId
    },
    select: {
      id: true,
      userId: true,
      characterId: true
    }
  })

  if (!chatSession || chatSession.userId !== input.userId) {
    return buildCommitError(404, 'NOT_FOUND', 'Chat session not found.')
  }

  if (pendingTurn.status === 'ABORTED' || pendingTurn.status === 'EXPIRED') {
    return buildCommitError(409, 'PENDING_TURN_NOT_COMMITTABLE', 'Pending turn was already released.', {
      status: pendingTurn.status.toLowerCase()
    })
  }

  if (toNormalizableHash(input.payload.assistantMessageSha256) !== pendingTurn.assistantSha256) {
    return buildCommitError(409, 'PENDING_TURN_HASH_MISMATCH', 'Assistant message hash does not match pending turn.')
  }

  if (pendingTurn.status === 'COMMITTED') {
    const { userMessage, assistantMessage } = await loadCommittedMessages(input.db, pendingTurn)
    if (!userMessage || !assistantMessage) {
      return buildCommitError(500, 'INTERNAL_ERROR', 'Committed pending turn replay messages are missing.')
    }

    const unityState = await input.getUnitySessionState(pendingTurn.sessionId)
    return {
      ok: true,
      pendingTurn,
      idempotencyReplayed: true,
      userMessage,
      assistantMessage,
      unityState,
      postCommitMessageIds: [userMessage.id, assistantMessage.id]
    }
  }

  if (pendingTurn.expiresAt.getTime() <= input.now().getTime()) {
    await input.cleanupExpiredPendingTurnsForUser(input.userId)
    return buildCommitError(409, 'PENDING_TURN_EXPIRED', 'Pending turn expired before commit.')
  }

  let preparedUnityState: PreparedUnitySessionStateUpsert
  try {
    preparedUnityState = prepareUnitySessionStateUpsert({
      sessionId: pendingTurn.sessionId,
      userId: input.userId,
      metadataVersion: input.payload.unityState.metadataVersion,
      metadata: input.payload.unityState.metadata
    })
  } catch (error) {
    return buildCommitError(
      400,
      'INVALID_UNITY_STATE',
      error instanceof Error ? error.message : 'Invalid Unity state.'
    )
  }

  const reservation = await input.db.chatQuotaReservation.findUnique({
    where: {
      id: pendingTurn.reservationId
    },
    select: {
      id: true,
      usageId: true,
      status: true
    }
  })

  if (!reservation || reservation.status !== ChatQuotaReservationStatus.RESERVED) {
    return buildCommitError(409, 'PENDING_TURN_RESERVATION_UNAVAILABLE', 'Pending turn reservation is not available for commit.')
  }

  const transactionResult = await commitPendingTurnCoreTransaction({
    db: input.db,
    pendingTurn,
    reservation,
    characterId: chatSession.characterId,
    preparedUnityState
  })

  return {
    ok: true,
    pendingTurn,
    idempotencyReplayed: false,
    userMessage: transactionResult.userMessage,
    assistantMessage: transactionResult.assistantMessage,
    unityState: transactionResult.unityState,
    postCommitMessageIds: [transactionResult.userMessage.id, transactionResult.assistantMessage.id]
  }
}

const commitPendingTurn = async (input: CommitPendingTurnInput) => {
  return commitPendingTurnWithDependencies({
    ...input,
    now: () => new Date(),
    db: prisma,
    cleanupExpiredPendingTurnsForUser: cleanupExpiredPendingTurnsForUserDefault,
    findPendingTurnById: findPendingTurnByIdDefault,
    getUnitySessionState: getUnitySessionStateDefault
  })
}

export {
  commitPendingTurn,
  commitPendingTurnCoreTransaction,
  commitPendingTurnWithDependencies
}
export type {
  PendingTurnCommitError,
  PendingTurnCommitMessage,
  PendingTurnCommitPayload,
  PendingTurnCommitResult,
  PendingTurnCommitSuccess
}
