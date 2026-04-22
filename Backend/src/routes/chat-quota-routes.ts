import { createHash } from 'node:crypto'
import {
  Prisma,
  ChatMessageRole,
  ChatQuotaReservationStatus,
  type UserRole,
  type StoryModerationStatus,
  type StoryPublicationStatus
} from '@prisma/client'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth-middleware'
import { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError } from '../lib/api-contract'
import { prisma } from '../lib/prisma'
import { resolveTierQuotaForUser } from '../lib/tier-quota'
import { resolveCharacterAccess } from '../services/character-access-service'
import { ChatAiProviderError, generateAssistantReply } from '../services/chat-ai-service'

const chatQuotaRoutes = Router()

const consumeSchema = z.object({
  userId: z.string().min(1).optional(),
  user_id: z.string().min(1).optional()
}).strict()

const statusSchema = z.object({
  userId: z.string().min(1).optional()
}).strict()

const listChatSessionsSchema = z.object({
  characterCardId: z.string().min(1).optional(),
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

const specSendSchema = z.object({
  session_id: z.string().trim().min(1),
  message: z.string().trim().min(1).max(8000),
  client_message_id: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional()
}).strict()

const listSessionMessagesParamsSchema = z.object({
  session_id: z.string().trim().min(1)
}).strict()

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
}

type StorySessionContext = {
  story: {
    id: string
    authorId: string
    characterId: string
    publicationStatus: StoryPublicationStatus
    moderationStatus: StoryModerationStatus
  }
  characterCard: {
    id: string
    character: {
      id: string
      ownerId: string
      status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
      visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
      isPatreonGated: boolean
      minimumTierCents: number | null
    }
  }
}

const serializeSpecSession = (sessionRow: {
  id: string
  userId: string
  storyId: string
  characterCardId: string
  createdAt: Date
  lastUpdatedAt: Date
  previewText: string | null
}) => ({
  id: sessionRow.id,
  user_id: sessionRow.userId,
  story_id: sessionRow.storyId,
  character_card_id: sessionRow.characterCardId,
  created_at: sessionRow.createdAt.toISOString(),
  last_updated: sessionRow.lastUpdatedAt.toISOString(),
  preview_text: sessionRow.previewText
})

const getCurrentPeriodBounds = (periodDays: number) => {
  const now = new Date()
  const periodMs = periodDays * 24 * 60 * 60 * 1000
  const epochMs = now.getTime()
  const periodStart = new Date(epochMs - (epochMs % periodMs))
  const periodEnd = new Date(periodStart.getTime() + periodMs)
  return { periodStart, periodEnd }
}

const getOrCreateUsageRecord = async (userId: string, periodStart: Date, periodEnd: Date) => {
  const existing = await prisma.chatMessageUsage.findUnique({
    where: { userId_periodStartAt: { userId, periodStartAt: periodStart } }
  })

  if (existing) {
    return existing
  }

  return prisma.chatMessageUsage.create({
    data: {
      userId,
      periodStartAt: periodStart,
      periodEndAt: periodEnd,
      messagesUsed: 0
    }
  })
}

const getUserMessageCountForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  return prisma.chatMessage.count({
    where: {
      role: 'USER',
      createdAt: {
        gte: periodStart,
        lt: periodEnd
      },
      session: {
        userId
      }
    }
  })
}

const getEffectiveUsageForPeriod = async (userId: string, periodStart: Date, periodEnd: Date) => {
  const [usageRecord, userMessageCount] = await Promise.all([
    getOrCreateUsageRecord(userId, periodStart, periodEnd),
    getUserMessageCountForPeriod(userId, periodStart, periodEnd)
  ])

  const effectiveUsed = Math.max(usageRecord.messagesUsed, userMessageCount)

  if (effectiveUsed !== usageRecord.messagesUsed) {
    const normalized = await prisma.chatMessageUsage.update({
      where: {
        id: usageRecord.id
      },
      data: {
        messagesUsed: effectiveUsed
      }
    })

    return {
      usageRecordId: normalized.id,
      effectiveUsed: normalized.messagesUsed
    }
  }

  return {
    usageRecordId: usageRecord.id,
    effectiveUsed
  }
}

