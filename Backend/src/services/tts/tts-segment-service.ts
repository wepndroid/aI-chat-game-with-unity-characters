import { randomUUID } from 'node:crypto'
import { type UserRole } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { resolveTierQuotaForUser } from '../../lib/tier-quota'
import {
  buildQuotaSnapshotForUser,
  buildQuotaDeniedDetails,
  buildVoiceQuotaExceededData,
  getEffectiveUsageForPeriod,
  getReservedCountsForPeriod,
  hasReachedVoiceLimit
} from '../chat/chat-quota-service'
import { resolveCurrentQuotaPeriod } from '../chat/chat-quota-period-service'
import { findOwnedActiveChatSession } from '../chat/chat-session-access-service'
import { type AiProviderPlayerTier } from '../ai-provider-player-tier'
import { getActiveTtsTurn, registerActiveTtsSegment, unregisterActiveTtsSegment } from './tts-active-turn-registry'
import { issueVoiceTaskStreamToken } from './tts-stream-token-service'
import {
  resolveTtsProviderVoiceReference,
  TtsVoiceReferenceError,
  type ResolvedTtsProviderVoiceRef
} from '../../lib/tts-voice-ref-path'
import {
  countActiveVoiceTasksForUser,
  createVoiceTask,
  deleteVoiceTask,
  findSessionVoiceTask,
  getVoiceTask,
  type PublicVoiceTask
} from './tts-voice-task-store'
import { startProviderTtsStream } from './provider-tts-websocket-adapter'
import { acceptVisibleTurnVoiceState, rollbackVisibleTurnVoiceState } from './visible-turn-tts-durable-state-service'

type AuthUserLike = {
  userId: string
  role: UserRole
}

type TtsParentKind = 'visible_turn' | 'session_voice'
type TtsSessionVoiceUsageKind = 'sex_phrase'
type TtsSegmentRole = 'character' | 'narrator'

type TtsSegmentRequestBase = {
  parentKind: TtsParentKind
  sessionId: string
  segmentId: string
  sequenceIndex: number
  role: TtsSegmentRole
  text: string
  voiceRef?: string | null
  voiceRefPath?: string | null
  emotion?: string | null
  emoText?: string | null
  emoAlpha?: number | null
  emotionVector?: string | null
  providerPlayerTier: AiProviderPlayerTier
}

type VisibleTurnTtsSegmentRequest = TtsSegmentRequestBase & {
  parentKind: 'visible_turn'
  clientTurnId: string
}

type SessionVoiceTtsSegmentRequest = TtsSegmentRequestBase & {
  parentKind: 'session_voice'
  clientRequestId: string
  usageKind: TtsSessionVoiceUsageKind
}

type TtsSegmentRequest = VisibleTurnTtsSegmentRequest | SessionVoiceTtsSegmentRequest

type TtsSegmentSuccess = {
  ok: true
  status: number
  data: {
    parent_kind: TtsParentKind
    voice_task_id: string
    session_id: string
    client_turn_id?: string
    client_request_id?: string
    segment_id: string
    sequence_index: number
    usage_kind?: TtsSessionVoiceUsageKind
    role: TtsSegmentRole
    voice_ref_path: string
    stream_token: string
    stream_token_expires_at: string
    status: string
    non_quota: boolean
    quota: Awaited<ReturnType<typeof buildQuotaSnapshotForUser>>
  }
}

type TtsSegmentFailure = {
  ok: false
  status: number
  code: string
  message: string
  details?: Record<string, unknown> | null
  data?: Record<string, unknown>
}

const MAX_ACTIVE_VOICE_TASKS_PER_USER = 16

