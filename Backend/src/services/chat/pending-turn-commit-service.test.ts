import test from 'node:test'
import assert from 'node:assert/strict'
import { ChatMessageRole, ChatQuotaReservationStatus } from '@prisma/client'

import {
  commitPendingTurnCoreTransaction,
  commitPendingTurnWithDependencies
} from './pending-turn-commit-service'
import {
  AI_VRM_DEFAULT_REQUEST_TIMEOUT_BUDGET_MS,
  PENDING_TURN_COMMIT_TRANSACTION_MAX_WAIT_MS,
  PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS,
  PRISMA_DEFAULT_INTERACTIVE_TRANSACTION_TIMEOUT_MS,
  classifyPendingTurnCommitTransactionError,
  getPendingTurnCommitTransactionOptions,
  shouldLogPendingTurnCommitTransactionDuration
} from './pending-turn-commit-transaction-policy'

const pendingTurn = {
  id: 'pending-turn-1',
  userId: 'user-1',
  sessionId: 'session-1',
  storyId: 'story-1',
  kind: 'normal' as const,
  clientTurnId: 'client-turn-1',
  requestId: 'request-1',
  requestFingerprint: 'fingerprint-1',
  messageText: 'Hello',
  gameplayEventType: null,
  gameplayEventPayload: {},
  gameplayDisplayText: null,
  assistantText: 'Hi there',
  assistantSha256: '0'.repeat(64),
  provider: 'provider-1',
  reservationId: 'reservation-1',
  voiceRequested: true,
  voiceConsumed: true,
  voiceAudioUrl: 'https://example.test/audio.wav',
  voiceTaskId: 'voice-task-1',
  status: 'PENDING' as const,
  expiresAt: new Date('2026-05-12T12:00:00.000Z'),
  committedUserMessageId: null,
  committedAssistantMessageId: null,
  abortReason: null,
  createdAt: new Date('2026-05-12T11:59:00.000Z'),
  updatedAt: new Date('2026-05-12T11:59:00.000Z'),
  committedAt: null,
  abortedAt: null,
  expiredAt: null
}

