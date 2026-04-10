import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth } from '../middleware/auth-middleware'

const userNotificationRoutes = Router()

const markReadSchema = z.object({
  id: z.string().min(1)
})

userNotificationRoutes.get('/users/me/notifications', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const userId = authUser.userId

    const [dbRows, storyRows] = await Promise.all([
      prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true
        }
      }),
      prisma.storyPost.findMany({
        where: {
          authorId: userId,
          publicationStatus: 'PUBLISHED',
          moderationStatus: 'REJECTED',
          authorReadRejectionAt: null
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
        select: {
          id: true,
          title: true,
          moderationRejectReason: true,
          updatedAt: true
        }
      })
    ])

    const storyItems = storyRows.map((story) => ({
      id: `story:${story.id}`,
      kind: 'story_rejected' as const,
      title: 'Scenario rejected',
      body: story.moderationRejectReason?.trim() || 'Your scenario needs changes before it can go live.',
      href: `/stories/${story.id}/edit`,
      createdAt: story.updatedAt.toISOString(),
      read: false
    }))

    const dbItems = dbRows.map((notification) => ({
      id: notification.id,
      kind: notification.kind,
      title: notification.title,
      body: notification.body,
      href: notification.href ?? '/',
      createdAt: notification.createdAt.toISOString(),
      read: notification.readAt !== null
    }))

    const items = [...storyItems, ...dbItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    const unreadStoryCount = storyRows.length
    const unreadDbCount = dbRows.filter((notification) => notification.readAt === null).length
    const unreadCount = unreadStoryCount + unreadDbCount

    response.json({
      data: {
        items: items.slice(0, 50),
        unreadCount
      }
    })
  } catch (error) {
    next(error)
  }
})

userNotificationRoutes.post('/users/me/notifications/mark-read', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const payload = markReadSchema.parse(request.body)
    const { id } = payload

    if (id.startsWith('story:')) {
      const storyId = id.slice('story:'.length)
      const result = await prisma.storyPost.updateMany({
        where: {
          id: storyId,
          authorId: authUser.userId,
          publicationStatus: 'PUBLISHED',
          moderationStatus: 'REJECTED',
          authorReadRejectionAt: null
        },
        data: {
          authorReadRejectionAt: new Date()
        }
      })
      response.json({
        data: {
          updated: result.count > 0
        }
      })
      return
    }

    const result = await prisma.userNotification.updateMany({
      where: {
        id,
        userId: authUser.userId,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    })

    response.json({
      data: {
        updated: result.count > 0
      }
    })
  } catch (error) {
    next(error)
  }
})

export default userNotificationRoutes
