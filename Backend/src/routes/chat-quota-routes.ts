import { ChatMessageRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { resolveTierQuotaForUser } from '../lib/tier-quota'
import { resolveCharacterAccess } from '../services/character-access-service'

const chatQuotaRoutes = Router()

const consumeSchema = z.object({
  userId: z.string().min(1)
}).strict()

const statusSchema = z.object({
  userId: z.string().min(1).optional()
}).strict()

const createChatSessionSchema = z.object({
  characterCardId: z.string().min(1)
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

const createChatMessageSchema = z.object({
  role: z.nativeEnum(ChatMessageRole),
  content: z.string().trim().min(1).max(8000)
}).strict()

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

chatQuotaRoutes.post('/chat/quota/consume', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const payload = consumeSchema.parse(request.body)

    if (payload.userId !== authUser.userId) {
      response.status(403).json({ message: 'User id does not match authenticated session.' })
      return
    }

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)

    if (usageSnapshot.effectiveUsed >= tierQuota.limit) {
      response.json({
        data: {
          allowed: false,
          userId: authUser.userId,
          remaining: 0,
          tierCode: tierQuota.tierCode,
          limit: tierQuota.limit,
          periodEndsAt: periodEnd.toISOString(),
          userMessage: tierQuota.tierCode === 'free'
            ? 'You have used all your free messages this period. Please upgrade your plan to continue chatting.'
            : 'You have reached your message limit for this billing period. Your quota resets soon.'
        }
      })
      return
    }

    const updated = await prisma.chatMessageUsage.update({
      where: { id: usageSnapshot.usageRecordId },
      data: { messagesUsed: usageSnapshot.effectiveUsed + 1 }
    })

    const remaining = Math.max(0, tierQuota.limit - updated.messagesUsed)

    response.json({
      data: {
        allowed: true,
        userId: authUser.userId,
        remaining,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        periodEndsAt: periodEnd.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/chat/quota/status', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const query = statusSchema.parse(request.query)

    if (query.userId && query.userId !== authUser.userId) {
      response.status(403).json({ message: 'User id does not match authenticated session.' })
      return
    }

    const tierQuota = await resolveTierQuotaForUser(authUser.userId)
    const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
    const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)
    const remaining = Math.max(0, tierQuota.limit - usageSnapshot.effectiveUsed)

    response.json({
      data: {
        userId: authUser.userId,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        used: usageSnapshot.effectiveUsed,
        remaining,
        periodStartsAt: periodStart.toISOString(),
        periodEndsAt: periodEnd.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const payload = createChatSessionSchema.parse(request.body)

    const characterCard = await prisma.characterCard.findUnique({
      where: {
        id: payload.characterCardId
      },
      select: {
        id: true,
        characterId: true,
        isPublic: true,
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
      response.status(404).json({ message: 'Character card not found.' })
      return
    }

    const actor = {
      userId: authUser.userId,
      role: authUser.role
    } as const

    const access = await resolveCharacterAccess(actor, characterCard.character)

    if (!access.canReadCharacter) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    if (!access.canAccessPatreonGatedContent) {
      response.status(403).json({ message: 'Your membership tier does not allow this character.' })
      return
    }

    const created = await prisma.chatSession.create({
      data: {
        userId: authUser.userId,
        characterCardId: characterCard.id
      },
      select: {
        id: true,
        userId: true,
        characterCardId: true,
        createdAt: true
      }
    })

    response.status(201).json({
      data: created
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/chat/sessions', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
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
        createdAt: true
      }
    })

    response.json({
      data: sessionList
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.get('/chat/sessions/:sessionId/messages', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
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
      response.status(404).json({ message: 'Chat session not found.' })
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

    response.json({
      data: messageList
    })
  } catch (error) {
    next(error)
  }
})

chatQuotaRoutes.post('/chat/sessions/:sessionId/messages', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const { sessionId } = chatSessionParamsSchema.parse(request.params)
    const payload = createChatMessageSchema.parse(request.body)

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
      response.status(404).json({ message: 'Chat session not found.' })
      return
    }

    if (payload.role === 'USER') {
      const tierQuota = await resolveTierQuotaForUser(authUser.userId)
      const { periodStart, periodEnd } = getCurrentPeriodBounds(tierQuota.periodDays)
      const usageSnapshot = await getEffectiveUsageForPeriod(authUser.userId, periodStart, periodEnd)

      if (usageSnapshot.effectiveUsed >= tierQuota.limit) {
        response.status(403).json({
          message:
            tierQuota.tierCode === 'free'
              ? 'You have used all your free messages this period. Please upgrade your plan to continue chatting.'
              : 'You have reached your message limit for this billing period. Your quota resets soon.'
        })
        return
      }
    }

    const created = await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: payload.role,
        content: payload.content
      },
      select: {
        id: true,
        sessionId: true,
        role: true,
        content: true,
        createdAt: true
      }
    })

    response.status(201).json({
      data: created
    })
  } catch (error) {
    next(error)
  }
})

export default chatQuotaRoutes