test('commitPendingTurnCoreTransaction enqueues preview refresh inside the transaction', async () => {
  const calls: unknown[] = []
  let transactionOptions: unknown = null
  const tx = {
    chatMessage: {
      create: async (input: { data: { role: ChatMessageRole; content: string; audioUrl?: string | null } }) => {
        calls.push(['chatMessage.create', input])
        if (input.data.role === ChatMessageRole.USER) {
          return {
            id: 'message-user-1',
            sessionId: pendingTurn.sessionId,
            role: ChatMessageRole.USER,
            content: input.data.content,
            createdAt: new Date('2026-05-12T12:00:01.000Z')
          }
        }

        return {
          id: 'message-assistant-1',
          sessionId: pendingTurn.sessionId,
          role: ChatMessageRole.ASSISTANT,
          content: input.data.content,
          createdAt: new Date('2026-05-12T12:00:02.000Z'),
          audioUrl: input.data.audioUrl ?? null
        }
      }
    },
    chatMessageUsage: {
      update: async (input: unknown) => {
        calls.push(['chatMessageUsage.update', input])
        return input
      }
    },
    characterActivityMessageLedger: {
      create: async (input: unknown) => {
        calls.push(['characterActivityMessageLedger.create', input])
        return input
      }
    },
    chatSessionPreviewRefreshJob: {
      upsert: async (input: unknown) => {
        calls.push(['chatSessionPreviewRefreshJob.upsert', input])
        return input
      }
    },
    chatQuotaReservation: {
      updateMany: async (input: unknown) => {
        calls.push(['chatQuotaReservation.updateMany', input])
        return { count: 1 }
      }
    }
  }
  const db = {
    $transaction: async (callback: (transactionClient: typeof tx) => Promise<unknown>, options?: unknown) => {
      transactionOptions = options
      return callback(tx)
    }
  }

  const result = await commitPendingTurnCoreTransaction({
    db: db as never,
    pendingTurn,
    reservation: {
      id: 'reservation-1',
      usageId: 'usage-1',
      status: ChatQuotaReservationStatus.RESERVED
    },
    characterId: 'character-1',
    preparedUnityState: {
      sessionId: pendingTurn.sessionId,
      userId: pendingTurn.userId,
      metadataVersion: 2,
      metadataJson: '{"mood":"calm"}',
      metadata: {
        mood: 'calm'
      }
    },
    claimPendingTurn: async () => true,
    markPendingTurnCommitted: async (_transactionClient, input) => {
      calls.push(['markPendingTurnCommitted', input])
    },
    writeUnitySessionState: async () => ({
      sessionId: pendingTurn.sessionId,
      metadataVersion: 2,
      metadata: {
        mood: 'calm'
      }
    })
  })

  assert.deepEqual(transactionOptions, getPendingTurnCommitTransactionOptions())
  assert.equal(result.userMessage.id, 'message-user-1')
  assert.equal(result.assistantMessage.id, 'message-assistant-1')
  assert.deepEqual(
    calls.map((call) => Array.isArray(call) ? call[0] : call),
    [
      'chatMessage.create',
      'chatMessage.create',
      'chatSessionPreviewRefreshJob.upsert',
      'characterActivityMessageLedger.create',
      'characterActivityMessageLedger.create',
      'chatMessageUsage.update',
      'chatQuotaReservation.updateMany',
      'markPendingTurnCommitted'
    ]
  )
  assert.deepEqual(calls[2], [
    'chatSessionPreviewRefreshJob.upsert',
    {
      where: {
        userMessageId: 'message-user-1'
      },
      create: {
        sessionId: 'session-1',
        pendingTurnId: 'pending-turn-1',
        userMessageId: 'message-user-1',
        assistantMessageId: 'message-assistant-1'
      },
      update: {
        sessionId: 'session-1',
        pendingTurnId: 'pending-turn-1',
        assistantMessageId: 'message-assistant-1'
      }
    }
  ])
  assert.deepEqual(calls[5], [
    'chatMessageUsage.update',
    {
      where: {
        id: 'usage-1'
      },
      data: {
        messagesUsed: {
          increment: 1
        },
        voiceMessagesUsed: {
          increment: 1
        }
      }
    }
  ])
  assert.deepEqual(calls[6], [
    'chatQuotaReservation.updateMany',
    {
      where: {
        id: 'reservation-1',
        status: ChatQuotaReservationStatus.RESERVED
      },
      data: {
        status: ChatQuotaReservationStatus.FINALIZED,
        sessionId: 'session-1',
        messageId: 'message-user-1',
        requestFingerprint: 'fingerprint-1',
        voiceRequested: true,
        voiceConsumed: true,
        voiceTaskId: 'voice-task-1',
        finalizedAt: result.finalizedAt,
        errorReason: null
      }
    }
  ])
})

test('pending turn commit transaction policy uses an explicit foreground timeout budget', () => {
  assert.deepEqual(getPendingTurnCommitTransactionOptions(), {
    maxWait: PENDING_TURN_COMMIT_TRANSACTION_MAX_WAIT_MS,
    timeout: PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS
  })
  assert.equal(PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS > PRISMA_DEFAULT_INTERACTIVE_TRANSACTION_TIMEOUT_MS, true)
  assert.equal(PENDING_TURN_COMMIT_TRANSACTION_TIMEOUT_MS < AI_VRM_DEFAULT_REQUEST_TIMEOUT_BUDGET_MS, true)
})

test('pending turn commit transaction policy classifies database pressure without catching generic errors', () => {
  assert.equal(
    classifyPendingTurnCommitTransactionError({
      code: 'P2028',
      message: 'Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction.'
    }),
    'transaction_expired'
  )
  assert.equal(
    classifyPendingTurnCommitTransactionError({
      code: 'P1008',
      message: 'Socket timeout (the database failed to respond to a query within the configured timeout).'
    }),
    'query_timeout'
  )
  assert.equal(classifyPendingTurnCommitTransactionError(new Error('validation failed')), null)
})

