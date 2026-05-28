import test from 'node:test'
import assert from 'node:assert/strict'
import { requestTtsSegment } from './tts-segment-service'
import {
  abortActiveTtsTurn,
  getActiveTtsTurn,
  linkActiveTtsTurnPending,
  startActiveTtsTurn
} from './tts-active-turn-registry'

type PrismaAsyncFn = (...args: unknown[]) => Promise<unknown>
type PrismaTtsTestMock = {
  user: { findUnique: PrismaAsyncFn }
  entitlement: { findMany: PrismaAsyncFn }
  $transaction: PrismaAsyncFn
  $executeRaw: PrismaAsyncFn
  $executeRawUnsafe: PrismaAsyncFn
  $queryRaw: PrismaAsyncFn
  chatMessageUsage: { findUnique: PrismaAsyncFn }
  chatSession: { findUnique: PrismaAsyncFn }
  chatQuotaReservation: {
    updateMany: PrismaAsyncFn
    count: PrismaAsyncFn
  }
}
const prismaModule = require('../../lib/prisma') as { prisma: unknown }
const prismaMock = prismaModule.prisma as PrismaTtsTestMock

const installTransactionPassthrough = () => {
  const originalTransaction = prismaMock.$transaction
  prismaMock.$transaction = async (callback: unknown) => {
    if (typeof callback !== 'function') {
      throw new Error('Expected interactive transaction callback.')
    }

    return (callback as (tx: PrismaTtsTestMock) => Promise<unknown>)(prismaMock)
  }

  return () => {
    prismaMock.$transaction = originalTransaction
  }
}

test('visible-turn TTS DB failure does not leave accepted segment replay state', async (t) => {
  const userId = 'user-tts-db-fail'
  const sessionId = 'session-tts-db-fail'
  const storyId = 'story-tts-db-fail'
  const clientTurnId = 'turn-tts-db-fail'
  const segmentId = 'seg-tts-db-fail'
  const requestId = 'req-tts-db-fail'
  const reservationId = 'res-tts-db-fail'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  t.after(() => {
    restoreTransaction()
    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany
  })

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-1',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-1',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => 0

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async () => {
    throw Object.assign(new Error('Timed out fetching a new connection from the connection pool.'), {
      code: 'P2024'
    })
  }

  await assert.rejects(
    () =>
      requestTtsSegment(
        { userId, role: 'USER' as never },
        {
          parentKind: 'visible_turn',
          sessionId,
          clientTurnId,
          segmentId,
          sequenceIndex: 0,
          role: 'character',
          text: 'hello',
          voiceRef: null,
          voiceRefPath: null,
          emotion: null,
          emoText: null,
          emoAlpha: null,
          emotionVector: null,
          providerPlayerTier: 'basic'
        }
      ),
    /connection pool/
  )

  const activeTurn = getActiveTtsTurn({
    userId,
    sessionId,
    clientTurnId
  })

  assert.ok(activeTurn)
  assert.equal(activeTurn.acceptedSegments.has(segmentId), false)
  assert.equal(activeTurn.firstVoiceTaskId, null)

  abortActiveTtsTurn({
    userId,
    sessionId,
    clientTurnId
  })
})

test('visible-turn TTS retries replay the same accepted segment task id', async (t) => {
  const userId = 'user-tts-replay'
  const sessionId = 'session-tts-replay'
  const storyId = 'story-tts-replay'
  const clientTurnId = 'turn-tts-replay'
  const segmentId = 'seg-tts-replay'
  const requestId = 'req-tts-replay'
  const reservationId = 'res-tts-replay'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  const originalProviderWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  process.env.CHAT_TTS_PROVIDER_WS_URL = 'ws://127.0.0.1:65535/tts/ws'

  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  t.after(() => {
    restoreTransaction()
    if (originalProviderWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = originalProviderWsUrl
    }

    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany

    abortActiveTtsTurn({
      userId,
      sessionId,
      clientTurnId
    })
  })

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-2',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-2',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => 0

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async () => ({ count: 1 })

  const first = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'hello once',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(first.ok, true)
  if (!first.ok) {
    return
  }
  assert.equal(first.status, 202)

  const replay = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'hello once',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(replay.ok, true)
  if (!replay.ok) {
    return
  }
  assert.equal(replay.status, 202)
  assert.equal(replay.data.segment_id, segmentId)
  assert.equal(replay.data.parent_kind, 'visible_turn')
  assert.equal(replay.data.voice_task_id, first.data.voice_task_id)
  assert.equal(replay.data.stream_token.length > 0, true)
})

