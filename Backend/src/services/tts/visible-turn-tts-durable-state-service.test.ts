import test from 'node:test'
import assert from 'node:assert/strict'
import { ChatQuotaReservationStatus } from '@prisma/client'

import {
  acceptVisibleTurnVoiceState,
  rollbackVisibleTurnVoiceState
} from './visible-turn-tts-durable-state-service'
import type { ActiveTtsTurn } from './tts-active-turn-registry'

const buildActiveTurn = (overrides: Partial<ActiveTtsTurn> = {}): ActiveTtsTurn => ({
  userId: 'user-1',
  sessionId: 'session-1',
  storyId: 'story-1',
  kind: 'normal',
  clientTurnId: 'turn-1',
  requestId: 'request-1',
  reservationId: 'reservation-1',
  pendingTurnId: 'pending-1',
  status: 'pending',
  expiresAtMs: Date.now() + 60_000,
  firstVoiceTaskId: 'voice-task-1',
  acceptedSegments: new Map([['segment-1', 'voice-task-1']]),
  ...overrides
})

test('acceptVisibleTurnVoiceState stores the first public voice task owner on the reservation', async () => {
  const calls: unknown[] = []
  const tx = {
    chatQuotaReservation: {
      updateMany: async (input: unknown) => {
        calls.push(['chatQuotaReservation.updateMany', input])
        return { count: 1 }
      }
    },
    $executeRaw: async (...args: unknown[]) => {
      calls.push(['$executeRaw', args])
      return 1
    },
    $queryRaw: async () => []
  }
  const db = {
    $transaction: async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx)
  }

  const result = await acceptVisibleTurnVoiceState(
    {
      userId: 'user-1',
      activeTurn: buildActiveTurn(),
      voiceTaskId: 'voice-task-1',
      acceptedAsFirstSegment: true
    },
    db as never
  )

  assert.deepEqual(result, {
    reservationUpdated: true,
    pendingTurnUpdated: true
  })
  assert.deepEqual(calls[0], [
    'chatQuotaReservation.updateMany',
    {
      where: {
        id: 'reservation-1',
        userId: 'user-1',
        status: ChatQuotaReservationStatus.RESERVED,
        voiceRequested: false
      },
      data: {
        voiceRequested: true,
        voiceConsumed: false,
        voiceTaskId: 'voice-task-1'
      }
    }
  ])
  assert.equal((calls[1] as unknown[] | undefined)?.[0], '$executeRaw')
})

test('rollbackVisibleTurnVoiceState clears only the reservation owned by the failed voice task', async () => {
  const calls: unknown[] = []
  const tx = {
    chatQuotaReservation: {
      updateMany: async (input: unknown) => {
        calls.push(['chatQuotaReservation.updateMany', input])
        return { count: 0 }
      }
    },
    $executeRaw: async (...args: unknown[]) => {
      calls.push(['$executeRaw', args])
      return 1
    },
    $queryRaw: async () => []
  }
  const db = {
    $transaction: async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx)
  }

  const result = await rollbackVisibleTurnVoiceState(
    {
      userId: 'user-1',
      reservationId: 'reservation-1',
      kind: 'normal',
      pendingTurnId: 'pending-1',
      failedVoiceTaskId: 'failed-voice-task'
    },
    db as never
  )

  assert.deepEqual(result, {
    reservationUpdated: false,
    pendingTurnUpdated: true
  })
  assert.deepEqual(calls[0], [
    'chatQuotaReservation.updateMany',
    {
      where: {
        id: 'reservation-1',
        userId: 'user-1',
        status: ChatQuotaReservationStatus.RESERVED,
        voiceTaskId: 'failed-voice-task'
      },
      data: {
        voiceRequested: false,
        voiceConsumed: false,
        voiceTaskId: null
      }
    }
  ])
  assert.equal((calls[1] as unknown[] | undefined)?.[0], '$executeRaw')
})
