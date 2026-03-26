import { CharacterStatus, CharacterVisibility, type Prisma } from '@prisma/client'
import type { Request } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import { assertSafeCharacterAssetUrls } from '../lib/character-asset-url'
import { optionalAuth, requireAdmin, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
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
  visibility: z.nativeEnum(CharacterVisibility).optional(),
  officialListing: z.boolean().optional()
})

const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    fullName: z.string().trim().max(160).nullable().optional(),
    tagline: z.string().trim().max(160).nullable().optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    personality: z.string().trim().max(8000).nullable().optional(),
    scenario: z.string().trim().max(8000).nullable().optional(),
    firstMessage: z.string().trim().max(8000).nullable().optional(),
    exampleDialogs: z.string().trim().max(12000).nullable().optional(),
    vroidFileUrl: z.string().url().nullable().optional(),
    previewImageUrl: z.string().url().nullable().optional(),
    screenshotUrls: z.array(z.string().url().max(2048)).max(16).optional(),
    legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
    legacyTier: z.number().int().min(0).max(9).nullable().optional(),
    legacyHeyWaifu: z.number().int().min(0).max(1).nullable().optional(),
    isPatreonGated: z.boolean().optional(),
    minimumTierCents: z.number().int().min(0).nullable().optional(),
    visibility: z.nativeEnum(CharacterVisibility).optional(),
    officialListing: z.boolean().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const listCharactersQuerySchema = z.object({
  status: z.nativeEnum(CharacterStatus).optional(),
  visibility: z.nativeEnum(CharacterVisibility).optional(),
  search: z.string().trim().max(120).optional(),
  galleryScope: z.enum(['all', 'curated', 'community', 'mine']).optional(),
  sort: z.enum(['name', 'hearts', 'views', 'newest']).optional().default('newest'),
  includeUnpublished: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(24)
})

const updateCharacterStatusSchema = z.object({
  status: z.nativeEnum(CharacterStatus)
})

const updateCharacterVisibilitySchema = z.object({
  visibility: z.nativeEnum(CharacterVisibility)
})

const characterParamsSchema = z.object({
  characterId: z.string().min(1)
})

const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
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
    const galleryScope = query.galleryScope ?? 'all'

    if (galleryScope === 'mine' && !actor) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const whereClause = buildCharacterListWhereClause(actor, {
      status: query.status,
      visibility: query.visibility,
      search: query.search,
      galleryScope
    })

    const orderBy: Prisma.CharacterOrderByWithRelationInput =
      query.sort === 'name'
        ? { name: 'asc' }
        : query.sort === 'hearts'
          ? { heartsCount: 'desc' }
          : query.sort === 'views'
            ? { viewsCount: 'desc' }
            : { createdAt: 'desc' }

    const characterList = await prisma.character.findMany({
      where: whereClause,
      take: query.limit,
      orderBy,
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        status: true,
        visibility: true,
        officialListing: true,
        isPatreonGated: true,
        minimumTierCents: true,
        heartsCount: true,
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
    if (error instanceof Error && error.message.toLowerCase().includes('url')) {
      response.status(400).json({
        message: error.message
      })
      return
    }

    next(error)
  }
})