const resolveVoiceRefPath = async (input: {
  role: TtsSegmentRole
  requestedVoiceRef?: string | null
  requestedVoiceRefPath?: string | null
  defaultVoiceFileUrl?: string | null
}): Promise<ResolvedTtsProviderVoiceRef> => {
  const explicitPath = input.requestedVoiceRefPath?.trim()
  if (explicitPath) {
    return (
      (await resolveTtsProviderVoiceReference(explicitPath)) ?? {
        voiceRefPath: explicitPath,
        uploadedVoiceRegistrationId: null,
        providerVoiceAlias: null,
        canRefreshProviderAlias: false
      }
    )
  }

  const explicitRef = input.requestedVoiceRef?.trim()
  if (explicitRef) {
    return (
      (await resolveTtsProviderVoiceReference(explicitRef)) ?? {
        voiceRefPath: explicitRef,
        uploadedVoiceRegistrationId: null,
        providerVoiceAlias: null,
        canRefreshProviderAlias: false
      }
    )
  }

  if (input.role === 'narrator') {
    return {
      voiceRefPath: 'narrator',
      uploadedVoiceRegistrationId: null,
      providerVoiceAlias: null,
      canRefreshProviderAlias: false
    }
  }

  const defaultVoiceFileUrl = input.defaultVoiceFileUrl?.trim()
  return defaultVoiceFileUrl && defaultVoiceFileUrl.length > 0
    ? (await resolveTtsProviderVoiceReference(defaultVoiceFileUrl)) ?? {
        voiceRefPath: defaultVoiceFileUrl,
        uploadedVoiceRegistrationId: null,
        providerVoiceAlias: null,
        canRefreshProviderAlias: false
      }
    : {
        voiceRefPath: 'default',
        uploadedVoiceRegistrationId: null,
        providerVoiceAlias: null,
        canRefreshProviderAlias: false
      }
}

const buildVoiceReferenceFailure = (error: unknown): TtsSegmentFailure => {
  const isKnownVoiceReferenceError = error instanceof TtsVoiceReferenceError
  if (!isKnownVoiceReferenceError) {
    console.warn('[tts] Failed to prepare voice reference for provider.', error)
  }

  return {
    ok: false,
    status: isKnownVoiceReferenceError
      ? error.code === 'UNSUPPORTED_HTTP_VOICE_REFERENCE'
        ? 400
        : error.code === 'UPLOADED_VOICE_NOT_READY'
          ? 409
          : 502
      : 502,
    code: isKnownVoiceReferenceError ? error.code : 'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
    message: isKnownVoiceReferenceError
      ? error.message
      : 'Uploaded voice could not be registered with the TTS provider.'
  }
}

const checkVoiceQuotaGate = async (userId: string, options: { alreadyAcceptedOnParentTurn: boolean }) => {
  const tierQuota = await resolveTierQuotaForUser(userId)
  const quotaPeriod = await resolveCurrentQuotaPeriod(userId, tierQuota)
  const { periodStart, periodEnd } = quotaPeriod
  const usageSnapshot = await getEffectiveUsageForPeriod(userId, periodStart, periodEnd)
  const reservedCounts = await getReservedCountsForPeriod(userId, periodStart)

  if (!tierQuota.voiceEnabled) {
    return {
      allowed: false as const,
      data: buildVoiceQuotaExceededData({
        userId,
        tierCode: tierQuota.tierCode,
        periodEnd,
        messageLimit: tierQuota.limit,
        messageUsed: usageSnapshot.effectiveMessagesUsed,
        messageReserved: reservedCounts.messageReserved,
        unlimitedMessages: tierQuota.unlimitedMessages,
        voiceEnabled: tierQuota.voiceEnabled,
        voiceLimit: tierQuota.voiceLimit,
        voiceUsed: usageSnapshot.effectiveVoiceUsed,
        voiceReserved: reservedCounts.voiceReserved,
        unlimitedVoice: tierQuota.unlimitedVoice,
        voiceStatus: 'disabled'
      })
    }
  }

  if (!options.alreadyAcceptedOnParentTurn) {
    const voiceLimitReached = hasReachedVoiceLimit({
      voiceEnabled: tierQuota.voiceEnabled,
      unlimitedVoice: tierQuota.unlimitedVoice,
      used: usageSnapshot.effectiveVoiceUsed,
      reserved: reservedCounts.voiceReserved,
      limit: tierQuota.voiceLimit
    })

    if (voiceLimitReached) {
      return {
        allowed: false as const,
        data: buildVoiceQuotaExceededData({
          userId,
          tierCode: tierQuota.tierCode,
          periodEnd,
          messageLimit: tierQuota.limit,
          messageUsed: usageSnapshot.effectiveMessagesUsed,
          messageReserved: reservedCounts.messageReserved,
          unlimitedMessages: tierQuota.unlimitedMessages,
          voiceEnabled: tierQuota.voiceEnabled,
          voiceLimit: tierQuota.voiceLimit,
          voiceUsed: usageSnapshot.effectiveVoiceUsed,
          voiceReserved: reservedCounts.voiceReserved,
          unlimitedVoice: tierQuota.unlimitedVoice,
          voiceStatus: 'quota_exhausted'
        })
      }
    }
  }

  return { allowed: true as const }
}

