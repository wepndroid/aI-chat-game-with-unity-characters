import { ChatQuotaReservationStatus, Prisma } from '@prisma/client'

import { prisma } from '../../lib/prisma'
import {
  markPendingTurnVoiceAccepted,
  rollbackPendingTurnVoiceAccepted
} from '../chat/chat-pending-turn-service'
import type { ActiveTtsTurn } from './tts-active-turn-registry'

type VisibleTurnDurableStateDatabase = Pick<PrismaClientLike, '$transaction'>
type VisibleTurnDurableStateTransaction = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | '$queryRaw' | 'chatQuotaReservation'
>

type PrismaClientLike = {
  $transaction: <T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      timeout?: number
    }
  ) => Promise<T>
}

type AcceptVisibleTurnVoiceStateInput = {
  userId: string
  activeTurn: ActiveTtsTurn
  voiceTaskId: string
  acceptedAsFirstSegment: boolean
}

type RollbackVisibleTurnVoiceStateInput = {
  userId: string
  reservationId: string
  kind: ActiveTtsTurn['kind']
  pendingTurnId: string | null
  failedVoiceTaskId: string
}

type VisibleTurnVoiceStateMutationResult = {
  reservationUpdated: boolean
  pendingTurnUpdated: boolean
}

const updateFirstVoiceReservation = async (
  tx: VisibleTurnDurableStateTransaction,
  input: Pick<AcceptVisibleTurnVoiceStateInput, 'userId' | 'activeTurn' | 'voiceTaskId'>
) => {
  const updated = await tx.chatQuotaReservation.updateMany({
    where: {
      id: input.activeTurn.reservationId,
      userId: input.userId,
      status: ChatQuotaReservationStatus.RESERVED,
      voiceRequested: false
    },
    data: {
      voiceRequested: true,
      voiceConsumed: false,
      voiceTaskId: input.voiceTaskId
    }
  })

  if (updated.count !== 1) {
    throw new Error('Visible-turn voice reservation is not available for first TTS acceptance.')
  }
}

/**
 * Persists the first accepted visible-turn voice task in one short DB unit of
 * work. The stored voice task id is the public SecretWaifu task id, not a stream
 * token, provider bearer token, Ahmad internal id, or credential.
 */
const acceptVisibleTurnVoiceState = async (
  input: AcceptVisibleTurnVoiceStateInput,
  db: VisibleTurnDurableStateDatabase = prisma
): Promise<VisibleTurnVoiceStateMutationResult> => {
  if (!input.acceptedAsFirstSegment) {
    return {
      reservationUpdated: false,
      pendingTurnUpdated: false
    }
  }

  return db.$transaction(async (tx) => {
    if (input.activeTurn.kind === 'normal') {
      await updateFirstVoiceReservation(tx, input)
    }

    if (input.activeTurn.pendingTurnId) {
      await markPendingTurnVoiceAccepted(tx, {
        pendingTurnId: input.activeTurn.pendingTurnId,
        voiceTaskId: input.voiceTaskId,
        consumeVoiceQuotaOnCommit: input.activeTurn.kind === 'normal'
      })
    }

    return {
      reservationUpdated: input.activeTurn.kind === 'normal',
      pendingTurnUpdated: Boolean(input.activeTurn.pendingTurnId)
    }
  })
}

/**
 * Owner-aware compensation for a failed visible-turn voice task. Reservation and
 * pending-turn rows are cleared only while they still point at the failed public
 * voice task id, so stale rollback cannot erase a newer retry accepted by Unity.
 */
const rollbackVisibleTurnVoiceState = async (
  input: RollbackVisibleTurnVoiceStateInput,
  db: VisibleTurnDurableStateDatabase = prisma
): Promise<VisibleTurnVoiceStateMutationResult> => {
  return db.$transaction(async (tx) => {
    let reservationUpdated = false

    if (input.kind === 'normal') {
      const updated = await tx.chatQuotaReservation.updateMany({
        where: {
          id: input.reservationId,
          userId: input.userId,
          status: ChatQuotaReservationStatus.RESERVED,
          voiceTaskId: input.failedVoiceTaskId
        },
        data: {
          voiceRequested: false,
          voiceConsumed: false,
          voiceTaskId: null
        }
      })
      reservationUpdated = updated.count === 1
    }

    if (input.pendingTurnId) {
      await rollbackPendingTurnVoiceAccepted(tx, {
        pendingTurnId: input.pendingTurnId,
        failedVoiceTaskId: input.failedVoiceTaskId
      })
    }

    return {
      reservationUpdated,
      pendingTurnUpdated: Boolean(input.pendingTurnId)
    }
  })
}

export { acceptVisibleTurnVoiceState, rollbackVisibleTurnVoiceState }
export type {
  AcceptVisibleTurnVoiceStateInput,
  RollbackVisibleTurnVoiceStateInput,
  VisibleTurnVoiceStateMutationResult
}