const getReservedCountForPeriod = async (userId: string, periodStart: Date, requestIdToExclude?: string) => {
  return prisma.chatQuotaReservation.count({
    where: {
      userId,
      periodStartAt: periodStart,
      status: ChatQuotaReservationStatus.RESERVED,
      ...(requestIdToExclude
        ? {
            requestId: {
              not: requestIdToExclude
            }
          }
        : {})
    }
  })
}

const buildQuotaExceededData = (input: {
  userId: string
  tierCode: string
  limit: number
  periodEnd: Date
}) => {
  const { userId, tierCode, limit, periodEnd } = input
  return {
    allowed: false,
    user_id: userId,
    remaining: 0,
    tier_code: tierCode,
    limit,
    period_ends_at: periodEnd.toISOString(),
    user_message:
      tierCode === 'free'
        ? 'You have used all your free messages this period. Please upgrade your plan to continue chatting.'
        : 'You have reached your message limit for this billing period. Your quota resets soon.'
  }
}

const buildQuotaAllowedData = (input: {
  userId: string
  remaining: number
  tierCode: string
  limit: number
  periodEnd: Date
}) => ({
  allowed: true as const,
  user_id: input.userId,
  remaining: input.remaining,
  tier_code: input.tierCode,
  limit: input.limit,
  period_ends_at: input.periodEnd.toISOString(),
  user_message: null as string | null
})

const hashRequestFingerprint = (input: { sessionId: string; message: string }) =>
  createHash('sha256').update(`${input.sessionId}\n${input.message}`, 'utf8').digest('hex')

const parseClientMessageId = (request: Request, payload: z.infer<typeof specSendSchema>) => {
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

  return {
    ok: true as const,
    clientMessageId: resolved
  }
}

const canReadStoryForChat = (story: {
  authorId: string
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
}, authUser: AuthUserLike) => {
  if (authUser.role === 'ADMIN') {
    return true
  }

  if (story.authorId === authUser.userId) {
    return true
  }

  return story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'
}

