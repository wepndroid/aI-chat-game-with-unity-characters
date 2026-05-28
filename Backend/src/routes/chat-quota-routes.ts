import { createHash } from 'node:crypto'
import {
  Prisma,
  ChatMessageRole,
  ChatQuotaReservationStatus,
  type UserRole
} from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth-middleware'
import { requireGameAccess } from '../middleware/game-access-middleware'
import {
  unityChatSendRequestSchema,
  unityGameplaySendRequestSchema,
  type UnityAnimationCapabilities,
  type UnityChatSendRequest,
  type UnityGameplaySendRequest,
  type UnityRuntimeContext
} from '../contracts/unity-client-contract'
import { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError } from '../lib/api-contract'
import { getRequiredGameAccessContext } from '../lib/game-access'
import { prisma } from '../lib/prisma'
import { resolveTierQuotaForUser } from '../lib/tier-quota'
import { getChatAiProviderErrorDetails, getChatAiProviderErrorReason } from '../services/chat/chat-ai-error'
import { toAiProviderPlayerTier } from '../services/ai-provider-player-tier'
import {
  buildQuotaAllowedData,
  buildQuotaDeniedDetails,
  buildQuotaExceededData,
  buildQuotaSnapshotForUser,
  getEffectiveUsageForPeriod,
  getReservedCountsForPeriod,
  hasReachedMessageLimit,
  hasReachedVoiceLimit,
  type VoiceStatus
} from '../services/chat/chat-quota-service'
import { resolveCurrentQuotaPeriod } from '../services/chat/chat-quota-period-service'
import {
  generateVisibleAssistantReply,
  type GenerateVisibleAssistantReplyResult
} from '../services/chat/visible-chat-generation-service'
import { resolvePromptDebugDecision } from '../services/chat/prompt/prompt-debug-policy'
import {
  cleanupExpiredPendingTurnsForUser,
  createPendingTurn,
  findPendingTurnById,
  findPendingTurnByRequest,
  hasActivePendingTurnForSession,
  markPendingTurnAborted,
  PENDING_TURN_TTL_MS,
  type PendingTurn
} from '../services/chat/chat-pending-turn-service'
import { getUnitySessionState, upsertUnitySessionState } from '../services/chat/unity-session-state-service'
import {
  mapStorySessionContextErrorToApiCode,
  resolveStorySessionContext
} from '../services/chat/story-session-context-service'
import {
  createStoryChatSession,
  serializeSessionItem
} from '../services/chat/story-chat-session-service'
import { commitPendingTurn } from '../services/chat/pending-turn-commit-service'
import { processChatCommitBackgroundWork } from '../services/chat/chat-commit-background-work-service'
import {
  abortActiveTtsTurn,
  commitActiveTtsTurn,
  getActiveTtsTurnVoiceState,
  linkActiveTtsTurnPending,
  startActiveTtsTurn
} from '../services/tts/tts-active-turn-registry'

const chatQuotaRoutes = Router()

const consumeSchema = z.object({
  userId: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  voice_enabled: z.boolean().optional().default(false)
}).strict()

const statusSchema = z.object({
  userId: z.string().min(1).optional(),
  user_id: z.string().min(1).optional(),
  voice_enabled: z.coerce.boolean().optional().default(false)
}).strict()

const listChatSessionsSchema = z.object({
  characterId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
}).strict()

const chatSessionParamsSchema = z.object({
  sessionId: z.string().min(1)
})

const listChatMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(120)
}).strict()

const createSpecSessionSchema = z.object({
  story_id: z.string().trim().min(1)
}).strict()

const listSpecSessionsSchema = z.object({
  story_id: z.string().trim().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
}).strict()

const listStorySessionsParamsSchema = z.object({
  story_id: z.string().trim().min(1)
}).strict()

const listSessionMessagesParamsSchema = z.object({
  session_id: z.string().trim().min(1)
}).strict()

const unityStateParamsSchema = z
  .object({
    session_id: z.string().trim().min(1)
  })
  .strict()

const unityStateUpsertSchema = z
  .object({
    metadata_version: z.coerce.number().int().min(1),
    metadata: z.record(z.string(), z.unknown())
  })
  .strict()

const pendingTurnParamsSchema = z
  .object({
    pending_turn_id: z.string().trim().min(1)
  })
  .strict()

const pendingTurnCommitSchema = z
  .object({
    session_id: z.string().trim().min(1),
    client_turn_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/),
    assistant_message_sha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
    unity_state: unityStateUpsertSchema
  })
  .strict()

const pendingTurnAbortSchema = z
  .object({
    session_id: z.string().trim().min(1),
    client_turn_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/),
    reason: z.string().trim().min(1).max(64).regex(/^[a-z0-9_:-]+$/)
  })
  .strict()

const listSessionMessagesQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    order: z.enum(['asc', 'desc']).default('asc')
  })
  .strict()

type AuthUserLike = {
  userId: string
  role: UserRole
  isEmailVerified: boolean
}

const GAMEPLAY_CLIENT_MESSAGE_PREFIX = 'event:'
const GAMEPLAY_REQUEST_ID_PREFIX = 'gameplay:'

const hashRequestFingerprint = (input: {
  sessionId: string
  message: string
  unityRuntimeContext: UnityRuntimeContext
  animationCapabilities: UnityAnimationCapabilities
}) =>
  createHash('sha256')
    .update(
      `${input.sessionId}\n${input.message}\n${toStableJson(input.unityRuntimeContext)}\n${toStableJson(input.animationCapabilities)}`,
      'utf8'
    )
    .digest('hex')

const toStableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJson(item)).join(',')}]`
  }

  const objectValue = value as Record<string, unknown>
  const keys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${toStableJson(objectValue[key])}`).join(',')}}`
}

const hashGameplayRequestFingerprint = (input: {
  sessionId: string
  eventType: string
  eventDisplayText: string
  eventPayload: Record<string, unknown>
  unityRuntimeContext: UnityRuntimeContext
  animationCapabilities: UnityAnimationCapabilities
}) =>
  createHash('sha256')
    .update(
      `${input.sessionId}\n${input.eventType}\n${input.eventDisplayText}\n${toStableJson(input.eventPayload)}\n${toStableJson(input.unityRuntimeContext)}\n${toStableJson(input.animationCapabilities)}`,
      'utf8'
    )
    .digest('hex')

const isSseRequested = (request: Request, bodyStreamFlag: boolean) => {
  if (bodyStreamFlag) {
    return true
  }

  const streamQuery = request.query.stream
  if (typeof streamQuery === 'string') {
    const normalized = streamQuery.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true
    }
  }

  const acceptHeader = request.header('accept')?.toLowerCase() ?? ''
  return acceptHeader.includes('text/event-stream')
}

const initSseResponse = (response: Response) => {
  response.status(200)
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.flushHeaders?.()
}

/**
 * Unity consumes one JSON payload per SSE `data:` block. Visible chat streams
 * emit `token` events while the upstream provider is still generating, then one `done` event
 * only after transcript persistence and quota finalization have succeeded.
 * Changing these event names or final payload fields requires a Unity DTO/parser
 * update in AI-VRM.
 */
const writeSseEvent = (response: Response, payload: Record<string, unknown>) => {
  if (response.writableEnded || response.destroyed) {
    return
  }
  response.write(`data: ${JSON.stringify(payload)}\n\n`)
}

const endSseWithError = (
  response: Response,
  input: { code: string; message: string; details?: Record<string, unknown> | null }
) => {
  if (response.writableEnded || response.destroyed) {
    return
  }
  writeSseEvent(response, {
    type: 'error',
    code: input.code,
    message: input.message,
    details: input.details ?? null
  })
  response.end()
}

/**
 * Couples the upstream provider stream to the Unity client lifecycle.
 * The completion stream adapter owns connect/idle/total deadlines; this signal is only for
 * client disconnects so an abandoned Unity request does not keep a provider
 * generation slot or quota reservation alive.
 */
const createClientDisconnectSignal = (request: Request, response: Response) => {
  const controller = new AbortController()
  const abort = () => {
    if (!response.writableEnded && !controller.signal.aborted) {
      controller.abort()
    }
  }

  request.on('aborted', abort)
  response.on('close', abort)

  return {
    signal: controller.signal,
    dispose: () => {
      request.off('aborted', abort)
      response.off('close', abort)
    }
  }
}

const splitIntoSseTokens = (content: string) => {
  const chunks = content.match(/\S+\s*/g)
  if (chunks && chunks.length > 0) {
    return chunks
  }
  return [content]
}

const requireStreamMode = (response: Response, streamMode: boolean) => {
  if (streamMode) {
    return true
  }

  sendApiError(
    response,
    400,
    'VALIDATION_FAILED',
    'stream=true is required for Unity chat endpoints. Pending-turn commit semantics do not support buffered sends.'
  )
  return false
}

const buildPendingDoneData = (pendingTurn: PendingTurn, generationDiagnostics?: Record<string, unknown> | null) => {
  if (pendingTurn.kind === 'gameplay') {
    return {
      session_id: pendingTurn.sessionId,
      pending_turn_id: pendingTurn.id,
      client_turn_id: pendingTurn.clientTurnId,
      assistant_message_sha256: pendingTurn.assistantSha256,
      non_quota: true,
      idempotency_replayed: false,
      client_event_id: pendingTurn.clientTurnId,
      event_type: pendingTurn.gameplayEventType,
      event_message: {
        id: null,
        role: 'GAMEPLAY',
        content: pendingTurn.gameplayDisplayText,
        client_event_id: pendingTurn.clientTurnId,
        created_at: null
      },
      assistant_message: {
        id: null,
        role: 'ASSISTANT',
        content: pendingTurn.assistantText,
        client_event_id: pendingTurn.clientTurnId,
        created_at: null,
        audio_url: pendingTurn.voiceAudioUrl
      },
      voice_task_id: pendingTurn.voiceTaskId,
      provider: pendingTurn.provider,
      generation_diagnostics: generationDiagnostics ?? null
    }
  }

  return {
    allowed: true,
    session_id: pendingTurn.sessionId,
    pending_turn_id: pendingTurn.id,
    client_turn_id: pendingTurn.clientTurnId,
    assistant_message_sha256: pendingTurn.assistantSha256,
    idempotency_replayed: false,
    user_message: {
      id: null,
      role: 'USER',
      content: pendingTurn.messageText,
      created_at: null
    },
    assistant_message: {
      id: null,
      role: 'ASSISTANT',
      content: pendingTurn.assistantText,
      created_at: null,
      audio_url: pendingTurn.voiceAudioUrl
    },
    voice_task_id: pendingTurn.voiceTaskId,
    provider: pendingTurn.provider,
    generation_diagnostics: generationDiagnostics ?? null
  }
}

const replayPendingTurnStream = (response: Response, pendingTurn: PendingTurn) => {
  initSseResponse(response)
  for (const token of splitIntoSseTokens(pendingTurn.assistantText)) {
    writeSseEvent(response, { type: 'token', content: token })
  }
  writeSseEvent(response, {
    type: 'done',
    ...buildPendingDoneData(pendingTurn),
    idempotency_replayed: true
  })
  response.end()
}

const toStoredGameplayClientMessageId = (clientEventId: string) => `${GAMEPLAY_CLIENT_MESSAGE_PREFIX}${clientEventId}`

const parseGameplayClientEventId = (clientMessageId: string | null | undefined) => {
  if (!clientMessageId || !clientMessageId.startsWith(GAMEPLAY_CLIENT_MESSAGE_PREFIX)) {
    return null
  }
  return clientMessageId.slice(GAMEPLAY_CLIENT_MESSAGE_PREFIX.length)
}

const parseClientMessageId = (request: Request, payload: UnityChatSendRequest) => {
  const headerValue = request.header('idempotency-key')?.trim()
  const bodyValue = payload.client_message_id

  if (bodyValue && headerValue && bodyValue !== headerValue) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_message_id and Idempotency-Key header must match when both are provided.',
      details: {
        fields: [
          {
            field: 'client_message_id',
            reason: 'must_match_idempotency_key_header'
          }
        ]
      }
    }
  }

  const resolved = bodyValue ?? headerValue
  if (!resolved) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_message_id (or Idempotency-Key header) is required.',
      details: {
        fields: [
          {
            field: 'client_message_id',
            reason: 'required'
          }
        ]
      }
    }
  }

  if (resolved.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(resolved)) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_message_id must match ^[a-zA-Z0-9._:-]+$ and be at most 128 characters.',
      details: {
        fields: [
          {
            field: 'client_message_id',
            reason: 'invalid_format'
          }
        ]
      }
    }
  }

  if (resolved.startsWith(GAMEPLAY_CLIENT_MESSAGE_PREFIX)) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_message_id cannot start with reserved prefix "event:".',
      details: {
        fields: [
          {
            field: 'client_message_id',
            reason: 'reserved_prefix'
          }
        ]
      }
    }
  }

  return {
    ok: true as const,
    clientMessageId: resolved
  }
}

const parseClientEventId = (request: Request, payload: UnityGameplaySendRequest) => {
  const headerValue = request.header('idempotency-key')?.trim()
  const bodyValue = payload.client_event_id

  if (bodyValue && headerValue && bodyValue !== headerValue) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_event_id and Idempotency-Key header must match when both are provided.',
      details: {
        fields: [
          {
            field: 'client_event_id',
            reason: 'must_match_idempotency_key_header'
          }
        ]
      }
    }
  }

  const resolved = bodyValue ?? headerValue
  if (!resolved) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_event_id (or Idempotency-Key header) is required.',
      details: {
        fields: [
          {
            field: 'client_event_id',
            reason: 'required'
          }
        ]
      }
    }
  }

  if (resolved.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(resolved)) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_event_id must match ^[a-zA-Z0-9._:-]+$ and be at most 128 characters.',
      details: {
        fields: [
          {
            field: 'client_event_id',
            reason: 'invalid_format'
          }
        ]
      }
    }
  }

  if (resolved.startsWith(GAMEPLAY_CLIENT_MESSAGE_PREFIX)) {
    return {
      ok: false as const,
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'client_event_id cannot start with reserved prefix "event:".',
      details: {
        fields: [
          {
            field: 'client_event_id',
            reason: 'reserved_prefix'
          }
        ]
      }
    }
  }

  return {
    ok: true as const,
    clientEventId: resolved
  }
}

const serializeTranscriptMessageRow = (row: {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  clientMessageId: string | null
  audioUrl: string | null
  createdAt: Date
}) => {
  const clientEventId = parseGameplayClientEventId(row.clientMessageId)
  const isGameplayTurn = Boolean(clientEventId)
  const isGameplayEventMessage = isGameplayTurn && row.role === ChatMessageRole.USER
  const role = isGameplayEventMessage ? 'GAMEPLAY' : row.role
  const messageKind = isGameplayEventMessage
    ? 'gameplay_event'
    : isGameplayTurn
    ? 'gameplay_assistant'
    : row.role === ChatMessageRole.USER
    ? 'user_text'
    : 'assistant_text'

  return {
    id: row.id,
    session_id: row.sessionId,
    role,
    message_kind: messageKind,
    content: row.content,
    client_message_id: isGameplayTurn ? null : row.clientMessageId,
    client_event_id: clientEventId,
    audio_url: row.audioUrl,
    created_at: row.createdAt.toISOString()
  }
}

const listSerializedSessions = async (input: {
  authUser: AuthUserLike
  storyId?: string
  limit: number
  cursor?: string
}) => {
  if (input.storyId) {
    const context = await resolveStorySessionContext(input.authUser, input.storyId)
    if (!context.ok) {
      return context
    }
  }

  const offset = decodeOffsetCursor(input.cursor)
  const rows = await prisma.chatSession.findMany({
    where: {
      userId: input.authUser.userId,
      ...(input.storyId ? { storyId: input.storyId } : {})
    },
    orderBy: {
      createdAt: 'desc'
    },
    skip: offset,
    take: input.limit + 1,
    select: {
      id: true,
      userId: true,
      storyId: true,
      characterId: true,
      createdAt: true,
      lastUpdatedAt: true,
      previewText: true
    }
  })

  const pageRows = rows.slice(0, input.limit)
  const hasMore = rows.length > input.limit
  const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null

  return {
    ok: true as const,
    data: pageRows.map((row) => serializeSessionItem(row)),
    page: {
      nextCursor
    }
  }
}

const handleQuotaAdvisoryCheck = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = consumeSchema.parse(request.body ?? {})
    const requestedUserId = payload.user_id ?? payload.userId

    if (requestedUserId && requestedUserId !== authUser.userId) {
      sendApiError(response, 403, 'FORBIDDEN', 'User id does not match authenticated session.')
      return
    }

    await cleanupExpiredPendingTurnsForUser(authUser.userId)

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const quotaPeriod = await resolveCurrentQuotaPeriod(authUser.userId, tierQuota)
    const { periodStart, periodEnd } = quotaPeriod
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const reservedCounts = await getReservedCountsForPeriod(authUser.userId, periodStart)
    const messageLimitReached = hasReachedMessageLimit({
      unlimitedMessages: tierQuota.unlimitedMessages,
      used: usageSnapshot.effectiveMessagesUsed,
      reserved: reservedCounts.messageReserved,
      limit: tierQuota.limit
    })

    if (messageLimitReached) {
      const quotaData = buildQuotaExceededData({
        userId: authUser.userId,
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
        unlimitedVoice: tierQuota.unlimitedVoice
      })

      initSseResponse(response)
      writeSseEvent(response, {
        type: 'done',
        ...quotaData
      })
      response.end()
      return
    }

    // Increment 12 moves voice to per-segment `/api/tts/request`; chat-send
    // keeps text streaming and pending-turn durability only.
    const voiceRequested = false
    const voiceQuotaReached = hasReachedVoiceLimit({
      voiceEnabled: tierQuota.voiceEnabled,
      unlimitedVoice: tierQuota.unlimitedVoice,
      used: usageSnapshot.effectiveVoiceUsed,
      reserved: reservedCounts.voiceReserved,
      limit: tierQuota.voiceLimit
    })
    const voiceAllowed = voiceRequested && tierQuota.voiceEnabled && !voiceQuotaReached
    const voiceStatus: VoiceStatus = !voiceRequested
      ? 'not_requested'
      : !tierQuota.voiceEnabled
      ? 'disabled'
      : voiceQuotaReached
      ? 'quota_exhausted'
      : 'not_generated'

    sendApiData(
      response,
      buildQuotaAllowedData({
        userId: authUser.userId,
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
        voiceRequested,
        voiceAllowed,
        voiceStatus,
        voiceAudioUrl: null
      })
    )
  } catch (error) {
    next(error)
  }
}

chatQuotaRoutes.post('/chat/quota/check', requireAuth, handleQuotaAdvisoryCheck)
chatQuotaRoutes.post('/chat/quota/consume', requireAuth, handleQuotaAdvisoryCheck)

chatQuotaRoutes.get('/chat/quota/status', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const query = statusSchema.parse(request.query)
    const requestedUserId = query.user_id ?? query.userId

    if (requestedUserId && requestedUserId !== authUser.userId) {
      sendApiError(response, 403, 'FORBIDDEN', 'User id does not match authenticated session.')
      return
    }

    await cleanupExpiredPendingTurnsForUser(authUser.userId)

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const quotaPeriod = await resolveCurrentQuotaPeriod(authUser.userId, tierQuota)
    const { periodStart, periodEnd } = quotaPeriod
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const reservedCounts = await getReservedCountsForPeriod(authUser.userId, periodStart)
    const messageLimitReached = hasReachedMessageLimit({
      unlimitedMessages: tierQuota.unlimitedMessages,
      used: usageSnapshot.effectiveMessagesUsed,
      reserved: reservedCounts.messageReserved,
      limit: tierQuota.limit
    })

    if (messageLimitReached) {
      sendApiData(
        response,
        buildQuotaExceededData({
          userId: authUser.userId,
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
          unlimitedVoice: tierQuota.unlimitedVoice
        })
      )
      return
    }

    const voiceRequested = query.voice_enabled === true
    const voiceQuotaReached = hasReachedVoiceLimit({
      voiceEnabled: tierQuota.voiceEnabled,
      unlimitedVoice: tierQuota.unlimitedVoice,
      used: usageSnapshot.effectiveVoiceUsed,
      reserved: reservedCounts.voiceReserved,
      limit: tierQuota.voiceLimit
    })
    const voiceAllowed = voiceRequested && tierQuota.voiceEnabled && !voiceQuotaReached
    const voiceStatus: VoiceStatus = !voiceRequested
      ? 'not_requested'
      : !tierQuota.voiceEnabled
      ? 'disabled'
      : voiceQuotaReached
      ? 'quota_exhausted'
      : 'not_generated'

    sendApiData(
      response,
      buildQuotaAllowedData({
        userId: authUser.userId,
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
        voiceRequested,
        voiceAllowed,
        voiceStatus,
        voiceAudioUrl: null
      })
    )
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/sessions', requireAuth, async (request, response, next) => {
  try {
    // Strict Phase-1: session creation must be story-based.
    sendApiError(response, 410, 'BAD_REQUEST', 'Legacy endpoint disabled. Use POST /api/sessions with story_id.')
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/chat/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const query = listChatSessionsSchema.parse(request.query)

    const sessionList = await prisma.chatSession.findMany({
      where: {
        userId: authUser.userId,
        ...(query.characterId
          ? {
              characterId: query.characterId
            }
          : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: query.limit,
      select: {
        id: true,
        userId: true,
        characterId: true,
        storyId: true,
        createdAt: true,
        lastUpdatedAt: true,
        previewText: true
      }
    })

    sendApiData(response, sessionList)
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/chat/sessions/:sessionId/messages', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { sessionId } = chatSessionParamsSchema.parse(request.params)
    const query = listChatMessagesSchema.parse(request.query)

    const chatSession = await prisma.chatSession.findUnique({
      where: {
        id: sessionId
      },
      select: {
        id: true,
        userId: true
      }
    })

    if (!chatSession || chatSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const messageList = await prisma.chatMessage.findMany({
      where: {
        sessionId: chatSession.id
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: query.limit,
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        clientMessageId: true,
        audioUrl: true,
        createdAt: true
      }
    })

    sendApiData(response, messageList.map((row) => serializeTranscriptMessageRow(row)))
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/sessions/:sessionId/messages', requireAuth, async (request, response, next) => {
  try {
    // Strict Phase-1: message writes must use reserve/finalize flow.
    sendApiError(response, 410, 'BAD_REQUEST', 'Legacy endpoint disabled. Use POST /api/chat/send.')
  } catch (error) {
    next(error)
  }
})

/**
 * Phase-1 spec routes.
 * Legacy write endpoints above are intentionally disabled in strict mode.
 */
chatQuotaRoutes.post('/sessions', requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = createSpecSessionSchema.parse(request.body)
    const createdSession = await createStoryChatSession(authUser, payload.story_id)

    if (!createdSession.ok) {
      sendApiError(
        response,
        createdSession.error.status,
        mapStorySessionContextErrorToApiCode(createdSession.error),
        createdSession.error.message
      )
      return
    }

    sendApiData(
      response,
      createdSession.data.session,
      {
        status: 201
      }
    )
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const rawQuery = request.query as Record<string, unknown>
    const query = listSpecSessionsSchema.parse(rawQuery)
    const listResult = await listSerializedSessions({
      authUser,
      storyId: query.story_id,
      limit: query.limit,
      cursor: query.cursor
    })

    if (!listResult.ok) {
      sendApiError(
        response,
        listResult.error.status,
        mapStorySessionContextErrorToApiCode(listResult.error),
        listResult.error.message
      )
      return
    }

    sendApiData(response, listResult.data, { page: listResult.page })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.delete('/sessions/:session_id', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { session_id } = listSessionMessagesParamsSchema.parse(request.params)
    const existingSession = await prisma.chatSession.findUnique({
      where: {
        id: session_id
      },
      select: {
        id: true,
        userId: true,
        previewText: true
      }
    })

    if (!existingSession || existingSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    await cleanupExpiredPendingTurnsForUser(authUser.userId)
    const hasActivePendingTurn = await hasActivePendingTurnForSession({
      userId: authUser.userId,
      sessionId: existingSession.id
    })

    if (hasActivePendingTurn) {
      sendApiError(response, 409, 'SESSION_HAS_PENDING_TURN', 'Abort or finish the active chat turn before deleting this session.')
      return
    }

    const deletedAt = new Date()
    await prisma.chatSession.delete({
      where: {
        id: existingSession.id
      }
    })

    sendApiData(response, {
      id: existingSession.id,
      deleted: true,
      deleted_at: deletedAt.toISOString()
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/sessions/:session_id/unity-state', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { session_id } = unityStateParamsSchema.parse(request.params)
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: session_id },
      select: { id: true, userId: true, previewText: true }
    })

    if (!chatSession || chatSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const state = await getUnitySessionState(session_id)

    sendApiData(response, {
      session_id,
      metadata_version: state.metadataVersion,
      metadata: state.metadata
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.put('/sessions/:session_id/unity-state', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { session_id } = unityStateParamsSchema.parse(request.params)
    const payload = unityStateUpsertSchema.parse(request.body ?? {})

    const chatSession = await prisma.chatSession.findUnique({
      where: { id: session_id },
      select: { id: true, userId: true, previewText: true }
    })

    if (!chatSession || chatSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const state = await upsertUnitySessionState(prisma, {
      sessionId: session_id,
      userId: authUser.userId,
      metadataVersion: payload.metadata_version,
      metadata: payload.metadata
    })

    sendApiData(response, {
      session_id,
      metadata_version: state.metadataVersion,
      metadata: state.metadata
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/sessions/:session_id/messages', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { session_id } = listSessionMessagesParamsSchema.parse(request.params)
    const query = listSessionMessagesQuerySchema.parse({
      cursor: request.query.cursor,
      limit: request.query.limit,
      order: request.query.order
    })

    const sessionRow = await prisma.chatSession.findUnique({
      where: {
        id: session_id
      },
      select: {
        id: true,
        userId: true,
        previewText: true
      }
    })

    if (!sessionRow || sessionRow.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const offset = decodeOffsetCursor(query.cursor)
    const rows = await prisma.chatMessage.findMany({
      where: {
        sessionId: session_id
      },
      orderBy: {
        createdAt: query.order
      },
      skip: offset,
      take: query.limit + 1,
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        clientMessageId: true,
        audioUrl: true,
        createdAt: true
      }
    })

    const pageRows = rows.slice(0, query.limit)
    const hasMore = rows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null

    sendApiData(response, pageRows.map((row) => serializeTranscriptMessageRow(row)), {
      page: {
        nextCursor
      }
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/stories/:story_id/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const params = listStorySessionsParamsSchema.parse(request.params)
    const query = listSpecSessionsSchema.parse({
      story_id: params.story_id,
      cursor: request.query.cursor,
      limit: request.query.limit
    })

    const listResult = await listSerializedSessions({
      authUser,
      storyId: query.story_id,
      limit: query.limit,
      cursor: query.cursor
    })

    if (!listResult.ok) {
      sendApiError(
        response,
        listResult.error.status,
        mapStorySessionContextErrorToApiCode(listResult.error),
        listResult.error.message
      )
      return
    }

    sendApiData(response, listResult.data, { page: listResult.page })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/pending-turns/:pending_turn_id/commit', requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const { pending_turn_id } = pendingTurnParamsSchema.parse(request.params)
    const payload = pendingTurnCommitSchema.parse(request.body ?? {})
    const commitResult = await commitPendingTurn({
      userId: authUser.userId,
      pendingTurnId: pending_turn_id,
      payload: {
        sessionId: payload.session_id,
        clientTurnId: payload.client_turn_id,
        assistantMessageSha256: payload.assistant_message_sha256,
        unityState: {
          metadataVersion: payload.unity_state.metadata_version,
          metadata: payload.unity_state.metadata
        }
      }
    })

    if (!commitResult.ok) {
      sendApiError(response, commitResult.status, commitResult.code, commitResult.message, commitResult.details)
      return
    }

    const pendingTurn = commitResult.pendingTurn
    if (!commitResult.idempotencyReplayed) {
      commitActiveTtsTurn({
        userId: authUser.userId,
        sessionId: pendingTurn.sessionId,
        clientTurnId: pendingTurn.clientTurnId
      })
    }

    const quota = await buildQuotaSnapshotForUser(authUser.userId, {
      voiceRequested: pendingTurn.voiceRequested,
      voiceStatus: pendingTurn.voiceConsumed ? 'generated' : pendingTurn.voiceRequested ? 'not_generated' : 'not_requested',
      voiceAudioUrl: pendingTurn.voiceAudioUrl,
      requestIdToExclude: pendingTurn.requestId
    })

    sendApiData(response, {
      pending_turn_id: pendingTurn.id,
      client_turn_id: pendingTurn.clientTurnId,
      session_id: pendingTurn.sessionId,
      kind: pendingTurn.kind,
      committed: true,
      idempotency_replayed: commitResult.idempotencyReplayed,
      ...(pendingTurn.kind === 'gameplay'
        ? {
            non_quota: true,
            client_event_id: pendingTurn.clientTurnId,
            event_type: pendingTurn.gameplayEventType,
            event_message: {
              id: commitResult.userMessage.id,
              role: 'GAMEPLAY',
              content: commitResult.userMessage.content,
              client_event_id: pendingTurn.clientTurnId,
              created_at: commitResult.userMessage.createdAt.toISOString()
            }
          }
        : {
            user_message: {
              id: commitResult.userMessage.id,
              role: commitResult.userMessage.role,
              content: commitResult.userMessage.content,
              created_at: commitResult.userMessage.createdAt.toISOString()
            }
          }),
      assistant_message: {
        id: commitResult.assistantMessage.id,
        role: commitResult.assistantMessage.role,
        content: commitResult.assistantMessage.content,
        created_at: commitResult.assistantMessage.createdAt.toISOString(),
        audio_url: commitResult.assistantMessage.audioUrl,
        ...(pendingTurn.kind === 'gameplay' ? { client_event_id: pendingTurn.clientTurnId } : {})
      },
      unity_state: {
        session_id: commitResult.unityState.sessionId,
        metadata_version: commitResult.unityState.metadataVersion,
        metadata: commitResult.unityState.metadata
      },
      quota,
      provider: pendingTurn.provider
    })

    void processChatCommitBackgroundWork({
      pendingTurnId: pendingTurn.id,
      sessionId: pendingTurn.sessionId,
      prismaClient: prisma,
      postCommitMessageIds: commitResult.postCommitMessageIds,
      batchSize: 5,
      leaseOwner: `commit-route-${pendingTurn.id}`
    })
  } catch (error) {
    next(error)
  }
})
chatQuotaRoutes.post('/chat/pending-turns/:pending_turn_id/abort', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    await cleanupExpiredPendingTurnsForUser(authUser.userId)

    const { pending_turn_id } = pendingTurnParamsSchema.parse(request.params)
    const payload = pendingTurnAbortSchema.parse(request.body ?? {})
    const pendingTurn = await findPendingTurnById(pending_turn_id)

    if (!pendingTurn || pendingTurn.userId !== authUser.userId || pendingTurn.sessionId !== payload.session_id) {
      sendApiError(response, 404, 'NOT_FOUND', 'Pending turn not found.')
      return
    }

    if (pendingTurn.clientTurnId !== payload.client_turn_id) {
      sendApiError(response, 403, 'FORBIDDEN', 'Pending turn client id does not match.')
      return
    }

    const chatSession = await prisma.chatSession.findUnique({
      where: { id: pendingTurn.sessionId },
      select: { id: true, userId: true, previewText: true }
    })

    if (!chatSession || chatSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    if (pendingTurn.status === 'COMMITTED') {
      sendApiError(response, 409, 'PENDING_TURN_ALREADY_COMMITTED', 'Pending turn was already committed.')
      return
    }

    if (pendingTurn.status === 'PENDING') {
      await prisma.$transaction(async (tx) => {
        await tx.chatQuotaReservation.updateMany({
          where: {
            id: pendingTurn.reservationId,
            status: ChatQuotaReservationStatus.RESERVED
          },
          data: {
            status: ChatQuotaReservationStatus.RELEASED,
            releasedAt: new Date(),
            errorReason: payload.reason
          }
        })

        await markPendingTurnAborted(tx, {
          pendingTurnId: pendingTurn.id,
          reason: payload.reason
        })
      })
    }

    abortActiveTtsTurn({
      userId: authUser.userId,
      sessionId: pendingTurn.sessionId,
      clientTurnId: pendingTurn.clientTurnId
    })

    const quota = await buildQuotaSnapshotForUser(authUser.userId, {
      requestIdToExclude: pendingTurn.requestId
    })

    sendApiData(response, {
      pending_turn_id: pendingTurn.id,
      client_turn_id: pendingTurn.clientTurnId,
      session_id: pendingTurn.sessionId,
      status: pendingTurn.status === 'PENDING' ? 'aborted' : pendingTurn.status.toLowerCase(),
      released: true,
      reason: payload.reason,
      quota
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/send', requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const providerPlayerTier = toAiProviderPlayerTier(getRequiredGameAccessContext(request).effectiveTierCode)
    const payload = unityChatSendRequestSchema.parse(request.body)
    const streamMode = isSseRequested(request, payload.stream === true)
    if (!requireStreamMode(response, streamMode)) {
      return
    }
    await cleanupExpiredPendingTurnsForUser(authUser.userId)

    const parsedClientMessageId = parseClientMessageId(request, payload)
    if (!parsedClientMessageId.ok) {
      sendApiError(
        response,
        parsedClientMessageId.status,
        parsedClientMessageId.code,
        parsedClientMessageId.message,
        parsedClientMessageId.details
      )
      return
    }
    const clientMessageId = parsedClientMessageId.clientMessageId
    const forceAiFailure = process.env.NODE_ENV !== 'production' && request.header('x-sw-force-ai-failure') === '1'

    const chatSession = await prisma.chatSession.findUnique({
      where: {
        id: payload.session_id
      },
      select: {
        id: true,
        userId: true,
        storyId: true,
        previewText: true,
        story: {
          select: {
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
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const requestId = `client:${clientMessageId}`
    const requestFingerprint = hashRequestFingerprint({
      sessionId: payload.session_id,
      message: payload.message,
      unityRuntimeContext: payload.unity_runtime_context,
      animationCapabilities: payload.animation_capabilities
    })
    // Increment 12 moves runtime voice generation to per-segment `/api/tts/request`.
    const voiceRequested = false
    const promptDebugDecision = resolvePromptDebugDecision({
      debugPromptRequested: payload.debug_prompt === true,
      userId: authUser.userId,
      sessionId: chatSession.id
    })

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const quotaPeriod = await resolveCurrentQuotaPeriod(authUser.userId, tierQuota)
    const { periodStart, periodEnd } = quotaPeriod
    let reservationId = ''

    const existingReservation = await prisma.chatQuotaReservation.findUnique({
      where: {
        userId_requestId: {
          userId: authUser.userId,
          requestId
        }
      },
      select: {
        id: true,
        status: true,
        sessionId: true,
        messageId: true,
        requestFingerprint: true,
        voiceRequested: true
      }
    })

    if (existingReservation?.requestFingerprint && existingReservation.requestFingerprint !== requestFingerprint) {
      sendApiError(
        response,
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'This client_message_id was already used for a different request.',
        {
          client_message_id: clientMessageId
        }
      )
      return
    }

    if (existingReservation?.status === ChatQuotaReservationStatus.RESERVED) {
      const pendingReplay = await findPendingTurnByRequest(authUser.userId, requestId)
      if (
        pendingReplay?.status === 'PENDING' &&
        pendingReplay.sessionId === payload.session_id &&
        pendingReplay.requestFingerprint === requestFingerprint
      ) {
        response.setHeader('Idempotency-Replayed', 'true')
        replayPendingTurnStream(response, pendingReplay)
        return
      }

      response.setHeader('Retry-After', '2')
      sendApiError(
        response,
        409,
        'IDEMPOTENCY_IN_PROGRESS',
        'A request with this client_message_id is still processing.',
        {
          client_message_id: clientMessageId
        }
      )
      return
    }

    if (existingReservation?.status === ChatQuotaReservationStatus.FINALIZED) {
      const userMessage = existingReservation.messageId
        ? await prisma.chatMessage.findUnique({
            where: {
              id: existingReservation.messageId
            },
            select: {
              id: true,
              sessionId: true,
              role: true,
              content: true,
              createdAt: true
            }
          })
        : null

      if (!userMessage || userMessage.role !== ChatMessageRole.USER) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'Idempotency replay data is unavailable.')
        return
      }

      if (userMessage.sessionId !== payload.session_id || userMessage.content !== payload.message) {
        sendApiError(
          response,
          422,
          'IDEMPOTENCY_KEY_REUSED',
          'This client_message_id was already used for a different request.',
          {
            client_message_id: clientMessageId
          }
        )
        return
      }

      const assistantMessage =
        (await prisma.chatMessage.findFirst({
          where: {
            sessionId: userMessage.sessionId,
            role: ChatMessageRole.ASSISTANT,
            clientMessageId: clientMessageId
          },
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            id: true,
            sessionId: true,
            role: true,
            content: true,
            createdAt: true,
            audioUrl: true
          }
        })) ??
        (await prisma.chatMessage.findFirst({
          where: {
            sessionId: userMessage.sessionId,
            role: ChatMessageRole.ASSISTANT,
            createdAt: {
              gte: userMessage.createdAt
            }
          },
          orderBy: {
            createdAt: 'asc'
          },
          select: {
            id: true,
            sessionId: true,
            role: true,
            content: true,
            createdAt: true,
            audioUrl: true
          }
        }))

      if (!assistantMessage) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'Idempotency replay data is incomplete.')
        return
      }

      const replayUsageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
      const replayReservedCounts = await getReservedCountsForPeriod(authUser.userId, periodStart, requestId)
      const replayVoiceRequested = existingReservation.voiceRequested || voiceRequested
      const replayVoiceQuotaReached = hasReachedVoiceLimit({
        voiceEnabled: tierQuota.voiceEnabled,
        unlimitedVoice: tierQuota.unlimitedVoice,
        used: replayUsageSnapshot.effectiveVoiceUsed,
        reserved: replayReservedCounts.voiceReserved,
        limit: tierQuota.voiceLimit
      })
      const replayVoiceAllowed = replayVoiceRequested && tierQuota.voiceEnabled && !replayVoiceQuotaReached
      const replayVoiceStatus: VoiceStatus = assistantMessage.audioUrl
        ? 'generated'
        : !replayVoiceRequested
        ? 'not_requested'
        : !tierQuota.voiceEnabled
        ? 'disabled'
        : replayVoiceQuotaReached
        ? 'quota_exhausted'
        : 'not_generated'
      const replayQuotaData = buildQuotaAllowedData({
        userId: authUser.userId,
        tierCode: tierQuota.tierCode,
        periodEnd,
        messageLimit: tierQuota.limit,
        messageUsed: replayUsageSnapshot.effectiveMessagesUsed,
        messageReserved: replayReservedCounts.messageReserved,
        unlimitedMessages: tierQuota.unlimitedMessages,
        voiceEnabled: tierQuota.voiceEnabled,
        voiceLimit: tierQuota.voiceLimit,
        voiceUsed: replayUsageSnapshot.effectiveVoiceUsed,
        voiceReserved: replayReservedCounts.voiceReserved,
        unlimitedVoice: tierQuota.unlimitedVoice,
        voiceRequested: replayVoiceRequested,
        voiceAllowed: replayVoiceAllowed,
        voiceStatus: replayVoiceStatus,
        voiceAudioUrl: assistantMessage.audioUrl
      })
      const { user_message: _quotaUserMessage, ...replayQuotaDataWithoutMessage } = replayQuotaData

      const replayResponseData = {
        ...replayQuotaDataWithoutMessage,
        idempotency_replayed: true,
        session_id: userMessage.sessionId,
        user_message: {
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          created_at: userMessage.createdAt.toISOString()
        },
        assistant_message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          created_at: assistantMessage.createdAt.toISOString(),
          audio_url: assistantMessage.audioUrl
        },
        voice_task_id: null,
        provider: 'replayed'
      }

      response.setHeader('Idempotency-Replayed', 'true')
      if (streamMode) {
        initSseResponse(response)
        for (const token of splitIntoSseTokens(assistantMessage.content)) {
          writeSseEvent(response, { type: 'token', content: token })
        }
        writeSseEvent(response, {
          type: 'done',
          ...replayResponseData
        })
        response.end()
      } else {
        sendApiData(response, replayResponseData)
      }
      return
    }

    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const reservedCounts = await getReservedCountsForPeriod(authUser.userId, periodStart, requestId)

    const messageLimitReached = hasReachedMessageLimit({
      unlimitedMessages: tierQuota.unlimitedMessages,
      used: usageSnapshot.effectiveMessagesUsed,
      reserved: reservedCounts.messageReserved,
      limit: tierQuota.limit
    })

    if (messageLimitReached) {
      const quotaData = buildQuotaExceededData({
        userId: authUser.userId,
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
        unlimitedVoice: tierQuota.unlimitedVoice
      })

      sendApiError(
        response,
        403,
        'QUOTA_EXHAUSTED',
        quotaData.user_message ?? 'Text quota is exhausted.',
        buildQuotaDeniedDetails('text', quotaData)
      )
      return
    }

    if (existingReservation?.status === ChatQuotaReservationStatus.RELEASED) {
      const reactivated = await prisma.chatQuotaReservation.updateMany({
        where: {
          id: existingReservation.id,
          status: ChatQuotaReservationStatus.RELEASED
        },
        data: {
          status: ChatQuotaReservationStatus.RESERVED,
          usageId: usageSnapshot.usageRecordId,
          periodStartAt: periodStart,
          requestFingerprint,
          voiceRequested: false,
          voiceConsumed: false,
          releasedAt: null,
          errorReason: null
        }
      })

      if (reactivated.count !== 1) {
        response.setHeader('Retry-After', '2')
        sendApiError(
          response,
          409,
          'IDEMPOTENCY_IN_PROGRESS',
          'A request with this client_message_id is still processing.',
          {
            client_message_id: clientMessageId
          }
        )
        return
      }

      reservationId = existingReservation.id
    } else {
      let createdReservation: { id: string }
      try {
        createdReservation = await prisma.chatQuotaReservation.create({
          data: {
            userId: authUser.userId,
            usageId: usageSnapshot.usageRecordId,
            periodStartAt: periodStart,
            requestId,
            requestFingerprint,
            voiceRequested: false,
            voiceConsumed: false,
            status: ChatQuotaReservationStatus.RESERVED
          },
          select: {
            id: true
          }
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          response.setHeader('Retry-After', '2')
          sendApiError(
            response,
            409,
            'IDEMPOTENCY_IN_PROGRESS',
            'A request with this client_message_id is still processing.',
            {
              client_message_id: clientMessageId
            }
          )
          return
        }
        throw error
      }

      reservationId = createdReservation.id
    }

    const releaseReservation = async (reason: string) => {
      await prisma.chatQuotaReservation.updateMany({
        where: {
          id: reservationId,
          status: ChatQuotaReservationStatus.RESERVED
        },
        data: {
          status: ChatQuotaReservationStatus.RELEASED,
          releasedAt: new Date(),
          errorReason: reason
        }
      })
    }

    startActiveTtsTurn({
      userId: authUser.userId,
      sessionId: chatSession.id,
      storyId: chatSession.storyId,
      kind: 'normal',
      clientTurnId: clientMessageId,
      requestId,
      reservationId,
      ttlMs: PENDING_TURN_TTL_MS
    })

    let streamStarted = false
    let aiReply: GenerateVisibleAssistantReplyResult
    const clientDisconnect = createClientDisconnectSignal(request, response)
    try {
      if (streamMode) {
        initSseResponse(response)
        streamStarted = true
      }

      aiReply = await generateVisibleAssistantReply({
        userMessage: payload.message,
        runtimeContext: payload.unity_runtime_context,
        animationCapabilities: payload.animation_capabilities,
        requestId,
        sessionId: chatSession.id,
        storyId: chatSession.storyId,
        userId: authUser.userId,
        providerPlayerTier,
        mode: 'normal',
        forceFailure: forceAiFailure,
        abortSignal: clientDisconnect.signal,
        onPromptDebug: promptDebugDecision.enabled
          ? (promptDebugPayload) => {
              writeSseEvent(response, {
                type: 'prompt_debug',
                prompt: promptDebugPayload.prompt,
                diagnostics: promptDebugPayload.diagnostics
              })
            }
          : undefined,
        onToken: streamMode
          ? (token) => {
              // Forward provider tokens immediately. The final transcript/quota
              // commit still happens only after the provider sends stop/end.
              writeSseEvent(response, { type: 'token', content: token })
            }
          : undefined
      })
    } catch (error) {
      const reason = getChatAiProviderErrorReason(error)
      const errorDetails = getChatAiProviderErrorDetails(error)
      await releaseReservation(reason)
      abortActiveTtsTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        clientTurnId: clientMessageId
      })
      if (reason === 'client_disconnected' && (response.destroyed || response.writableEnded)) {
        return
      }
      if (streamMode) {
        if (!streamStarted) {
          initSseResponse(response)
          streamStarted = true
        }
        endSseWithError(response, {
          code: 'AI_PROVIDER_FAILURE',
          message: 'AI response generation failed. Quota reservation released.',
          details: {
            ...errorDetails,
            allowed: false,
            released: true
          }
        })
      } else {
        sendApiError(
          response,
          500,
          'AI_PROVIDER_FAILURE',
          'AI response generation failed. Quota reservation released.',
          {
            ...errorDetails,
            allowed: false,
            released: true
          }
        )
      }
      return
    } finally {
      clientDisconnect.dispose()
    }

    const activeVoiceState = getActiveTtsTurnVoiceState({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: clientMessageId
    })
    let pendingTurn: PendingTurn
    try {
      // The streamed provider result is not a durable transcript row yet. Unity
      // must finish metadata interpretation and call pending-turn commit before
      // quota is consumed or chat history/session preview changes.
      pendingTurn = await createPendingTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        storyId: chatSession.storyId,
        kind: 'normal',
        clientTurnId: clientMessageId,
        requestId,
        requestFingerprint,
        messageText: payload.message,
        assistantText: aiReply.content,
        provider: aiReply.provider,
        reservationId,
        voiceRequested: activeVoiceState.voiceAccepted,
        voiceConsumed: activeVoiceState.voiceAccepted,
        voiceAudioUrl: null,
        voiceTaskId: activeVoiceState.firstVoiceTaskId
      })
    } catch (error) {
      await releaseReservation('pending_create_failed')
      abortActiveTtsTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        clientTurnId: clientMessageId
      })
      if (!streamStarted) {
        initSseResponse(response)
        streamStarted = true
      }
      endSseWithError(response, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create pending chat turn.'
      })
      return
    }

    linkActiveTtsTurnPending({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: clientMessageId,
      pendingTurnId: pendingTurn.id
    })

    writeSseEvent(response, {
      type: 'done',
      ...buildPendingDoneData(pendingTurn, promptDebugDecision.enabled ? aiReply.diagnostics : null)
    })
    response.end()
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/gameplay-send', requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const providerPlayerTier = toAiProviderPlayerTier(getRequiredGameAccessContext(request).effectiveTierCode)
    const payload = unityGameplaySendRequestSchema.parse(request.body ?? {})
    const streamMode = isSseRequested(request, payload.stream === true)
    if (!requireStreamMode(response, streamMode)) {
      return
    }
    await cleanupExpiredPendingTurnsForUser(authUser.userId)

    const parsedClientEventId = parseClientEventId(request, payload)
    if (!parsedClientEventId.ok) {
      sendApiError(
        response,
        parsedClientEventId.status,
        parsedClientEventId.code,
        parsedClientEventId.message,
        parsedClientEventId.details
      )
      return
    }

    const chatSession = await prisma.chatSession.findUnique({
      where: { id: payload.session_id },
      select: {
        id: true,
        userId: true,
        storyId: true,
        previewText: true,
        story: {
          select: {
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
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const clientEventId = parsedClientEventId.clientEventId
    const storedClientMessageId = toStoredGameplayClientMessageId(clientEventId)
    const requestId = `gameplay:${clientEventId}`
    const requestFingerprint = hashGameplayRequestFingerprint({
      sessionId: payload.session_id,
      eventType: payload.event_type,
      eventDisplayText: payload.event_display_text,
      eventPayload: payload.event_payload,
      unityRuntimeContext: payload.unity_runtime_context,
      animationCapabilities: payload.animation_capabilities
    })
    const promptDebugDecision = resolvePromptDebugDecision({
      debugPromptRequested: payload.debug_prompt === true,
      userId: authUser.userId,
      sessionId: chatSession.id
    })

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const quotaPeriod = await resolveCurrentQuotaPeriod(authUser.userId, tierQuota)
    const { periodStart, periodEnd } = quotaPeriod
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)

    const existingReservation = await prisma.chatQuotaReservation.findUnique({
      where: {
        userId_requestId: {
          userId: authUser.userId,
          requestId
        }
      },
      select: {
        id: true,
        status: true,
        requestFingerprint: true
      }
    })

    if (existingReservation?.requestFingerprint && existingReservation.requestFingerprint !== requestFingerprint) {
      sendApiError(
        response,
        422,
        'IDEMPOTENCY_KEY_REUSED',
        'This client_event_id was already used for a different request.',
        {
          client_event_id: clientEventId
        }
      )
      return
    }

    if (existingReservation?.status === ChatQuotaReservationStatus.RESERVED) {
      const pendingReplay = await findPendingTurnByRequest(authUser.userId, requestId)
      if (
        pendingReplay?.status === 'PENDING' &&
        pendingReplay.sessionId === payload.session_id &&
        pendingReplay.requestFingerprint === requestFingerprint
      ) {
        response.setHeader('Idempotency-Replayed', 'true')
        replayPendingTurnStream(response, pendingReplay)
        return
      }

      response.setHeader('Retry-After', '2')
      sendApiError(response, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A gameplay event with this id is still processing.', {
        client_event_id: clientEventId
      })
      return
    }

    if (existingReservation?.status === ChatQuotaReservationStatus.FINALIZED) {
      const messageRows = await prisma.chatMessage.findMany({
        where: {
          sessionId: chatSession.id,
          clientMessageId: storedClientMessageId
        },
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          id: true,
          sessionId: true,
          role: true,
          content: true,
          clientMessageId: true,
          audioUrl: true,
          createdAt: true
        }
      })

      const eventMessage = messageRows.find((row) => row.role === ChatMessageRole.USER) ?? null
      const assistantMessage = messageRows.find((row) => row.role === ChatMessageRole.ASSISTANT) ?? null

      if (!eventMessage || !assistantMessage) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'Gameplay idempotency replay data is incomplete.')
        return
      }

      const replayData = {
        session_id: chatSession.id,
        non_quota: true,
        idempotency_replayed: true,
        client_event_id: clientEventId,
        event_type: payload.event_type,
        event_message: {
          id: eventMessage.id,
          role: 'GAMEPLAY',
          content: eventMessage.content,
          client_event_id: clientEventId,
          created_at: eventMessage.createdAt.toISOString()
        },
        assistant_message: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          client_event_id: clientEventId,
          created_at: assistantMessage.createdAt.toISOString(),
          audio_url: assistantMessage.audioUrl
        },
        voice_task_id: null,
        provider: 'replayed'
      }

      response.setHeader('Idempotency-Replayed', 'true')
      if (streamMode) {
        initSseResponse(response)
        for (const token of splitIntoSseTokens(assistantMessage.content)) {
          writeSseEvent(response, { type: 'token', content: token })
        }
        writeSseEvent(response, {
          type: 'done',
          ...replayData
        })
        response.end()
      } else {
        sendApiData(response, replayData)
      }
      return
    }

    const reservedCounts = await getReservedCountsForPeriod(authUser.userId, periodStart, requestId)
    const messageLimitReached = hasReachedMessageLimit({
      unlimitedMessages: tierQuota.unlimitedMessages,
      used: usageSnapshot.effectiveMessagesUsed,
      reserved: reservedCounts.messageReserved,
      limit: tierQuota.limit
    })

    if (messageLimitReached) {
      const quotaData = buildQuotaExceededData({
        userId: authUser.userId,
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
        unlimitedVoice: tierQuota.unlimitedVoice
      })

      sendApiError(
        response,
        403,
        'QUOTA_EXHAUSTED',
        quotaData.user_message ?? 'Text quota is exhausted.',
        buildQuotaDeniedDetails('text', quotaData)
      )
      return
    }

    let reservationId = ''
    if (existingReservation?.status === ChatQuotaReservationStatus.RELEASED) {
      const reactivated = await prisma.chatQuotaReservation.updateMany({
        where: {
          id: existingReservation.id,
          status: ChatQuotaReservationStatus.RELEASED
        },
        data: {
          status: ChatQuotaReservationStatus.RESERVED,
          usageId: usageSnapshot.usageRecordId,
          periodStartAt: periodStart,
          requestFingerprint,
          voiceRequested: false,
          voiceConsumed: false,
          releasedAt: null,
          errorReason: null
        }
      })

      if (reactivated.count !== 1) {
        response.setHeader('Retry-After', '2')
        sendApiError(response, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A gameplay event with this id is still processing.', {
          client_event_id: clientEventId
        })
        return
      }

      reservationId = existingReservation.id
    } else {
      try {
        const createdReservation = await prisma.chatQuotaReservation.create({
          data: {
            userId: authUser.userId,
            usageId: usageSnapshot.usageRecordId,
            periodStartAt: periodStart,
            requestId,
            requestFingerprint,
            voiceRequested: false,
            voiceConsumed: false,
            status: ChatQuotaReservationStatus.RESERVED
          },
          select: {
            id: true
          }
        })

        reservationId = createdReservation.id
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          response.setHeader('Retry-After', '2')
          sendApiError(response, 409, 'IDEMPOTENCY_IN_PROGRESS', 'A gameplay event with this id is still processing.', {
            client_event_id: clientEventId
          })
          return
        }
        throw error
      }
    }

    const releaseReservation = async (reason: string) => {
      await prisma.chatQuotaReservation.updateMany({
        where: {
          id: reservationId,
          status: ChatQuotaReservationStatus.RESERVED
        },
        data: {
          status: ChatQuotaReservationStatus.RELEASED,
          releasedAt: new Date(),
          errorReason: reason
        }
      })
    }

    startActiveTtsTurn({
      userId: authUser.userId,
      sessionId: chatSession.id,
      storyId: chatSession.storyId,
      kind: 'gameplay',
      clientTurnId: clientEventId,
      requestId,
      reservationId,
      ttlMs: PENDING_TURN_TTL_MS
    })

    let streamStarted = false
    let aiReply: GenerateVisibleAssistantReplyResult
    const clientDisconnect = createClientDisconnectSignal(request, response)
    try {
      if (streamMode) {
        initSseResponse(response)
        streamStarted = true
      }

      aiReply = await generateVisibleAssistantReply({
        userMessage: payload.event_display_text,
        runtimeContext: payload.unity_runtime_context,
        animationCapabilities: payload.animation_capabilities,
        gameplayEventType: payload.event_type,
        gameplayEventPayload: payload.event_payload,
        requestId,
        sessionId: chatSession.id,
        storyId: chatSession.storyId,
        userId: authUser.userId,
        providerPlayerTier,
        mode: 'gameplay',
        abortSignal: clientDisconnect.signal,
        onPromptDebug: promptDebugDecision.enabled
          ? (promptDebugPayload) => {
              writeSseEvent(response, {
                type: 'prompt_debug',
                prompt: promptDebugPayload.prompt,
                diagnostics: promptDebugPayload.diagnostics
              })
            }
          : undefined,
        onToken: streamMode
          ? (token) => {
              // Gameplay-send is non-quota, but the same Unity SSE contract is
              // used: token events first, persisted done payload last.
              writeSseEvent(response, { type: 'token', content: token })
            }
          : undefined
      })
    } catch (error) {
      const reason = getChatAiProviderErrorReason(error)
      const errorDetails = getChatAiProviderErrorDetails(error)
      await releaseReservation(reason)
      abortActiveTtsTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        clientTurnId: clientEventId
      })
      if (reason === 'client_disconnected' && (response.destroyed || response.writableEnded)) {
        return
      }
      if (streamMode) {
        if (!streamStarted) {
          initSseResponse(response)
          streamStarted = true
        }
        endSseWithError(response, {
          code: 'AI_PROVIDER_FAILURE',
          message: 'AI response generation failed for gameplay turn.',
          details: {
            ...errorDetails,
            released: true
          }
        })
      } else {
        sendApiError(response, 500, 'AI_PROVIDER_FAILURE', 'AI response generation failed for gameplay turn.', {
          ...errorDetails,
          released: true
        })
      }
      return
    } finally {
      clientDisconnect.dispose()
    }

    const activeVoiceState = getActiveTtsTurnVoiceState({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: clientEventId
    })
    let pendingTurn: PendingTurn
    try {
      // Gameplay turns are non-quota, but they still wait for Unity's metadata
      // analysis before transcript/session state becomes durable.
      pendingTurn = await createPendingTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        storyId: chatSession.storyId,
        kind: 'gameplay',
        clientTurnId: clientEventId,
        requestId,
        requestFingerprint,
        gameplayEventType: payload.event_type,
        gameplayEventPayload: payload.event_payload,
        gameplayDisplayText: payload.event_display_text,
        assistantText: aiReply.content,
        provider: aiReply.provider,
        reservationId,
        voiceRequested: activeVoiceState.voiceAccepted,
        voiceConsumed: false,
        voiceAudioUrl: null,
        voiceTaskId: activeVoiceState.firstVoiceTaskId
      })
    } catch (error) {
      await releaseReservation('pending_create_failed')
      abortActiveTtsTurn({
        userId: authUser.userId,
        sessionId: chatSession.id,
        clientTurnId: clientEventId
      })
      if (!streamStarted) {
        initSseResponse(response)
        streamStarted = true
      }
      endSseWithError(response, {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create pending gameplay turn.'
      })
      return
    }

    linkActiveTtsTurnPending({
      userId: authUser.userId,
      sessionId: chatSession.id,
      clientTurnId: clientEventId,
      pendingTurnId: pendingTurn.id
    })

    writeSseEvent(response, {
      type: 'done',
      ...buildPendingDoneData(pendingTurn, promptDebugDecision.enabled ? aiReply.diagnostics : null)
    })
    response.end()
  } catch (error) {
    next(error)
  }
})

export default chatQuotaRoutes
