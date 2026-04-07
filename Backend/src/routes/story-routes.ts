import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { optionalAuth, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'

const storyRoutes = Router()

const storyParamsSchema = z.object({
  storyId: z.string().min(1)
})

const createStorySchema = z
  .object({
    title: z.string().trim().max(200),
    body: z.string().trim().max(20000),
    characterId: z.string().min(1).optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    /** Omit or `PUBLISHED` = publish rules; `DRAFT` = save without listing publicly. */
    publicationStatus: z.enum(['DRAFT', 'PUBLISHED']).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    const title = data.title.trim()
    const body = data.body.trim()
    const effectivePublication = data.publicationStatus ?? 'PUBLISHED'
    const isDraft = effectivePublication === 'DRAFT'

    if (isDraft) {
      if (title.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Title is required.', path: ['title'] })
      }
      if (body.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Body is required.', path: ['body'] })
      }
    } else {
      if (title.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Title must be at least 3 characters.',
          path: ['title']
        })
      }
      if (body.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Body must be at least 10 characters.',
          path: ['body']
        })
      }
    }
  })

const updateStorySchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    body: z.string().trim().max(20000).optional(),
    characterId: z.string().min(1).nullable().optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
    publicationStatus: z.enum(['DRAFT', 'PUBLISHED']).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const listStoriesQuerySchema = z.object({
  scope: z.enum(['all', 'mine']).optional().default('all'),
  characterId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(['newest', 'likes']).optional().default('newest'),
  /** When scope is mine: filter by draft vs published. Ignored for scope=all. */
  publication: z.enum(['all', 'draft', 'published']).optional().default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict()

/** List view: no full body in JSON (only bodyPreview) to avoid leaking long private text in feed responses. */
const storyListSelectFields = {
  id: true,
  title: true,
  visibility: true,
  publicationStatus: true,
  publishedAt: true,
  likesCount: true,
  characterId: true,
  createdAt: true,
  updatedAt: true,
  body: true,
  author: {
    select: {
      id: true,
      username: true
    }
  },
  character: {
    select: {
      id: true,
      name: true,
      slug: true,
      previewImageUrl: true
    }
  }
} as const

const storySelectFields = {
  id: true,
  title: true,
  body: true,
  visibility: true,
  publicationStatus: true,
  publishedAt: true,
  likesCount: true,
  characterId: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      id: true,
      username: true
    }
  },
  character: {
    select: {
      id: true,
      name: true,
      slug: true,
      previewImageUrl: true
    }
  }
} as const

storyRoutes.get('/stories', optionalAuth, async (request, response, next) => {
  try {
    const query = listStoriesQuerySchema.parse(request.query)
    const authUser = request.authUser

    if (query.scope === 'mine' && !authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const conditions: Record<string, unknown>[] = []

    if (query.scope === 'mine' && authUser) {
      conditions.push({ authorId: authUser.userId })
      if (query.publication === 'draft') {
        conditions.push({ publicationStatus: 'DRAFT' })
      } else if (query.publication === 'published') {
        conditions.push({ publicationStatus: 'PUBLISHED' })
      }
    } else {
      conditions.push({ visibility: 'PUBLIC' })
      conditions.push({ publicationStatus: 'PUBLISHED' })
    }

    if (query.characterId) {
      conditions.push({ characterId: query.characterId })
    }

    if (query.search?.trim()) {
      conditions.push({
        OR: [
          { title: { contains: query.search.trim() } },
          { body: { contains: query.search.trim() } }
        ]
      })
    }

    const where = conditions.length > 0 ? { AND: conditions } : {}

    const orderBy: Prisma.StoryPostOrderByWithRelationInput[] =
      query.sort === 'likes'
        ? [{ likesCount: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }]
        : query.scope === 'all'
          ? [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
          : [{ updatedAt: 'desc' }]

    const stories = await prisma.storyPost.findMany({
      where,
      take: query.limit,
      orderBy: orderBy.length === 1 ? orderBy[0]! : orderBy,
      select: storyListSelectFields
    })

    const listPayload = stories.map((story) => {
      const raw = story.body
      const bodyPreview = raw.length > 280 ? `${raw.slice(0, 280)}...` : raw
      const { body: _omit, ...rest } = story

      return {
        ...rest,
        bodyPreview
      }
    })

    response.json({ data: listPayload })
  } catch (error) {
    next(error)
  }
})

storyRoutes.get('/stories/:storyId', optionalAuth, async (request, response, next) => {
  try {
    const { storyId } = storyParamsSchema.parse(request.params)
    const authUser = request.authUser

    const story = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: storySelectFields
    })

    if (!story) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (story.visibility === 'PRIVATE' && story.author.id !== authUser?.userId) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (
      story.publicationStatus === 'DRAFT' &&
      story.author.id !== authUser?.userId &&
      authUser?.role !== 'ADMIN'
    ) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    const hasLiked = authUser
      ? Boolean(
          await prisma.storyPostLike.findUnique({
            where: { userId_storyId: { userId: authUser.userId, storyId: story.id } },
            select: { id: true }
          })
        )
      : false

    response.json({
      data: {
        ...story,
        hasLiked
      }
    })
  } catch (error) {
    next(error)
  }
})