characterRoutes.get('/characters/mine', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const query = listCharactersQuerySchema.parse(request.query)
    const normalizedSearch = query.search?.trim()

    const myCharacterList = await prisma.character.findMany({
      where: {
        ownerId: authUser.userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(normalizedSearch
          ? {
              OR: [
                {
                  name: {
                    contains: normalizedSearch
                  }
                },
                {
                  slug: {
                    contains: normalizedSearch
                  }
                },
                {
                  tagline: {
                    contains: normalizedSearch
                  }
                }
              ]
            }
          : {})
      },
      take: query.limit,
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        status: true,
        visibility: true,
        officialListing: true,
        isPatreonGated: true,
        minimumTierCents: true,
        heartsCount: true,
        viewsCount: true,
        previewImageUrl: true,
        createdAt: true,
        updatedAt: true
      }
    })

    response.json({
      data: myCharacterList
    })
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('url')) {
      response.status(400).json({
        message: error.message
      })
      return
    }

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
        viewsCount: true,
        officialListing: true,
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

    let viewsCount = character.viewsCount

    if (character.status === 'APPROVED' && character.visibility === 'PUBLIC') {
      const shouldCountView = !actor || (actor.userId !== character.ownerId && actor.role !== 'ADMIN')

      if (shouldCountView) {
        const viewUpdate = await prisma.character.update({
          where: {
            id: character.id
          },
          data: {
            viewsCount: {
              increment: 1
            }
          },
          select: {
            viewsCount: true
          }
        })

        viewsCount = viewUpdate.viewsCount
      }
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
        viewsCount,
        officialListing: character.officialListing,
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
    assertSafeCharacterAssetUrls({
      vroidFileUrl: payload.vroidFileUrl,
      previewImageUrl: payload.previewImageUrl,
      screenshotUrls: payload.screenshotUrls
    })
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

    const isOfficialListing = actor.role === 'ADMIN' && payload.officialListing === true

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
          officialListing: isOfficialListing,
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

characterRoutes.patch('/characters/:characterId', requireVerifiedEmail, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const payload = updateCharacterSchema.parse(request.body)
    assertSafeCharacterAssetUrls({
      vroidFileUrl: payload.vroidFileUrl,
      previewImageUrl: payload.previewImageUrl,
      screenshotUrls: payload.screenshotUrls
    })

    const actor = toCharacterAccessActor(request)

    if (!actor) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const existingCharacter = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        ownerId: true,
        status: true
      }
    })

    if (!existingCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (actor.role !== 'ADMIN' && existingCharacter.ownerId !== actor.userId) {
      response.status(403).json({
        message: 'You are not allowed to edit this character.'
      })
      return
    }

    const normalizedScreenshotUrls = normalizeScreenshotUrls(payload.screenshotUrls)
    const hasScreenshotPayload = payload.screenshotUrls !== undefined
    const shouldResetStatusToPending =
      actor.role !== 'ADMIN' && existingCharacter.status === 'APPROVED' && Object.keys(payload).length > 0

    const updatedCharacter = await prisma.$transaction(async (transactionClient) => {
      const nextCharacter = await transactionClient.character.update({
        where: {
          id: existingCharacter.id
        },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
          ...(payload.tagline !== undefined ? { tagline: payload.tagline } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.personality !== undefined ? { personality: payload.personality } : {}),
          ...(payload.scenario !== undefined ? { scenario: payload.scenario } : {}),
          ...(payload.firstMessage !== undefined ? { firstMessage: payload.firstMessage } : {}),
          ...(payload.exampleDialogs !== undefined ? { exampleDialogs: payload.exampleDialogs } : {}),
          ...(payload.vroidFileUrl !== undefined ? { vroidFileUrl: payload.vroidFileUrl } : {}),
          ...(payload.previewImageUrl !== undefined ? { previewImageUrl: payload.previewImageUrl } : {}),
          ...(payload.legacyFileHash !== undefined ? { legacyFileHash: payload.legacyFileHash } : {}),
          ...(payload.legacyTier !== undefined ? { legacyTier: payload.legacyTier } : {}),
          ...(payload.legacyHeyWaifu !== undefined ? { legacyHeyWaifu: payload.legacyHeyWaifu } : {}),
          ...(payload.isPatreonGated !== undefined ? { isPatreonGated: payload.isPatreonGated } : {}),
          ...(payload.minimumTierCents !== undefined ? { minimumTierCents: payload.minimumTierCents } : {}),
          ...(payload.visibility !== undefined ? { visibility: payload.visibility } : {}),
          ...(payload.officialListing !== undefined && actor.role === 'ADMIN' ? { officialListing: payload.officialListing } : {}),
          ...(shouldResetStatusToPending
            ? {
                status: 'PENDING',
                publishedAt: null
              }
            : {})
        },
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          visibility: true,
          updatedAt: true
        }
      })

      if (hasScreenshotPayload) {
        await transactionClient.characterScreenshot.deleteMany({
          where: {
            characterId: existingCharacter.id
          }
        })

        if (normalizedScreenshotUrls.length > 0) {
          await transactionClient.characterScreenshot.createMany({
            data: normalizedScreenshotUrls.map((imageUrl, index) => ({
              characterId: existingCharacter.id,
              imageUrl,
              sortOrder: index
            }))
          })
        }
      }

      return nextCharacter
    })

    response.json({
      data: updatedCharacter
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters/:characterId/submit', requireVerifiedEmail, async (request, response, next) => {
  try {
    const actor = toCharacterAccessActor(request)
    const { characterId } = characterParamsSchema.parse(request.params)

    if (!actor) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const existingCharacter = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        ownerId: true,
        status: true
      }
    })

    if (!existingCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (existingCharacter.ownerId !== actor.userId && actor.role !== 'ADMIN') {
      response.status(403).json({
        message: 'You are not allowed to submit this character.'
      })
      return
    }

    if (existingCharacter.status === 'PENDING') {
      response.json({
        data: {
          submitted: false,
          status: existingCharacter.status
        }
      })
      return
    }

    const updatedCharacter = await prisma.character.update({
      where: {
        id: existingCharacter.id
      },
      data: {
        status: 'PENDING',
        publishedAt: null
      },
      select: {
        id: true,
        status: true,
        updatedAt: true
      }
    })

    response.json({
      data: {
        submitted: true,
        ...updatedCharacter
      }
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

characterRoutes.patch('/characters/:characterId/visibility', requireAdmin, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const payload = updateCharacterVisibilitySchema.parse(request.body)

    const existingCharacter = await prisma.character.findUnique({
      where: {
        id: characterId
      },
      select: {
        id: true
      }
    })

    if (!existingCharacter) {
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
        visibility: payload.visibility,
        publishedAt: payload.visibility === 'PUBLIC' ? new Date() : null
      },
      select: {
        id: true,
        name: true,
        status: true,
        visibility: true,
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

characterRoutes.get('/admin/characters/review-queue', requireAdmin, async (request, response, next) => {
  try {
    const query = reviewQueueQuerySchema.parse(request.query)

    const pendingCharacterList = await prisma.character.findMany({
      where: {
        status: 'PENDING'
      },
      take: query.limit,
      orderBy: {
        updatedAt: 'asc'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        previewImageUrl: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            username: true
          }
        }
      }
    })

    response.json({
      data: pendingCharacterList
    })
  } catch (error) {
    next(error)
  }
})

export default characterRoutes