test('visible-turn post-registration failure rolls back segment and retry behaves as fresh acceptance', async (t) => {
  const userId = 'user-tts-rollback-retry'
  const sessionId = 'session-tts-rollback-retry'
  const storyId = 'story-tts-rollback-retry'
  const clientTurnId = 'turn-tts-rollback-retry'
  const segmentId = 'seg-tts-rollback-retry'
  const requestId = 'req-tts-rollback-retry'
  const reservationId = 'res-tts-rollback-retry'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  const originalProviderWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  t.after(() => {
    restoreTransaction()
    if (originalProviderWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = originalProviderWsUrl
    }

    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany

    abortActiveTtsTurn({
      userId,
      sessionId,
      clientTurnId
    })
  })

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-3',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-3',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => 0

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async () => ({ count: 1 })

  delete process.env.CHAT_TTS_PROVIDER_WS_URL

  const failed = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'should fail and rollback',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(failed.ok, false)
  if (failed.ok) {
    return
  }
  assert.equal(failed.status, 502)
  assert.equal(failed.code, 'TTS_PROVIDER_STREAM_FAILED')

  const afterFailure = getActiveTtsTurn({
    userId,
    sessionId,
    clientTurnId
  })
  assert.ok(afterFailure)
  assert.equal(afterFailure.acceptedSegments.has(segmentId), false)
  assert.equal(afterFailure.firstVoiceTaskId, null)

  process.env.CHAT_TTS_PROVIDER_WS_URL = 'ws://127.0.0.1:65535/tts/ws'

  const retryAccepted = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'retry after rollback',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(retryAccepted.ok, true)
  if (!retryAccepted.ok) {
    return
  }
  assert.equal(retryAccepted.status, 202)
  assert.equal(retryAccepted.data.segment_id, segmentId)
  assert.equal(retryAccepted.data.voice_task_id.length > 0, true)

  const replayAfterRetry = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'retry after rollback',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(replayAfterRetry.ok, true)
  if (!replayAfterRetry.ok) {
    return
  }
  assert.equal(replayAfterRetry.status, 202)
  assert.equal(replayAfterRetry.data.voice_task_id, retryAccepted.data.voice_task_id)
})

test('visible-turn provider startup failure rolls back owned quota reservation voice state', async (t) => {
  const userId = 'user-tts-reservation-rollback'
  const sessionId = 'session-tts-reservation-rollback'
  const storyId = 'story-tts-reservation-rollback'
  const clientTurnId = 'turn-tts-reservation-rollback'
  const segmentId = 'seg-tts-reservation-rollback'
  const requestId = 'req-tts-reservation-rollback'
  const reservationId = 'res-tts-reservation-rollback'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  const originalProviderWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  let reservationVoiceRequested = false
  let reservationVoiceConsumed = false
  let reservationVoiceTaskId: string | null = null
  let reservationAcceptedWriteReached = false
  let reservationRollbackWriteReached = false

  t.after(() => {
    restoreTransaction()
    if (originalProviderWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = originalProviderWsUrl
    }

    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany

    abortActiveTtsTurn({
      userId,
      sessionId,
      clientTurnId
    })
  })

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-reservation-rollback',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-reservation-rollback',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => 0

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async (args) => {
    const update = args as {
      where?: { id?: string; voiceTaskId?: string | null; voiceRequested?: boolean }
      data?: {
        voiceRequested?: boolean
        voiceConsumed?: boolean
        voiceTaskId?: string | null
      }
    }

    assert.equal(update.where?.id, reservationId)

    if (update.data?.voiceRequested === true) {
      reservationAcceptedWriteReached = true
      reservationVoiceRequested = true
      reservationVoiceConsumed = update.data.voiceConsumed === true
      reservationVoiceTaskId = update.data.voiceTaskId ?? null
      return { count: 1 }
    }

    reservationRollbackWriteReached = true
    assert.equal(update.where?.voiceTaskId, reservationVoiceTaskId)
    reservationVoiceRequested = false
    reservationVoiceConsumed = false
    reservationVoiceTaskId = update.data?.voiceTaskId ?? null
    return { count: 1 }
  }

  delete process.env.CHAT_TTS_PROVIDER_WS_URL

  const failed = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'force provider startup failure after reservation accept',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(failed.ok, false)
  if (failed.ok) {
    return
  }

  assert.equal(failed.status, 502)
  assert.equal(reservationAcceptedWriteReached, true)
  assert.equal(reservationRollbackWriteReached, true)
  assert.equal(reservationVoiceRequested, false)
  assert.equal(reservationVoiceConsumed, false)
  assert.equal(reservationVoiceTaskId, null)
})