test('pending turn commit transaction policy only flags durations at the slow log threshold', () => {
  assert.equal(shouldLogPendingTurnCommitTransactionDuration(2499), false)
  assert.equal(shouldLogPendingTurnCommitTransactionDuration(2500), true)
})

test('commitPendingTurnCoreTransaction logs sanitized database pressure metadata', async () => {
  const logged: unknown[][] = []
  const pressureError = Object.assign(
    new Error(
      'Transaction API error: Transaction already closed after seeing Hello, Hi there, 000000, sw_session=token, https://example.test/audio.wav, SELECT * FROM private'
    ),
    {
      code: 'P2028'
    }
  )

  await assert.rejects(
    () => commitPendingTurnCoreTransaction({
      db: {
        $transaction: async () => {
          throw pressureError
        }
      } as never,
      pendingTurn,
      reservation: {
        id: 'reservation-1',
        usageId: 'usage-1',
        status: ChatQuotaReservationStatus.RESERVED
      },
      characterId: 'character-1',
      preparedUnityState: {
        sessionId: pendingTurn.sessionId,
        userId: pendingTurn.userId,
        metadataVersion: 2,
        metadataJson: '{"mood":"calm"}',
        metadata: {
          mood: 'calm'
        }
      },
      nowMs: (() => {
        const values = [1000, 6265]
        return () => values.shift() ?? 6265
      })(),
      transactionLogger: (...args) => {
        logged.push(args)
      }
    }),
    pressureError
  )

  assert.deepEqual(logged, [
    [
      '[chat] Pending turn commit transaction reported database pressure.',
      {
        operationName: 'chat.pendingTurn.commitTransaction',
        pendingTurnId: 'pending-turn-1',
        sessionId: 'session-1',
        elapsedMs: 5265,
        pressureReason: 'transaction_expired',
        errorCode: 'P2028',
        errorName: 'Error'
      }
    ]
  ])

  const serializedLog = JSON.stringify(logged)
  assert.equal(serializedLog.includes('Hello'), false)
  assert.equal(serializedLog.includes('Hi there'), false)
  assert.equal(serializedLog.includes('sw_session'), false)
  assert.equal(serializedLog.includes('https://example.test/audio.wav'), false)
  assert.equal(serializedLog.includes('SELECT * FROM private'), false)
})

test('commitPendingTurnWithDependencies validates Unity state before opening the transaction', async () => {
  let transactionEntered = false

  const result = await commitPendingTurnWithDependencies({
    now: () => new Date('2026-05-12T11:59:30.000Z'),
    userId: 'user-1',
    pendingTurnId: 'pending-turn-1',
    payload: {
      sessionId: 'session-1',
      clientTurnId: 'client-turn-1',
      assistantMessageSha256: '0'.repeat(64),
      unityState: {
        metadataVersion: 0,
        metadata: {}
      }
    },
    db: {
      $transaction: async () => {
        transactionEntered = true
        throw new Error('transaction should not start')
      },
      chatSession: {
        findUnique: async () => ({
          id: 'session-1',
          userId: 'user-1',
          characterId: 'character-1'
        })
      },
      chatQuotaReservation: {
        findUnique: async () => ({
          id: 'reservation-1',
          usageId: 'usage-1',
          status: ChatQuotaReservationStatus.RESERVED
        })
      },
      chatMessage: {
        findUnique: async () => null
      }
    } as never,
    cleanupExpiredPendingTurnsForUser: async () => {},
    findPendingTurnById: async () => pendingTurn,
    getUnitySessionState: async () => ({
      sessionId: 'session-1',
      metadataVersion: 1,
      metadata: {}
    })
  })

  assert.equal(transactionEntered, false)
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    code: 'INVALID_UNITY_STATE',
    message: 'Unity metadata_version must be a positive integer.'
  })
})