const buildReplayResponse = async (
  userId: string,
  task: PublicVoiceTask
): Promise<TtsSegmentSuccess | TtsSegmentFailure> => {
  if (task.audioBufferEvicted) {
    return {
      ok: false,
      status: 410,
      code: 'VOICE_TASK_EXPIRED',
      message: 'Voice task stream buffers expired.'
    }
  }

  const token = issueVoiceTaskStreamToken(task.voiceTaskId)
  if (!token) {
    return {
      ok: false,
      status: 410,
      code: 'VOICE_TASK_EXPIRED',
      message: 'Voice task stream buffers expired.'
    }
  }

  const data: TtsSegmentSuccess['data'] = {
    parent_kind: task.parentKind,
    voice_task_id: task.voiceTaskId,
    session_id: task.sessionId,
    segment_id: task.segmentId,
    sequence_index: task.sequenceIndex,
    role: task.role,
    voice_ref_path: task.voiceRefPath,
    stream_token: token.streamToken,
    stream_token_expires_at: new Date(token.expiresAtMs).toISOString(),
    status: task.status,
    non_quota: task.kind !== 'normal',
    quota: await buildQuotaSnapshotForUser(userId, {
      voiceRequested: true,
      voiceStatus: 'not_generated'
    })
  }

  if (task.parentKind === 'visible_turn' && task.clientTurnId) {
    data.client_turn_id = task.clientTurnId
  }

  if (task.parentKind === 'session_voice' && task.clientRequestId && task.usageKind) {
    data.client_request_id = task.clientRequestId
    data.usage_kind = task.usageKind
  }

  return {
    ok: true,
    status: 202,
    data
  }
}

const loadSessionVoiceFileUrl = async (sessionId: string) => {
  const chatSession = await prisma.chatSession.findUnique({
    where: {
      id: sessionId
    },
    select: {
      story: {
        select: {
          voiceFileUrl: true,
          character: {
            select: {
              voiceFileUrl: true
            }
          }
        }
      }
    }
  })

  return chatSession?.story?.voiceFileUrl ?? chatSession?.story?.character?.voiceFileUrl ?? null
}

const rollbackVisibleTurnSegmentRegistration = async (input: {
  userId: string
  sessionId: string
  clientTurnId: string
  segmentId: string
  voiceTaskId: string
  reservationId: string
  kind: 'normal' | 'gameplay'
  pendingTurnId?: string | null
}) => {
  const unregisterResult = unregisterActiveTtsSegment({
    userId: input.userId,
    sessionId: input.sessionId,
    clientTurnId: input.clientTurnId,
    segmentId: input.segmentId,
    voiceTaskId: input.voiceTaskId
  })
  deleteVoiceTask(input.voiceTaskId)

  try {
    await rollbackVisibleTurnVoiceState({
      userId: input.userId,
      reservationId: input.reservationId,
      kind: input.kind,
      pendingTurnId: input.pendingTurnId ?? null,
      failedVoiceTaskId: input.voiceTaskId
    })
  } catch (error) {
    logVisibleTurnSegmentFailure({
      level: 'error',
      phase: 'rollback_failed',
      userId: input.userId,
      sessionId: input.sessionId,
      segmentId: input.segmentId,
      voiceTaskId: input.voiceTaskId,
      details: {
        reservation_id: input.reservationId,
        pending_turn_id: input.pendingTurnId ?? null,
        active_segment_removed: unregisterResult.removed,
        error: error instanceof Error ? error.message : String(error)
      }
    })
    throw error
  }
}