storyRoutes.post('/stories', requireVerifiedEmail, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const payload = createStorySchema.parse(request.body)

    if (payload.characterId) {
      const character = await prisma.character.findUnique({
        where: { id: payload.characterId },
        select: { id: true, ownerId: true }
      })

      if (!character || character.ownerId !== authUser.userId) {
        response.status(400).json({ message: 'Character not found or you do not own this character.' })
        return
      }
    }

    const publicationStatus: 'DRAFT' | 'PUBLISHED' = payload.publicationStatus ?? 'PUBLISHED'
    const now = new Date()

    const story = await prisma.storyPost.create({
      data: {
        authorId: authUser.userId,
        title: payload.title.trim(),
        body: payload.body.trim(),
        characterId: payload.characterId ?? null,
        visibility: payload.visibility ?? 'PUBLIC',
        publicationStatus,
        publishedAt: publicationStatus === 'PUBLISHED' ? now : null
      },
      select: storySelectFields
    })

    response.status(201).json({ data: story })
  } catch (error) {
    next(error)
  }
})

storyRoutes.patch('/stories/:storyId', requireVerifiedEmail, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const { storyId } = storyParamsSchema.parse(request.params)
    const payload = updateStorySchema.parse(request.body)

    const existing = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: {
        authorId: true,
        title: true,
        body: true,
        publicationStatus: true,
        publishedAt: true
      }
    })

    if (!existing) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (existing.authorId !== authUser.userId && authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'You can only edit your own stories.' })
      return
    }

    const nextTitle = (payload.title !== undefined ? payload.title : existing.title).trim()
    const nextBody = (payload.body !== undefined ? payload.body : existing.body).trim()
    const nextPublication =
      payload.publicationStatus !== undefined ? payload.publicationStatus : existing.publicationStatus

    if (nextPublication === 'PUBLISHED') {
      if (nextTitle.length < 3) {
        response.status(400).json({ message: 'Title must be at least 3 characters to publish.' })
        return
      }
      if (nextBody.length < 10) {
        response.status(400).json({ message: 'Body must be at least 10 characters to publish.' })
        return
      }
    } else {
      if (nextTitle.length < 1) {
        response.status(400).json({ message: 'Title is required.' })
        return
      }
      if (nextBody.length < 1) {
        response.status(400).json({ message: 'Body is required.' })
        return
      }
    }

    if (payload.characterId) {
      const character = await prisma.character.findUnique({
        where: { id: payload.characterId },
        select: { id: true, ownerId: true }
      })

      const allowedOwnerId = existing.authorId
      const editorOwnsCharacter = Boolean(character && character.ownerId === authUser.userId)
      const adminLinksAuthorCharacter =
        authUser.role === 'ADMIN' && Boolean(character && character.ownerId === allowedOwnerId)

      if (!character || (!editorOwnsCharacter && !adminLinksAuthorCharacter)) {
        response.status(400).json({ message: 'Character not found or cannot be linked to this story.' })
        return
      }
    }

    const updateData: Record<string, unknown> = {}

    if (payload.title !== undefined) updateData.title = payload.title.trim()
    if (payload.body !== undefined) updateData.body = payload.body.trim()
    if (payload.visibility !== undefined) updateData.visibility = payload.visibility
    if (payload.characterId !== undefined) updateData.characterId = payload.characterId
    if (payload.publicationStatus !== undefined) {
      updateData.publicationStatus = payload.publicationStatus
      if (payload.publicationStatus === 'PUBLISHED' && !existing.publishedAt) {
        updateData.publishedAt = new Date()
      }
    }

    const updated = await prisma.storyPost.update({
      where: { id: storyId },
      data: updateData,
      select: storySelectFields
    })

    response.json({ data: updated })
  } catch (error) {
    next(error)
  }
})

storyRoutes.delete('/stories/:storyId', requireVerifiedEmail, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const { storyId } = storyParamsSchema.parse(request.params)

    const existing = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: { authorId: true }
    })

    if (!existing) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (existing.authorId !== authUser.userId && authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'You can only delete your own stories.' })
      return
    }

    await prisma.storyPost.delete({ where: { id: storyId } })

    response.json({ message: 'Story deleted.' })
  } catch (error) {
    next(error)
  }
})

storyRoutes.post('/stories/:storyId/like/toggle', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const { storyId } = storyParamsSchema.parse(request.params)

    const story = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: { id: true, visibility: true, authorId: true, publicationStatus: true }
    })

    if (!story) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (story.publicationStatus !== 'PUBLISHED') {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (story.visibility === 'PRIVATE' && story.authorId !== authUser.userId) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (story.authorId === authUser.userId) {
      response.status(403).json({ message: 'You cannot like your own story.' })
      return
    }

    const existingLike = await prisma.storyPostLike.findUnique({
      where: { userId_storyId: { userId: authUser.userId, storyId } },
      select: { id: true }
    })

    if (existingLike) {
      await prisma.$transaction([
        prisma.storyPostLike.delete({ where: { id: existingLike.id } }),
        prisma.storyPost.update({
          where: { id: storyId },
          data: { likesCount: { decrement: 1 } }
        })
      ])

      const updated = await prisma.storyPost.findUnique({
        where: { id: storyId },
        select: { likesCount: true }
      })

      response.json({ data: { liked: false, likesCount: updated?.likesCount ?? 0 } })
    } else {
      try {
        await prisma.$transaction([
          prisma.storyPostLike.create({
            data: { userId: authUser.userId, storyId }
          }),
          prisma.storyPost.update({
            where: { id: storyId },
            data: { likesCount: { increment: 1 } }
          })
        ])
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const row = await prisma.storyPost.findUnique({
            where: { id: storyId },
            select: { likesCount: true }
          })
          response.json({ data: { liked: true, likesCount: row?.likesCount ?? 0 } })
          return
        }
        throw error
      }

      const updated = await prisma.storyPost.findUnique({
        where: { id: storyId },
        select: { likesCount: true }
      })

      response.json({ data: { liked: true, likesCount: updated?.likesCount ?? 0 } })
    }
  } catch (error) {
    next(error)
  }
})

export default storyRoutes
