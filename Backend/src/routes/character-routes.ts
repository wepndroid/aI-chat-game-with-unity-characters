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
  fullName: z.string().trim().max(160).optional(),
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  personality: z.string().trim().max(8000).optional(),
  scenario: z.string().trim().max(8000).optional(),
  firstMessage: z.string().trim().max(8000).optional(),
  exampleDialogs: z.string().trim().max(12000).optional(),
  vroidFileUrl: z.string().url().optional(),
  previewImageUrl: z.string().url().optional(),
  screenshotUrls: z.array(z.string().url().max(2048)).max(16).optional(),
  legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  legacyTier: z.number().int().min(0).max(9).optional(),
  legacyHeyWaifu: z.number().int().min(0).max(1).optional(),
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

const normalizeScreenshotUrls = (screenshotUrlList: string[] | undefined) => {
  if (!screenshotUrlList) {
    return []
  }

  const deduplicatedUrlList = new Set<string>()

  for (const screenshotUrl of screenshotUrlList) {
    const normalizedUrl = screenshotUrl.trim()

    if (normalizedUrl.length === 0) {
      continue
    }

    deduplicatedUrlList.add(normalizedUrl)
  }

  return [...deduplicatedUrlList]
}

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
        fullName: true,
        tagline: true,
        description: true,
        personality: true,
        scenario: true,
        firstMessage: true,
        exampleDialogs: true,
        vroidFileUrl: true,
        previewImageUrl: true,
        legacyFileHash: true,
        legacyTier: true,
        legacyHeyWaifu: true,
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
        },
        screenshots: {
          orderBy: {
            sortOrder: 'asc'
          },
          select: {
            imageUrl: true,
            sortOrder: true
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

    const hasHearted = actor
      ? Boolean(
          await prisma.characterHeart.findUnique({
            where: {
              userId_characterId: {
                userId: actor.userId,
                characterId: character.id
              }
            },
            select: {
              id: true
            }
          })
        )
      : false

    response.json({
      data: {
        id: character.id,
        slug: character.slug,
        name: character.name,
        fullName: character.fullName,
        tagline: character.tagline,
        description: character.description,
        personality: character.personality,
        scenario: character.scenario,
        firstMessage: character.firstMessage,
        exampleDialogs: character.exampleDialogs,
        vroidFileUrl: characterAccess.canAccessPatreonGatedContent ? character.vroidFileUrl : null,
        previewImageUrl: character.previewImageUrl,
        legacyFileHash: character.legacyFileHash,
        legacyTier: character.legacyTier,
        legacyHeyWaifu: character.legacyHeyWaifu,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated,
        minimumTierCents: character.minimumTierCents,
        heartsCount: character.heartsCount,
        averageRating: character.averageRating,
        viewsCount: character.viewsCount,
        hasHearted,
        owner: character.owner,
        screenshots: character.screenshots.map((screenshot) => ({
          imageUrl: screenshot.imageUrl,
          sortOrder: screenshot.sortOrder
        })),
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
    const normalizedScreenshotUrls = normalizeScreenshotUrls(payload.screenshotUrls)

    const createdCharacter = await prisma.$transaction(async (transactionClient) => {
      const nextCharacter = await transactionClient.character.create({
        data: {
          slug: generatedSlug,
          ownerId: actor.userId,
          name: payload.name,
          fullName: payload.fullName,
          tagline: payload.tagline,
          description: payload.description,
          personality: payload.personality,
          scenario: payload.scenario,
          firstMessage: payload.firstMessage,
          exampleDialogs: payload.exampleDialogs,
          vroidFileUrl: payload.vroidFileUrl,
          previewImageUrl: payload.previewImageUrl,
          legacyFileHash: payload.legacyFileHash,
          legacyTier: payload.legacyTier,
          legacyHeyWaifu: payload.legacyHeyWaifu,
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

      if (normalizedScreenshotUrls.length > 0) {
        await transactionClient.characterScreenshot.createMany({
          data: normalizedScreenshotUrls.map((imageUrl, index) => ({
            characterId: nextCharacter.id,
            imageUrl,
            sortOrder: index
          }))
        })
      }

      return nextCharacter
    })

    response.status(201).json({
      data: createdCharacter
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters/:characterId/heart/toggle', requireVerifiedEmail, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const actor = toCharacterAccessActor(request)

    if (!actor) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const character = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        ownerId: true,
        status: true,
        visibility: true,
        isPatreonGated: true,
        minimumTierCents: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const characterAccess = await resolveCharacterAccess(actor, character)

    if (!characterAccess.canReadCharacter || !characterAccess.canAccessPatreonGatedContent) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (character.ownerId === actor.userId) {
      response.status(400).json({
        message: 'You cannot heart your own character.'
      })
      return
    }

    const toggleResult = await prisma.$transaction(async (transactionClient) => {
      const existingHeart = await transactionClient.characterHeart.findUnique({
        where: {
          userId_characterId: {
            userId: actor.userId,
            characterId: character.id
          }
        },
        select: {
          id: true
        }
      })

      if (existingHeart) {
        await transactionClient.characterHeart.delete({
          where: {
            id: existingHeart.id
          }
        })
      } else {
        await transactionClient.characterHeart.create({
          data: {
            userId: actor.userId,
            characterId: character.id
          }
        })
      }

      const totalHearts = await transactionClient.characterHeart.count({
        where: {
          characterId: character.id
        }
      })

      await transactionClient.character.update({
        where: {
          id: character.id
        },
        data: {
          heartsCount: totalHearts
        }
      })

      return {
        hasHearted: !existingHeart,
        heartsCount: totalHearts
      }
    })

    response.json({
      data: toggleResult
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
