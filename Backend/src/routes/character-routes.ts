import { CharacterStatus, CharacterVisibility } from '@prisma/client'
import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { optionalAuth, requireAdmin, requireVerifiedEmail } from '../middleware/auth-middleware'
import { prisma } from '../lib/prisma'
import { buildUniqueSlug } from '../lib/slug'
import {
  buildCharacterListWhereClause,
  canCreateCharacter,
  canModerateCharacterStatus,
  resolveCharacterAccess,
  type CharacterAccessActor
} from '../services/character-access-service'

const characterRoutes = Router()

const createCharacterSchema = z.object({
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

const characterParamsSchema = z.object({
  characterId: z.string().min(1)
})

const toCharacterAccessActor = (request: Request): CharacterAccessActor => {
  const authUser = request.authUser

  if (!authUser) {
    return null
  }

  return {
    userId: authUser.userId,
    role: authUser.role
  }
}

characterRoutes.get('/characters', optionalAuth, async (request, response, next) => {
  try {
    const query = listCharactersQuerySchema.parse(request.query)
    const actor = toCharacterAccessActor(request)
    const whereClause = buildCharacterListWhereClause(actor, {
      status: query.status,
      visibility: query.visibility,
      search: query.search
    })

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

characterRoutes.get('/characters/:characterId', optionalAuth, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const actor = toCharacterAccessActor(request)

    const character = await prisma.character.findFirst({
      where: {
        OR: [
          {
            id: characterId
          },
          {
            slug: characterId
          }
        ]
      },
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        description: true,
        vroidFileUrl: true,
        previewImageUrl: true,
        status: true,
        visibility: true,
        isPatreonGated: true,
        minimumTierCents: true,
        heartsCount: true,
        averageRating: true,
        viewsCount: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
        owner: {
          select: {
            id: true,
            username: true
          }
        }
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const characterAccess = await resolveCharacterAccess(actor, {
      id: character.id,
      ownerId: character.ownerId,
      status: character.status,
      visibility: character.visibility,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents
    })

    if (!characterAccess.canReadCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    response.json({
      data: {
        id: character.id,
        slug: character.slug,
        name: character.name,
        tagline: character.tagline,
        description: character.description,
        vroidFileUrl: characterAccess.canAccessPatreonGatedContent ? character.vroidFileUrl : null,
        previewImageUrl: character.previewImageUrl,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated,
        minimumTierCents: character.minimumTierCents,
        heartsCount: character.heartsCount,
        averageRating: character.averageRating,
        viewsCount: character.viewsCount,
        owner: character.owner,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
        publishedAt: character.publishedAt,
        gatedAccess: {
          hasAccess: characterAccess.canAccessPatreonGatedContent,
          requiredTierCents: character.minimumTierCents ?? null
        }
      }
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters', requireVerifiedEmail, async (request, response, next) => {
  try {
    const payload = createCharacterSchema.parse(request.body)
    const actor = toCharacterAccessActor(request)

    if (!canCreateCharacter(actor) || !actor) {
      response.status(403).json({
        message: 'You are not allowed to create characters.'
      })
      return
    }

    const slugSuffix = Date.now().toString().slice(-6)
    const generatedSlug = buildUniqueSlug(payload.name, slugSuffix)

    const createdCharacter = await prisma.character.create({
      data: {
        slug: generatedSlug,
        ownerId: actor.userId,
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

characterRoutes.patch('/characters/:characterId/status', requireAdmin, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const payload = updateCharacterStatusSchema.parse(request.body)
    const actor = toCharacterAccessActor(request)

    if (!canModerateCharacterStatus(actor)) {
      response.status(403).json({
        message: 'Admin permission required to moderate character status.'
      })
      return
    }

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