test('visible-turn registration miss does not write quota reservation voice state', async (t) => {
  const userId = 'user-tts-registration-miss'
  const sessionId = 'session-tts-registration-miss'
  const storyId = 'story-tts-registration-miss'
  const clientTurnId = 'turn-tts-registration-miss'
  const segmentId = 'seg-tts-registration-miss'
  const requestId = 'req-tts-registration-miss'
  const reservationId = 'res-tts-registration-miss'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  const originalProviderWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  let reservationWriteReached = false

  t.after(() => {
    restoreTransaction()
    if (originalProviderWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = originalProviderWsUrl
    }

    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany

    abortActiveTtsTurn({
      userId,
      sessionId,
      clientTurnId
    })
  })

  process.env.CHAT_TTS_PROVIDER_WS_URL = 'ws://127.0.0.1:65535/tts/ws'

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-registration-miss',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-registration-miss',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => {
      abortActiveTtsTurn({
        userId,
        sessionId,
        clientTurnId
      })
      return 0
    }

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async () => {
    reservationWriteReached = true
    return { count: 1 }
  }

  const failed = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'active turn disappears before registration',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(failed.ok, false)
  if (failed.ok) {
    return
  }

  assert.equal(failed.status, 404)
  assert.equal(failed.code, 'ACTIVE_TURN_NOT_FOUND')
  assert.equal(reservationWriteReached, false)
})