const logVisibleTurnSegmentFailure = (input: {
  level: 'warn' | 'error'
  phase: string
  userId: string
  sessionId: string
  segmentId: string
  voiceTaskId: string
  details?: Record<string, unknown>
}) => {
  const payload = {
    phase: input.phase,
    user_id: input.userId,
    session_id: input.sessionId,
    segment_id: input.segmentId,
    voice_task_id: input.voiceTaskId,
    ...(input.details ?? {})
  }

  if (input.level === 'error') {
    console.error('[tts] visible-turn segment failure', payload)
    return
  }

  console.warn('[tts] visible-turn segment failure', payload)
}

/**
 * Visible-turn TTS is tied to one active `/api/chat/send` or
 * `/api/chat/gameplay-send` turn. Only this branch can touch pending-turn voice
 * flags or chat quota reservations because voice consumption is finalized by
 * the pending-turn commit lifecycle.
 */
const requestVisibleTurnTtsSegment = async (
  authUser: AuthUserLike,
  request: VisibleTurnTtsSegmentRequest
): Promise<TtsSegmentSuccess | TtsSegmentFailure> => {
  const activeTurn = getActiveTtsTurn({
    userId: authUser.userId,
    sessionId: request.sessionId,
    clientTurnId: request.clientTurnId
  })

  if (!activeTurn) {
    return {
      ok: false,
      status: 404,
      code: 'ACTIVE_TURN_NOT_FOUND',
      message: 'Active chat turn not found for this TTS segment.'
    }
  }

  const chatSession = await prisma.chatSession.findUnique({
    where: {
      id: request.sessionId
    },
    select: {
      id: true,
      userId: true,
      storyId: true,
      previewText: true,
      story: {
        select: {
          voiceFileUrl: true,
          character: {
            select: {
              voiceFileUrl: true
            }
          }
        }
      }
    }
  })

  if (!chatSession || chatSession.userId !== authUser.userId) {
    return {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Chat session not found.'
    }
  }

  if (chatSession.storyId !== activeTurn.storyId) {
    return {
      ok: false,
      status: 409,
      code: 'ACTIVE_TURN_STORY_MISMATCH',
      message: 'Active chat turn no longer matches this session story.'
    }
  }

  const existingVoiceTaskId = activeTurn.acceptedSegments.get(request.segmentId)
  if (existingVoiceTaskId) {
    const existingTask = getVoiceTask(existingVoiceTaskId)
    if (!existingTask) {
      return {
        ok: false,
        status: 410,
        code: 'VOICE_TASK_EXPIRED',
        message: 'Voice task stream buffers expired. Request a new visible turn before retrying this segment.'
      }
    }

    return buildReplayResponse(authUser.userId, existingTask)
  }

  const quotaGate = await checkVoiceQuotaGate(authUser.userId, {
    alreadyAcceptedOnParentTurn: Boolean(activeTurn.firstVoiceTaskId)
  })
  if (!quotaGate.allowed) {
    return {
      ok: false,
      status: 403,
      code: 'QUOTA_EXHAUSTED',
      message: quotaGate.data.voice_quota.user_message ?? 'Voice quota is exhausted.',
      details: buildQuotaDeniedDetails('voice', quotaGate.data)
    }
  }

  if (countActiveVoiceTasksForUser(authUser.userId) >= MAX_ACTIVE_VOICE_TASKS_PER_USER) {
    return {
      ok: false,
      status: 429,
      code: 'TTS_TASK_LIMIT_REACHED',
      message: 'Too many voice tasks are active. Wait for the current voice stream to finish before requesting more.'
    }
  }

  const voiceTaskId = randomUUID()
  let voiceReference: ResolvedTtsProviderVoiceRef
  try {
    voiceReference = await resolveVoiceRefPath({
      role: request.role,
      requestedVoiceRef: request.voiceRef,
      requestedVoiceRefPath: request.voiceRefPath,
      defaultVoiceFileUrl: chatSession.story?.voiceFileUrl ?? chatSession.story?.character?.voiceFileUrl ?? null
    })
  } catch (error) {
    return buildVoiceReferenceFailure(error)
  }

  const task = createVoiceTask({
    voiceTaskId,
    userId: authUser.userId,
    sessionId: chatSession.id,
    storyId: chatSession.storyId,
    kind: activeTurn.kind,
    parentKind: 'visible_turn',
    clientTurnId: request.clientTurnId,
    clientRequestId: null,
    usageKind: null,
    segmentId: request.segmentId,
    sequenceIndex: request.sequenceIndex,
    role: request.role,
    text: request.text,
    voiceRefPath: voiceReference.voiceRefPath,
    uploadedVoiceRegistrationId: voiceReference.uploadedVoiceRegistrationId,
    providerVoiceAlias: voiceReference.providerVoiceAlias,
    providerVoiceAliasRefreshAttempted: false,
    emotion: request.emotion ?? null,
    emoText: request.emoText ?? null,
    emoAlpha: request.emoAlpha ?? null,
    emotionVector: request.emotionVector ?? null,
    providerPlayerTier: request.providerPlayerTier,
    requestId: activeTurn.requestId
  })

  const registration = registerActiveTtsSegment({
    userId: authUser.userId,
    sessionId: chatSession.id,
    clientTurnId: request.clientTurnId,
    segmentId: request.segmentId,
    voiceTaskId
  })

  if (registration.status === 'missing') {
    logVisibleTurnSegmentFailure({
      level: 'warn',
      phase: 'registration_failed',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId
    })
    deleteVoiceTask(voiceTaskId)
    return {
      ok: false,
      status: 404,
      code: 'ACTIVE_TURN_NOT_FOUND',
      message: 'Active chat turn not found for this TTS segment.'
    }
  }

  if (registration.status === 'replay') {
    logVisibleTurnSegmentFailure({
      level: 'warn',
      phase: 'registration_conflict_replay',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId,
      details: {
        accepted_voice_task_id: registration.voiceTaskId
      }
    })
    deleteVoiceTask(voiceTaskId)
    const replayTask = getVoiceTask(registration.voiceTaskId)
    if (!replayTask) {
      logVisibleTurnSegmentFailure({
        level: 'warn',
        phase: 'replay_task_missing',
        userId: authUser.userId,
        sessionId: chatSession.id,
        segmentId: request.segmentId,
        voiceTaskId: registration.voiceTaskId
      })
      return {
        ok: false,
        status: 410,
        code: 'VOICE_TASK_EXPIRED',
        message: 'Voice task stream buffers expired. Request a new visible turn before retrying this segment.'
      }
    }

    return buildReplayResponse(authUser.userId, replayTask)
  }

  try {
    await acceptVisibleTurnVoiceState({
      userId: authUser.userId,
      activeTurn: registration.activeTurn,
      voiceTaskId,
      acceptedAsFirstSegment: registration.acceptedAsFirstSegment
    })
  } catch (error) {
    unregisterActiveTtsSegment({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: request.clientTurnId,
      segmentId: request.segmentId,
      voiceTaskId
    })
    deleteVoiceTask(voiceTaskId)
    logVisibleTurnSegmentFailure({
      level: 'error',
      phase: 'durable_write_failed',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId,
      details: {
        reservation_id: registration.activeTurn.reservationId,
        pending_turn_id: registration.activeTurn.pendingTurnId,
        accepted_as_first_segment: registration.acceptedAsFirstSegment,
        error: error instanceof Error ? error.message : String(error)
      }
    })
    throw error
  }

  const token = issueVoiceTaskStreamToken(voiceTaskId)
  if (!token) {
    logVisibleTurnSegmentFailure({
      level: 'error',
      phase: 'stream_token_issue_failed',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId
    })
    await rollbackVisibleTurnSegmentRegistration({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: request.clientTurnId,
      segmentId: request.segmentId,
      voiceTaskId,
      reservationId: registration.activeTurn.reservationId,
      kind: registration.activeTurn.kind,
      pendingTurnId: registration.activeTurn.pendingTurnId
    })
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to issue voice stream token.'
    }
  }

  try {
    startProviderTtsStream(task)
  } catch (error) {
    logVisibleTurnSegmentFailure({
      level: 'error',
      phase: 'provider_dispatch_failed',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    })
    await rollbackVisibleTurnSegmentRegistration({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: request.clientTurnId,
      segmentId: request.segmentId,
      voiceTaskId,
      reservationId: registration.activeTurn.reservationId,
      kind: registration.activeTurn.kind,
      pendingTurnId: registration.activeTurn.pendingTurnId
    })
    return {
      ok: false,
      status: 502,
      code: 'TTS_PROVIDER_STREAM_FAILED',
      message: 'TTS provider stream could not be started.'
    }
  }

  const startedTask = getVoiceTask(voiceTaskId)
  if (!startedTask || (startedTask.terminalAtMs && startedTask.status !== 'complete')) {
    logVisibleTurnSegmentFailure({
      level: 'error',
      phase: 'provider_startup_terminal',
      userId: authUser.userId,
      sessionId: chatSession.id,
      segmentId: request.segmentId,
      voiceTaskId,
      details: {
        task_missing: !startedTask,
        terminal_status: startedTask?.status ?? null
      }
    })
    await rollbackVisibleTurnSegmentRegistration({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: request.clientTurnId,
      segmentId: request.segmentId,
      voiceTaskId,
      reservationId: registration.activeTurn.reservationId,
      kind: registration.activeTurn.kind,
      pendingTurnId: registration.activeTurn.pendingTurnId
    })
    return {
      ok: false,
      status: 502,
      code: 'TTS_PROVIDER_STREAM_FAILED',
      message: 'TTS provider stream could not be started.'
    }
  }

  return {
    ok: true,
    status: 202,
    data: {
      parent_kind: 'visible_turn',
      voice_task_id: voiceTaskId,
      session_id: chatSession.id,
      client_turn_id: request.clientTurnId,
      segment_id: request.segmentId,
      sequence_index: request.sequenceIndex,
      role: request.role,
      voice_ref_path: voiceReference.voiceRefPath,
      stream_token: token.streamToken,
      stream_token_expires_at: new Date(token.expiresAtMs).toISOString(),
      status: 'queued',
      non_quota: activeTurn.kind === 'gameplay',
      quota: await buildQuotaSnapshotForUser(authUser.userId, {
        voiceRequested: true,
        voiceStatus: 'not_generated'
      })
    }
  }
}