const resolveStorySessionContext = async (
  authUser: AuthUserLike,
  storyId: string
): Promise<{ ok: true; data: StorySessionContext } | { ok: false; status: number; message: string }> => {
  const story = await prisma.storyPost.findUnique({
    where: {
      id: storyId
    },
    select: {
      id: true,
      authorId: true,
      characterId: true,
      publicationStatus: true,
      moderationStatus: true
    }
  })

  if (!story) {
    return {
      ok: false,
      status: 404,
      message: 'Story not found.'
    }
  }

  if (!canReadStoryForChat(story, authUser)) {
    return {
      ok: false,
      status: 404,
      message: 'Story not found.'
    }
  }

  if (!story.characterId) {
    return {
      ok: false,
      status: 400,
      message: 'This story is not linked to a character.'
    }
  }

  const characterCard = await prisma.characterCard.findUnique({
    where: {
      characterId: story.characterId
    },
    select: {
      id: true,
      character: {
        select: {
          id: true,
          ownerId: true,
          status: true,
          visibility: true,
          isPatreonGated: true,
          minimumTierCents: true
        }
      }
    }
  })

  if (!characterCard) {
    return {
      ok: false,
      status: 400,
      message: 'Story cannot be used for chat because its character card is missing.'
    }
  }

  const access = await resolveCharacterAccess(
    {
      userId: authUser.userId,
      role: authUser.role
    },
    characterCard.character
  )

  if (!access.canReadCharacter) {
    return {
      ok: false,
      status: 404,
      message: 'Character not found.'
    }
  }

  if (!access.canAccessPatreonGatedContent) {
    return {
      ok: false,
      status: 403,
      message: 'Your membership tier does not allow this character.'
    }
  }

  return {
    ok: true,
    data: {
      story: {
        id: story.id,
        authorId: story.authorId,
        characterId: story.characterId,
        publicationStatus: story.publicationStatus,
        moderationStatus: story.moderationStatus
      },
      characterCard
    }
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
      characterCardId: true,
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
    data: pageRows.map((row) => serializeSpecSession(row)),
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

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    // Phase-1: quick quota check endpoint.
    const reservedCount = await getReservedCountForPeriod(authUser.userId, periodStart)

    if (usageSnapshot.effectiveUsed + reservedCount >= tierQuota.limit) {
      const quotaData = buildQuotaExceededData({
        userId: authUser.userId,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        periodEnd
      })

      sendApiData(response, quotaData)
      return
    }

    const remaining = Math.max(0, tierQuota.limit - usageSnapshot.effectiveUsed - reservedCount)

    sendApiData(
      response,
      buildQuotaAllowedData({
        userId: authUser.userId,
        remaining,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        periodEnd
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

    if (query.userId && query.userId !== authUser.userId) {
      sendApiError(response, 403, 'FORBIDDEN', 'User id does not match authenticated session.')
      return
    }

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const remaining = Math.max(0, tierQuota.limit - usageSnapshot.effectiveUsed)

    sendApiData(response, {
      userId: authUser.userId,
      tierCode: tierQuota.tierCode,
      limit: tierQuota.limit,
      used: usageSnapshot.effectiveUsed,
      remaining,
      periodStartsAt: periodStart.toISOString(),
      periodEndsAt: periodEnd.toISOString()
    })
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
        ...(query.characterCardId
          ? {
              characterCardId: query.characterCardId
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
        characterCardId: true,
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
        createdAt: true
      }
    })

    sendApiData(response, messageList)
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
chatQuotaRoutes.post('/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = createSpecSessionSchema.parse(request.body)
    const context = await resolveStorySessionContext(authUser, payload.story_id)

    if (!context.ok) {
      sendApiError(
        response,
        context.status,
        context.status === 404 ? 'NOT_FOUND' : context.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        context.message
      )
      return
    }

    const created = await prisma.chatSession.create({
      data: {
        userId: authUser.userId,
        characterCardId: context.data.characterCard.id,
        storyId: context.data.story.id,
        lastUpdatedAt: new Date(),
        previewText: null
      },
      select: {
        id: true,
        userId: true,
        storyId: true,
        characterCardId: true,
        createdAt: true,
        lastUpdatedAt: true,
        previewText: true
      }
    })

    sendApiData(
      response,
      {
        id: created.id,
        user_id: created.userId,
        story_id: created.storyId,
        character_card_id: created.characterCardId,
        created_at: created.createdAt.toISOString(),
        last_updated: created.lastUpdatedAt.toISOString(),
        preview_text: created.previewText
      },
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
        listResult.status,
        listResult.status === 404 ? 'NOT_FOUND' : listResult.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        listResult.message
      )
      return
    }

    sendApiData(response, listResult.data, { page: listResult.page })
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
        userId: true
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
        createdAt: true
      }
    })

    const pageRows = rows.slice(0, query.limit)
    const hasMore = rows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null

    sendApiData(
      response,
      pageRows.map((row) => ({
        id: row.id,
        session_id: row.sessionId,
        role: row.role,
        content: row.content,
        client_message_id: row.clientMessageId,
        created_at: row.createdAt.toISOString()
      })),
      {
        page: {
          nextCursor
        }
      }
    )
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
        listResult.status,
        listResult.status === 404 ? 'NOT_FOUND' : listResult.status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
        listResult.message
      )
      return
    }

    sendApiData(response, listResult.data, { page: listResult.page })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/send', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = specSendSchema.parse(request.body)
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
        storyId: true
      }
    })

    if (!chatSession || chatSession.userId !== authUser.userId) {
      sendApiError(response, 404, 'NOT_FOUND', 'Chat session not found.')
      return
    }

    const requestId = `client:${clientMessageId}`
    const requestFingerprint = hashRequestFingerprint({
      sessionId: payload.session_id,
      message: payload.message
    })

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
    let reservationId = ''
    let reservationUsageId = ''
    let reservationPeriodStart = periodStart
    let reservationPeriodEnd = new Date(reservationPeriodStart.getTime() + tierQuota.periodDays * 24 * 60 * 60 * 1000)

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
        requestFingerprint: true
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
            createdAt: true
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
            createdAt: true
          }
        }))

      if (!assistantMessage) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'Idempotency replay data is incomplete.')
        return
      }

      const replayUsageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
      const replayReservedCount = await getReservedCountForPeriod(authUser.userId, periodStart, requestId)
      const replayRemaining = Math.max(0, tierQuota.limit - replayUsageSnapshot.effectiveUsed - replayReservedCount)

      response.setHeader('Idempotency-Replayed', 'true')
      sendApiData(response, {
        allowed: true,
        idempotency_replayed: true,
        session_id: userMessage.sessionId,
        remaining: replayRemaining,
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
          created_at: assistantMessage.createdAt.toISOString()
        },
        provider: 'replayed'
      })
      return
    }

    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const reservedCount = await getReservedCountForPeriod(authUser.userId, periodStart, requestId)

    if (usageSnapshot.effectiveUsed + reservedCount >= tierQuota.limit) {
      const quotaData = buildQuotaExceededData({
        userId: authUser.userId,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        periodEnd
      })

      sendApiData(response, quotaData)
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
      reservationUsageId = usageSnapshot.usageRecordId
      reservationPeriodStart = periodStart
      reservationPeriodEnd = periodEnd
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
      reservationUsageId = usageSnapshot.usageRecordId
      reservationPeriodStart = periodStart
      reservationPeriodEnd = periodEnd
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

    let aiReply
    try {
      aiReply = await generateAssistantReply({
        userMessage: payload.message,
        requestId,
        sessionId: chatSession.id,
        storyId: chatSession.storyId,
        userId: authUser.userId,
        forceFailure: forceAiFailure
      })
    } catch (error) {
      const reason = error instanceof ChatAiProviderError ? error.message : 'ai_provider_failure'
      await releaseReservation(reason)
      sendApiError(
        response,
        500,
        'AI_PROVIDER_FAILURE',
        'AI response generation failed. Quota reservation released.',
        {
          allowed: false,
          released: true,
          error_reason: reason
        }
      )
      return
    }

    let transactionResult: {
      usedMessages: number
      userMessage: {
        id: string
        sessionId: string
        role: ChatMessageRole
        content: string
        createdAt: Date
      }
      assistantMessage: {
        id: string
        sessionId: string
        role: ChatMessageRole
        content: string
        createdAt: Date
      }
    }

    try {
      transactionResult = await prisma.$transaction(async (tx) => {
        const usageRecord = await tx.chatMessageUsage.findUnique({
          where: {
            id: reservationUsageId
          },
          select: {
            id: true,
            messagesUsed: true
          }
        })

        if (!usageRecord) {
          throw new Error('Quota usage record was not found during finalize.')
        }

        const userMessageCount = await tx.chatMessage.count({
          where: {
            role: 'USER',
            createdAt: {
              gte: reservationPeriodStart,
              lt: reservationPeriodEnd
            },
            session: {
              userId: authUser.userId
            }
          }
        })

        const effectiveUsed = Math.max(usageRecord.messagesUsed, userMessageCount)

        const userMessage = await tx.chatMessage.create({
          data: {
            sessionId: chatSession.id,
            role: ChatMessageRole.USER,
            content: payload.message,
            clientMessageId: clientMessageId
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
            sessionId: chatSession.id,
            role: ChatMessageRole.ASSISTANT,
            content: aiReply.content,
            clientMessageId: clientMessageId
          },
          select: {
            id: true,
            sessionId: true,
            role: true,
            content: true,
            createdAt: true
          }
        })

        const usage = await tx.chatMessageUsage.update({
          where: {
            id: usageRecord.id
          },
          data: {
            messagesUsed: effectiveUsed + 1
          },
          select: {
            messagesUsed: true
          }
        })

        await tx.chatSession.update({
          where: {
            id: chatSession.id
          },
          data: {
            previewText: payload.message.slice(0, 220),
            lastUpdatedAt: new Date()
          }
        })

        await tx.chatQuotaReservation.update({
          where: {
            id: reservationId
          },
          data: {
            status: ChatQuotaReservationStatus.FINALIZED,
            sessionId: chatSession.id,
            messageId: userMessage.id,
            requestFingerprint,
            finalizedAt: new Date(),
            errorReason: null
          }
        })

        return {
          usedMessages: usage.messagesUsed,
          userMessage,
          assistantMessage
        }
      })
    } catch (error) {
      await releaseReservation('finalize_failed')
      throw error
    }

    const remaining = Math.max(0, tierQuota.limit - transactionResult.usedMessages)

    sendApiData(response, {
      allowed: true,
      session_id: transactionResult.userMessage.sessionId,
      remaining,
      user_message: {
        id: transactionResult.userMessage.id,
        role: transactionResult.userMessage.role,
        content: transactionResult.userMessage.content,
        created_at: transactionResult.userMessage.createdAt.toISOString()
      },
      assistant_message: {
        id: transactionResult.assistantMessage.id,
        role: transactionResult.assistantMessage.role,
        content: transactionResult.assistantMessage.content,
        created_at: transactionResult.assistantMessage.createdAt.toISOString()
      },
      provider: aiReply.provider
    })
  } catch (error) {
    next(error)
  }
})

export default chatQuotaRoutes
