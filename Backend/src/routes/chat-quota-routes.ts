import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { resolveTierQuotaForUser } from '../lib/tier-quota'

const chatQuotaRoutes = Router()

const consumeSchema = z.object({
  userId: z.string().min(1)
}).strict()

const statusSchema = z.object({
  userId: z.string().min(1).optional()
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
    const usageRecord = await getOrCreateUsageRecord(authUser.userId, periodStart, periodEnd)

    if (usageRecord.messagesUsed >= tierQuota.limit) {
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
      where: { id: usageRecord.id },
      data: { messagesUsed: { increment: 1 } }
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
    const usageRecord = await getOrCreateUsageRecord(authUser.userId, periodStart, periodEnd)
    const remaining = Math.max(0, tierQuota.limit - usageRecord.messagesUsed)

    response.json({
      data: {
        userId: authUser.userId,
        tierCode: tierQuota.tierCode,
        limit: tierQuota.limit,
        used: usageRecord.messagesUsed,
        remaining,
        periodStartsAt: periodStart.toISOString(),
        periodEndsAt: periodEnd.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

export default chatQuotaRoutes