/**
 * Session voice is for Unity-owned speech that belongs to an authenticated chat
 * session but not to a visible chat turn. In 12C this is intentionally limited
 * to sex phrases: it is tier/voice-quota gated, non-consuming, idempotent, and
 * must not mutate transcript, pending-turn, reservation, preview, or Unity-state
 * persistence. Adding another usage kind is a backend contract decision because
 * quota and persistence policy are part of the server security boundary.
 */
const requestSessionVoiceTtsSegment = async (
  authUser: AuthUserLike,
  request: SessionVoiceTtsSegmentRequest
): Promise<TtsSegmentSuccess | TtsSegmentFailure> => {
  const ownedSession = await findOwnedActiveChatSession({
    sessionId: request.sessionId,
    userId: authUser.userId
  })

  if (!ownedSession) {
    return {
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
      message: 'Chat session not found.'
    }
  }

  const existingTask = findSessionVoiceTask({
    userId: authUser.userId,
    sessionId: ownedSession.id,
    clientRequestId: request.clientRequestId,
    segmentId: request.segmentId
  })
  if (existingTask) {
    return buildReplayResponse(authUser.userId, existingTask)
  }

  const quotaGate = await checkVoiceQuotaGate(authUser.userId, {
    alreadyAcceptedOnParentTurn: false
  })
  if (!quotaGate.allowed) {
    return {
      ok: false,
      status: 403,
      code: 'QUOTA_EXHAUSTED',
      message: quotaGate.data.voice_quota.user_message ?? 'Voice quota is exhausted.',
      details: buildQuotaDeniedDetails('voice', quotaGate.data)
    }
  }

  if (countActiveVoiceTasksForUser(authUser.userId) >= MAX_ACTIVE_VOICE_TASKS_PER_USER) {
    return {
      ok: false,
      status: 429,
      code: 'TTS_TASK_LIMIT_REACHED',
      message: 'Too many voice tasks are active. Wait for the current voice stream to finish before requesting more.'
    }
  }

  const voiceTaskId = randomUUID()
  let voiceReference: ResolvedTtsProviderVoiceRef
  try {
    voiceReference = await resolveVoiceRefPath({
      role: request.role,
      requestedVoiceRef: request.voiceRef,
      requestedVoiceRefPath: request.voiceRefPath,
      defaultVoiceFileUrl: await loadSessionVoiceFileUrl(ownedSession.id)
    })
  } catch (error) {
    return buildVoiceReferenceFailure(error)
  }

  const task = createVoiceTask({
    voiceTaskId,
    userId: authUser.userId,
    sessionId: ownedSession.id,
    storyId: ownedSession.storyId,
    kind: 'session_voice',
    parentKind: 'session_voice',
    clientTurnId: null,
    clientRequestId: request.clientRequestId,
    usageKind: request.usageKind,
    segmentId: request.segmentId,
    sequenceIndex: request.sequenceIndex,
    role: request.role,
    text: request.text,
    voiceRefPath: voiceReference.voiceRefPath,
    uploadedVoiceRegistrationId: voiceReference.uploadedVoiceRegistrationId,
    providerVoiceAlias: voiceReference.providerVoiceAlias,
    providerVoiceAliasRefreshAttempted: false,
    emotion: request.emotion ?? null,
    emoText: request.emoText ?? null,
    emoAlpha: request.emoAlpha ?? null,
    emotionVector: request.emotionVector ?? null,
    providerPlayerTier: request.providerPlayerTier,
    requestId: `session_voice:${request.clientRequestId}`
  })

  const token = issueVoiceTaskStreamToken(voiceTaskId)
  if (!token) {
    return {
      ok: false,
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'Failed to issue voice stream token.'
    }
  }

  startProviderTtsStream(task)

  return {
    ok: true,
    status: 202,
    data: {
      parent_kind: 'session_voice',
      voice_task_id: voiceTaskId,
      session_id: ownedSession.id,
      client_request_id: request.clientRequestId,
      segment_id: request.segmentId,
      sequence_index: request.sequenceIndex,
      usage_kind: request.usageKind,
      role: request.role,
      voice_ref_path: voiceReference.voiceRefPath,
      stream_token: token.streamToken,
      stream_token_expires_at: new Date(token.expiresAtMs).toISOString(),
      status: 'queued',
      non_quota: true,
      quota: await buildQuotaSnapshotForUser(authUser.userId, {
        voiceRequested: true,
        voiceStatus: 'not_generated'
      })
    }
  }
}

/**
 * Accepts one Unity-owned TTS sentence/chunk. The required `parentKind`
 * discriminator keeps visible-turn voice and session-scoped sex phrase voice
 * from sharing ambiguous nullable parent fields or accidental persistence rules.
 */
const requestTtsSegment = async (
  authUser: AuthUserLike,
  request: TtsSegmentRequest
): Promise<TtsSegmentSuccess | TtsSegmentFailure> => {
  if (request.parentKind === 'visible_turn') {
    return requestVisibleTurnTtsSegment(authUser, request)
  }

  return requestSessionVoiceTtsSegment(authUser, request)
}

export { requestTtsSegment }
export type {
  SessionVoiceTtsSegmentRequest,
  TtsParentKind,
  TtsSegmentRequest,
  TtsSegmentRole,
  TtsSessionVoiceUsageKind,
  VisibleTurnTtsSegmentRequest
}