test('visible-turn linked pending turn resets failed durable voiceTaskId before retry', async (t) => {
  const userId = 'user-tts-linked-pending'
  const sessionId = 'session-tts-linked-pending'
  const storyId = 'story-tts-linked-pending'
  const clientTurnId = 'turn-tts-linked-pending'
  const pendingTurnId = 'pending-tts-linked'
  const segmentId = 'seg-tts-linked-pending'
  const requestId = 'req-tts-linked-pending'
  const reservationId = 'res-tts-linked-pending'

  startActiveTtsTurn({
    userId,
    sessionId,
    storyId,
    kind: 'normal',
    clientTurnId,
    requestId,
    reservationId,
    ttlMs: 60_000
  })

  linkActiveTtsTurnPending({
    userId,
    sessionId,
    clientTurnId,
    pendingTurnId
  })

  const originalProviderWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  const originalUserFindUnique = prismaMock.user.findUnique
  const originalEntitlementFindMany = prismaMock.entitlement.findMany
  const originalExecuteRaw = prismaMock.$executeRaw
  const originalExecuteRawUnsafe = prismaMock.$executeRawUnsafe
  const originalQueryRaw = prismaMock.$queryRaw
  const originalUsageFindUnique = prismaMock.chatMessageUsage.findUnique
  const originalReservationCount = prismaMock.chatQuotaReservation.count
  const originalFindUnique = prismaMock.chatSession.findUnique
  const originalUpdateMany = prismaMock.chatQuotaReservation.updateMany
  const restoreTransaction = installTransactionPassthrough()

  let durableVoiceRequested = false
  let durableVoiceConsumed = false
  let durableVoiceTaskId: string | null = null
  let durableVoiceAcceptedWriteReached = false
  let executeRawCalls = 0

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const extractUuidFromArgs = (values: unknown[]): string | null => {
    for (const value of values) {
      if (typeof value === 'string' && uuidRegex.test(value)) {
        return value
      }

      if (Array.isArray(value)) {
        const nested = extractUuidFromArgs(value)
        if (nested) {
          return nested
        }
      }

      if (value && typeof value === 'object') {
        const objectValues = Object.values(value as Record<string, unknown>)
        const nested = extractUuidFromArgs(objectValues)
        if (nested) {
          return nested
        }
      }
    }

    return null
  }

  t.after(() => {
    restoreTransaction()
    if (originalProviderWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = originalProviderWsUrl
    }

    ;prismaMock.user.findUnique = originalUserFindUnique
    ;prismaMock.entitlement.findMany =
      originalEntitlementFindMany
    ;prismaMock.$executeRaw = originalExecuteRaw
    ;prismaMock.$executeRawUnsafe =
      originalExecuteRawUnsafe
    ;prismaMock.$queryRaw = originalQueryRaw
    ;prismaMock.chatMessageUsage.findUnique =
      originalUsageFindUnique
    ;prismaMock.chatQuotaReservation.count =
      originalReservationCount
    prismaMock.chatSession.findUnique = originalFindUnique
    prismaMock.chatQuotaReservation.updateMany = originalUpdateMany

    abortActiveTtsTurn({
      userId,
      sessionId,
      clientTurnId
    })
  })

  ;prismaMock.user.findUnique = async () => ({
    role: 'USER',
    tierCode: 'basic',
    tier: null
  })

  ;prismaMock.entitlement.findMany =
    async () => []

  ;prismaMock.$executeRawUnsafe = async () => 0

  ;prismaMock.$executeRaw = async (...args: unknown[]) => {
    executeRawCalls += 1
    const callVoiceTaskId = extractUuidFromArgs(args)

    if (executeRawCalls === 1) {
      durableVoiceAcceptedWriteReached = true
      durableVoiceRequested = true
      durableVoiceConsumed = true
      durableVoiceTaskId = callVoiceTaskId
      return 1
    }

    if (executeRawCalls === 2) {
      durableVoiceRequested = false
      durableVoiceConsumed = false
      durableVoiceTaskId = null
      return 1
    }

    durableVoiceRequested = true
    durableVoiceConsumed = true
    durableVoiceTaskId = callVoiceTaskId
    return 1
  }

  ;prismaMock.$queryRaw = async () => [
    {
      id: 'quota-period-4',
      userId,
      periodStartAt: new Date('2026-05-12T00:00:00.000Z'),
      periodEndAt: new Date('2026-06-11T00:00:00.000Z'),
      tierCode: 'basic',
      resetReason: 'default',
      sourceEventKey: null,
      actorUserId: null
    }
  ]

  ;prismaMock.chatMessageUsage.findUnique =
    async () => ({
      id: 'usage-4',
      messagesUsed: 0,
      voiceMessagesUsed: 0
    })

  ;prismaMock.chatQuotaReservation.count =
    async () => 0

  prismaMock.chatSession.findUnique = async () => ({
    id: sessionId,
    userId,
    storyId,
    previewText: null,
    story: {
      voiceFileUrl: null,
      character: {
        voiceFileUrl: null
      }
    }
  })

  prismaMock.chatQuotaReservation.updateMany = async () => ({ count: 1 })

  delete process.env.CHAT_TTS_PROVIDER_WS_URL

  const failed = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'force provider startup failure',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(failed.ok, false)
  if (failed.ok) {
    return
  }
  assert.equal(failed.status, 502)
  assert.equal(durableVoiceAcceptedWriteReached, true)
  const durablePendingTurnStateAfterFailure = {
    voiceRequested: durableVoiceRequested,
    voiceConsumed: durableVoiceConsumed,
    voiceTaskId: durableVoiceTaskId
  }
  assert.deepEqual(durablePendingTurnStateAfterFailure, {
    voiceRequested: false,
    voiceConsumed: false,
    voiceTaskId: null
  })
  assert.equal(durableVoiceRequested, false, 'rollback should clear durable voiceRequested flag after startup failure')
  assert.equal(durableVoiceConsumed, false, 'rollback should clear durable voiceConsumed flag after startup failure')
  assert.equal(durableVoiceTaskId, null)

  process.env.CHAT_TTS_PROVIDER_WS_URL = 'ws://127.0.0.1:65535/tts/ws'

  const retryAccepted = await requestTtsSegment(
    { userId, role: 'USER' as never },
    {
      parentKind: 'visible_turn',
      sessionId,
      clientTurnId,
      segmentId,
      sequenceIndex: 0,
      role: 'character',
      text: 'retry after durable rollback',
      voiceRef: null,
      voiceRefPath: null,
      emotion: null,
      emoText: null,
      emoAlpha: null,
      emotionVector: null,
      providerPlayerTier: 'basic'
    }
  )

  assert.equal(retryAccepted.ok, true)
  if (!retryAccepted.ok) {
    return
  }

  assert.equal(retryAccepted.status, 202)
  assert.equal(durableVoiceRequested, true)
  assert.equal(durableVoiceTaskId, retryAccepted.data.voice_task_id)
})
