import { CharacterStatus, CharacterVisibility } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { buildUniqueSlug } from '../lib/slug'

const characterRoutes = Router()

const createCharacterSchema = z.object({
  ownerId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  vroidFileUrl: z.string().url().optional(),
  previewImageUrl: z.string().url().optional(),
  isPatreonGated: z.boolean().optional(),
  minimumTierCents: z.number().int().min(0).optional(),
  visibility: z.nativeEnum(CharacterVisibility).optional()
})

const listCharactersQuerySchema = z.object({
  status: z.nativeEnum(CharacterStatus).optional(),
  visibility: z.nativeEnum(CharacterVisibility).optional(),
  search: z.string().trim().max(120).optional(),
  includeUnpublished: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(24)
})

const updateCharacterStatusSchema = z.object({
  status: z.nativeEnum(CharacterStatus)
})

characterRoutes.get('/characters', async (request, response, next) => {
  try {
    const query = listCharactersQuerySchema.parse(request.query)

    const whereClause = {
      ...(query.includeUnpublished
        ? {}
        : {
            status: 'APPROVED' as const,
            visibility: 'PUBLIC' as const
          }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: {
                  contains: query.search,
                  mode: 'insensitive' as const
                }
              },
              {
                slug: {
                  contains: query.search,
                  mode: 'insensitive' as const
                }
              }
            ]
          }
        : {})
    }

    const characterList = await prisma.character.findMany({
      where: whereClause,
      take: query.limit,
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        status: true,
        visibility: true,
        isPatreonGated: true,
        minimumTierCents: true,
        heartsCount: true,
        averageRating: true,
        viewsCount: true,
        previewImageUrl: true,
        owner: {
          select: {
            id: true,
            username: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    })

    response.json({
      data: characterList
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters', async (request, response, next) => {
  try {
    const payload = createCharacterSchema.parse(request.body)

    const owner = await prisma.user.findUnique({
      where: {
        id: payload.ownerId
      },
      select: {
        id: true
      }
    })

    if (!owner) {
      response.status(404).json({
        message: 'Owner user not found.'
      })
      return
    }

    const slugSuffix = Date.now().toString().slice(-6)
    const generatedSlug = buildUniqueSlug(payload.name, slugSuffix)

    const createdCharacter = await prisma.character.create({
      data: {
        slug: generatedSlug,
        ownerId: payload.ownerId,
        name: payload.name,
        tagline: payload.tagline,
        description: payload.description,
        vroidFileUrl: payload.vroidFileUrl,
        previewImageUrl: payload.previewImageUrl,
        isPatreonGated: payload.isPatreonGated ?? false,
        minimumTierCents: payload.minimumTierCents,
        visibility: payload.visibility ?? 'PRIVATE',
        status: 'PENDING'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        visibility: true,
        createdAt: true
      }
    })

    response.status(201).json({
      data: createdCharacter
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.patch('/characters/:characterId/status', async (request, response, next) => {
  try {
    const { characterId } = z.object({ characterId: z.string().min(1) }).parse(request.params)
    const payload = updateCharacterStatusSchema.parse(request.body)

    const currentCharacter = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true }
    })

    if (!currentCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const updatedCharacter = await prisma.character.update({
      where: {
        id: characterId
      },
      data: {
        status: payload.status,
        publishedAt: payload.status === 'APPROVED' ? new Date() : null
      },
      select: {
        id: true,
        name: true,
        status: true,
        publishedAt: true,
        updatedAt: true
      }
    })

    response.json({
      data: updatedCharacter
    })
  } catch (error) {
    next(error)
  }
})

export default characterRoutes
