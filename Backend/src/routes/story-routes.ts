import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { optionalAuth, requireAdmin, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError } from '../lib/api-contract'
import { assertSafeCharacterAssetUrls, CharacterAssetUrlValidationError } from '../lib/character-asset-url'
import { combineScenarioFields } from '../lib/combine-scenario-body'
import { prisma } from '../lib/prisma'
import { emailAdminsReviewQueue, notifyAdminsReviewQueueBestEffort } from '../lib/notify-admins-review-queue'
import { storyScenarioTypeSchema } from '../lib/story-scenario-type'
import { resolveCharacterAccess } from '../services/character/character-access-policy'
import { resolveCharacterStoryAvailability } from '../services/character/character-story-availability-service'
import {
  clearCharacterDefaultStory,
  clearDefaultIfStoryBecameNonPlayable,
  setCharacterDefaultStory
} from '../services/story/story-default-service'
import { isPlayableStory } from '../services/story/story-default-policy'
import { resolveStoryOriginForAuthor } from '../services/story/story-origin-policy'
import {
  characterStoryCatalogSelectFields,
  toCharacterStoryCatalogPayload
} from '../services/story/character-story-catalog-payload'
import {
  buildPublicStoryCatalogWhere,
  buildCharacterStoryCatalogWhere,
  canReadStoryWithCharacterAsViewer
} from '../services/story/story-visibility-policy'
import { tryDeleteTrustedUploadFile } from '../lib/delete-local-upload-file'
import { enqueueUploadedVoiceProviderRegistration } from '../lib/tts-provider-uploaded-voice-alias'
import { getUploadRelativePathFromUrl } from '../lib/upload-paths'

const storyRoutes = Router()

const enqueueVoiceFileUrlProviderRegistration = async (voiceFileUrl: string | null | undefined) => {
  const relativePath = getUploadRelativePathFromUrl(voiceFileUrl)
  if (relativePath) {
    await enqueueUploadedVoiceProviderRegistration(relativePath)
  }
}

/** Express may pass repeated query keys as string[]; strip to a single value for Zod. */
const firstQueryValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return undefined
}

const trimOrNull = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const extractCharacterIdCandidateFromRouteKey = (value: string) => {
  const trimmed = value.trim()
  const lastDashIndex = trimmed.lastIndexOf('-')
  if (lastDashIndex <= 0 || lastDashIndex >= trimmed.length - 1) {
    return null
  }
  return trimmed.slice(lastDashIndex + 1)
}

const resolveCharacterByRouteKey = async (characterRouteKey: string) => {
  const characterIdCandidate = extractCharacterIdCandidateFromRouteKey(characterRouteKey)
  return prisma.character.findFirst({
    where: {
      OR: [
        { id: characterRouteKey },
        ...(characterIdCandidate ? [{ id: characterIdCandidate }] : []),
        { slug: characterRouteKey }
      ]
    },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerId: true,
      status: true,
      visibility: true,
      isPatreonGated: true
    }
  })
}

const orderStoryObject = <T extends { id: string; character?: unknown }>(story: T) => {
  const { id, character, ...rest } = story
  if (character === undefined) {
    return { id, ...rest }
  }
  return { id, character, ...rest }
}

const addStoryDefaultMetadata = <
  T extends {
    id: string
    character?: { defaultStoryId?: string | null } | null
  }
>(
  story: T
) => ({
  ...story,
  isDefault: Boolean(story.character?.defaultStoryId && story.character.defaultStoryId === story.id)
})

const toPhase1CreatePayload = (rawBody: Record<string, unknown>) => {
  const promptDescription = firstQueryValue(rawBody.promptDescription) ?? firstQueryValue(rawBody.prompt_description)
  const scenario = firstQueryValue(rawBody.scenario)
  const isPublic =
    toOptionalBoolean(firstQueryValue(rawBody.isPublic)) ??
    toOptionalBoolean(firstQueryValue(rawBody.is_public))

  return {
    title: firstQueryValue(rawBody.title),
    scenarioStory: firstQueryValue(rawBody.scenarioStory) ?? promptDescription ?? '',
    scenarioChat: firstQueryValue(rawBody.scenarioChat) ?? scenario ?? '',
    characterId: firstQueryValue(rawBody.characterId) ?? firstQueryValue(rawBody.character_id),
    scenarioType: firstQueryValue(rawBody.scenarioType),
    publicationStatus: firstQueryValue(rawBody.publicationStatus),
    isPublic,
    promptDescription,
    personality: firstQueryValue(rawBody.personality),
    scenario,
    firstMessage: firstQueryValue(rawBody.firstMessage) ?? firstQueryValue(rawBody.first_message),
    exampleDialogs: firstQueryValue(rawBody.exampleDialogs) ?? firstQueryValue(rawBody.example_dialogs),
    voiceFileUrl: firstQueryValue(rawBody.voiceFileUrl) ?? firstQueryValue(rawBody.voice_file_url),
    voiceFileName: firstQueryValue(rawBody.voiceFileName) ?? firstQueryValue(rawBody.voice_file_name)
  }
}

const toPhase1UpdatePayload = (rawBody: Record<string, unknown>) => {
  const promptDescription = firstQueryValue(rawBody.promptDescription) ?? firstQueryValue(rawBody.prompt_description)
  const scenario = firstQueryValue(rawBody.scenario)
  const isPublic =
    toOptionalBoolean(firstQueryValue(rawBody.isPublic)) ??
    toOptionalBoolean(firstQueryValue(rawBody.is_public))

  return {
    title: firstQueryValue(rawBody.title),
    scenarioStory: firstQueryValue(rawBody.scenarioStory) ?? promptDescription,
    scenarioChat: firstQueryValue(rawBody.scenarioChat) ?? scenario,
    scenarioType: firstQueryValue(rawBody.scenarioType),
    publicationStatus: firstQueryValue(rawBody.publicationStatus),
    isPublic,
    promptDescription,
    personality: firstQueryValue(rawBody.personality),
    scenario,
    firstMessage: firstQueryValue(rawBody.firstMessage) ?? firstQueryValue(rawBody.first_message),
    exampleDialogs: firstQueryValue(rawBody.exampleDialogs) ?? firstQueryValue(rawBody.example_dialogs),
    voiceFileUrl: firstQueryValue(rawBody.voiceFileUrl) ?? firstQueryValue(rawBody.voice_file_url),
    voiceFileName: firstQueryValue(rawBody.voiceFileName) ?? firstQueryValue(rawBody.voice_file_name)
  }
}

const storyParamsSchema = z.object({
  storyId: z.string().min(1)
})

const characterStoriesParamsSchema = z.object({
  characterId: z.string().min(1)
})

const createStorySchema = z
  .object({
    title: z.string().trim().max(200),
    /** Left column on scenario cards: setting / narrative (plain text). */
    scenarioStory: z.string().max(8000),
    /** Right column: dialogue and stage direction (mini-markup: `"…"`, `**…**`, `*…*`). */
    scenarioChat: z.string().max(12000),
    characterId: z.string().min(1),
    scenarioType: storyScenarioTypeSchema.optional(),
    /** Omit or `PUBLISHED` = publish rules; `DRAFT` = save without listing publicly. */
    publicationStatus: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    isPublic: z.boolean().optional(),
    promptDescription: z.string().max(5000).optional(),
    personality: z.string().max(8000).optional(),
    scenario: z.string().max(8000).optional(),
    firstMessage: z.string().max(50000).optional(),
    exampleDialogs: z.string().max(12000).optional(),
    voiceFileUrl: z.string().url().optional(),
    voiceFileName: z.string().trim().max(255).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    const title = data.title.trim()
    const description = (data.promptDescription ?? '').trim()
    const personality = (data.personality ?? '').trim()
    const story = data.scenarioStory.trim()
    const scenario = (data.scenario ?? data.scenarioStory).trim()
    const chat = data.scenarioChat.trim()
    const firstMessage = (data.firstMessage ?? '').trim()
    const effectivePublication = data.publicationStatus ?? (data.isPublic === false ? 'DRAFT' : 'PUBLISHED')
    const isDraft = effectivePublication === 'DRAFT'
    const combined = combineScenarioFields(data.scenarioStory, data.scenarioChat)

    if (combined.length > 20000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Story and chat combined must be at most 20000 characters.',
        path: ['scenarioChat']
      })
    }

    if (isDraft) {
      if (title.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Title is required.', path: ['title'] })
      }
      if (description.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Description is required.', path: ['promptDescription'] })
      }
      if (personality.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Personality is required.', path: ['personality'] })
      }
      if (scenario.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Scenario is required.', path: ['scenarioStory'] })
      }
      if (firstMessage.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'First message is required.', path: ['firstMessage'] })
      }
      if (story.length < 1 && chat.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Add a story setup and/or chat preview.',
          path: ['scenarioChat']
        })
      }
    } else {
      if (title.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Title must be at least 3 characters.',
          path: ['title']
        })
      }
      if (story.length < 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Story setup must be at least 30 characters.',
          path: ['scenarioStory']
        })
      }
      if (description.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Description is required.', path: ['promptDescription'] })
      }
      if (personality.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Personality is required.', path: ['personality'] })
      }
      if (scenario.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Scenario is required.', path: ['scenarioStory'] })
      }
      if (firstMessage.length < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'First message is required.', path: ['firstMessage'] })
      }
    }
  })

const updateStorySchema = z
  .object({
    title: z.string().trim().max(200).optional(),
    scenarioStory: z.string().trim().max(8000).optional(),
    scenarioChat: z.string().trim().max(12000).optional(),
    scenarioType: storyScenarioTypeSchema.nullable().optional(),
    publicationStatus: z.enum(['DRAFT', 'PUBLISHED']).optional(),
    isPublic: z.boolean().optional(),
    promptDescription: z.string().trim().max(5000).nullable().optional(),
    personality: z.string().trim().max(8000).nullable().optional(),
    scenario: z.string().trim().max(8000).nullable().optional(),
    firstMessage: z.string().trim().max(50000).nullable().optional(),
    exampleDialogs: z.string().trim().max(12000).nullable().optional(),
    voiceFileUrl: z.string().url().nullable().optional(),
    voiceFileName: z.string().trim().max(255).nullable().optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const listStoriesQuerySchema = z
  .object({
    scope: z.preprocess(firstQueryValue, z.enum(['all', 'mine']).optional().default('all')),
    characterId: z.preprocess(firstQueryValue, z.string().min(1).optional()),
    search: z.preprocess(firstQueryValue, z.string().trim().max(120).optional()),
    sort: z.preprocess(firstQueryValue, z.enum(['newest', 'likes']).optional().default('newest')),
    /** When scope is mine: filter by draft vs published vs rejected (rejected = published + moderation rejected). Ignored for scope=all. */
    publication: z.preprocess(
      firstQueryValue,
      z.enum(['all', 'draft', 'published', 'rejected']).optional().default('all')
    ),
    cursor: z.preprocess(firstQueryValue, z.string().trim().min(1).optional()),
    limit: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(100).default(20))
  })
  .strip()

const listCharacterStoriesQuerySchema = z
  .object({
    cursor: z.preprocess(firstQueryValue, z.string().trim().min(1).optional()),
    sort: z.preprocess(firstQueryValue, z.enum(['newest', 'likes']).optional().default('newest')),
    limit: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(100).default(20))
  })
  .strip()

const adminListStoriesQuerySchema = z
  .object({
    search: z.preprocess(firstQueryValue, z.string().trim().max(120).optional()),
    sort: z.preprocess(firstQueryValue, z.enum(['newest', 'likes']).optional().default('newest')),
    /** Which moderation bucket to list (only `PUBLISHED` stories appear in admin). */
    moderation: z.preprocess(
      firstQueryValue,
      z.enum(['all', 'pending', 'approved', 'rejected']).optional().default('pending')
    ),
    page: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).default(1)),
    limit: z.preprocess(firstQueryValue, z.coerce.number().int().min(1).max(100).default(25))
  })
  .strip()

const adminModerateStorySchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    rejectReason: z.string().trim().max(2000).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decision === 'reject') {
      const reason = data.rejectReason?.trim() ?? ''
      if (reason.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Reject reason is required.',
          path: ['rejectReason']
        })
      }
    }
  })

const adminSetStoryOriginSchema = z
  .object({
    origin: z.enum(['OFFICIAL', 'COMMUNITY'])
  })
  .strict()

const adminSetDefaultStorySchema = z
  .object({
    storyId: z.string().min(1)
  })
  .strict()

/** List view: no full body in JSON (only bodyPreview) to avoid leaking long private text in feed responses. */
const storyListSelectFields = {
  id: true,
  title: true,
  promptDescription: true,
  personality: true,
  scenario: true,
  firstMessage: true,
  exampleDialogs: true,
  scenarioStory: true,
  scenarioChat: true,
  origin: true,
  publicationStatus: true,
  moderationStatus: true,
  moderationRejectReason: true,
  publishedAt: true,
  likesCount: true,
  characterId: true,
  scenarioType: true,
  voiceFileUrl: true,
  voiceFileName: true,
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
      previewImageUrl: true,
      defaultStoryId: true
    }
  }
} as const

const storySelectFields = {
  id: true,
  title: true,
  promptDescription: true,
  personality: true,
  scenario: true,
  firstMessage: true,
  exampleDialogs: true,
  scenarioStory: true,
  scenarioChat: true,
  body: true,
  origin: true,
  publicationStatus: true,
  moderationStatus: true,
  moderationRejectReason: true,
  publishedAt: true,
  likesCount: true,
  characterId: true,
  scenarioType: true,
  voiceFileUrl: true,
  voiceFileName: true,
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
      previewImageUrl: true,
      defaultStoryId: true
    }
  }
} as const

const storyVisibilitySelectFields = {
  ...storySelectFields,
  character: {
    select: {
      ...storySelectFields.character.select,
      ownerId: true,
      status: true,
      visibility: true
    }
  }
} as const

storyRoutes.get('/characters/:characterId/stories', optionalAuth, async (request, response, next) => {
  try {
    const { characterId } = characterStoriesParamsSchema.parse(request.params)
    const query = listCharacterStoriesQuerySchema.parse(request.query)
    const authUser = request.authUser

    const character = await resolveCharacterByRouteKey(characterId)
    if (!character) {
      sendApiError(response, 404, 'NOT_FOUND', 'Character not found.')
      return
    }

    const access = await resolveCharacterAccess(
      authUser
        ? {
            userId: authUser.userId,
            role: authUser.role,
            isEmailVerified: authUser.isEmailVerified
          }
        : null,
      {
        id: character.id,
        ownerId: character.ownerId,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated
      }
    )

    if (!access.canReadCharacter) {
      sendApiError(response, 404, 'NOT_FOUND', 'Character not found.')
      return
    }

    const offset = decodeOffsetCursor(query.cursor)
    const orderBy: Prisma.StoryPostOrderByWithRelationInput[] =
      query.sort === 'likes'
        ? [{ likesCount: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }]
        : [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
    const storyAvailability = await resolveCharacterStoryAvailability(character.id)
    const defaultStoryId = storyAvailability.defaultStoryId
    const catalogWhere = buildCharacterStoryCatalogWhere(
      character.id,
      authUser
        ? {
            userId: authUser.userId,
            role: authUser.role
          }
        : null
    )
    const defaultStoryRow =
      defaultStoryId && offset === 0
        ? await prisma.storyPost.findFirst({
            where: {
              AND: [catalogWhere, { id: defaultStoryId }]
            },
            select: characterStoryCatalogSelectFields
          })
        : null
    const normalOffset = defaultStoryId && offset > 0 ? offset - 1 : offset
    const nonDefaultTake = defaultStoryRow ? query.limit : query.limit + 1

    const storyRows = await prisma.storyPost.findMany({
      where: defaultStoryId
        ? {
            AND: [catalogWhere, { id: { not: defaultStoryId } }]
          }
        : catalogWhere,
      skip: normalOffset,
      take: nonDefaultTake,
      orderBy: orderBy.length === 1 ? orderBy[0]! : orderBy,
      select: characterStoryCatalogSelectFields
    })

    const pageRows = defaultStoryRow
      ? [defaultStoryRow, ...storyRows.slice(0, Math.max(0, query.limit - 1))]
      : storyRows.slice(0, query.limit)
    const nonDefaultPageCount = defaultStoryRow ? pageRows.length - 1 : pageRows.length
    const hasMore = defaultStoryRow ? storyRows.length > nonDefaultPageCount : storyRows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null

    let likedStoryIds = new Set<string>()
    if (authUser && pageRows.length > 0) {
      const likes = await prisma.storyPostLike.findMany({
        where: {
          userId: authUser.userId,
          storyId: {
            in: pageRows.map((story) => story.id)
          }
        },
        select: {
          storyId: true
        }
      })
      likedStoryIds = new Set(likes.map((row) => row.storyId))
    }

    sendApiData(
      response,
      {
        character: {
          id: character.id,
          slug: character.slug,
          name: character.name,
          default_story_id: defaultStoryId
        },
        stories: pageRows.map((story) =>
          toCharacterStoryCatalogPayload(story, {
            hasLiked: likedStoryIds.has(story.id),
            isDefault: story.id === defaultStoryId
          })
        )
      },
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

storyRoutes.get('/stories', optionalAuth, async (request, response, next) => {
  try {
    const rawQuery = request.query as Record<string, unknown>
    const query = listStoriesQuerySchema.parse({
      ...rawQuery,
      // Spec compatibility: accept snake_case alias from Unity (`character_id`).
      characterId: firstQueryValue(rawQuery.characterId) ?? firstQueryValue(rawQuery.character_id)
    })
    const authUser = request.authUser

    if (query.scope === 'mine' && !authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    let resolvedCharacterIdForFilter: string | undefined

    if (query.characterId) {
      const character = await resolveCharacterByRouteKey(query.characterId)

      if (!character) {
        sendApiData(response, [], {
          page: {
            nextCursor: null
          }
        })
        return
      }

      resolvedCharacterIdForFilter = character.id
    }

    let where: Prisma.StoryPostWhereInput = {}

    if (query.scope === 'mine' && authUser) {
      const mineParts: Prisma.StoryPostWhereInput[] = [{ authorId: authUser.userId }]
      if (query.publication === 'draft') {
        mineParts.push({ publicationStatus: 'DRAFT' })
      } else if (query.publication === 'rejected') {
        mineParts.push({ publicationStatus: 'PUBLISHED' })
        mineParts.push({ moderationStatus: 'REJECTED' })
      } else if (query.publication === 'published') {
        mineParts.push({ publicationStatus: 'PUBLISHED' })
        mineParts.push({ moderationStatus: { not: 'REJECTED' } })
      }

      if (resolvedCharacterIdForFilter) {
        mineParts.push({ characterId: resolvedCharacterIdForFilter })
      }

      if (query.search?.trim()) {
        const term = query.search.trim()
        mineParts.push({
          OR: [
            { title: { contains: term } },
            { body: { contains: term } },
            { promptDescription: { contains: term } },
            { personality: { contains: term } },
            { scenario: { contains: term } },
            { firstMessage: { contains: term } },
            { exampleDialogs: { contains: term } },
            { scenarioStory: { contains: term } },
            { scenarioChat: { contains: term } }
          ]
        })
      }

      where = { AND: mineParts }
    } else {
      where = buildPublicStoryCatalogWhere({
        actor: authUser
          ? {
              userId: authUser.userId,
              role: authUser.role
            }
          : null,
        characterId: resolvedCharacterIdForFilter,
        searchTerm: query.search
      })
    }

    const orderBy: Prisma.StoryPostOrderByWithRelationInput[] =
      query.sort === 'likes'
        ? [{ likesCount: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }]
        : query.scope === 'all'
          ? [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
          : [{ updatedAt: 'desc' }]

    const offset = decodeOffsetCursor(query.cursor)
    const storyRows = await prisma.storyPost.findMany({
      where,
      skip: offset,
      take: query.limit + 1,
      orderBy: orderBy.length === 1 ? orderBy[0]! : orderBy,
      select: storyListSelectFields
    })

    const stories = storyRows.slice(0, query.limit)
    const hasMore = storyRows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + stories.length) : null

    let likedStoryIds = new Set<string>()
    if (authUser && stories.length > 0 && query.scope !== 'mine') {
      const storyIds = stories.map((row) => row.id)
      const existingLikes = await prisma.storyPostLike.findMany({
        where: {
          userId: authUser.userId,
          storyId: { in: storyIds }
        },
        select: { storyId: true }
      })
      likedStoryIds = new Set(existingLikes.map((row) => row.storyId))
    }

    const listPayload = stories.map((story) => {
      const combined =
        combineScenarioFields(story.scenarioStory ?? '', story.scenarioChat ?? '').trim() || story.body
      const bodyPreview = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined
      const { body: _omit, characterId: _omitCharacterId, ...rest } = story
      const isPublic = story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'

      const withPreview = {
        ...orderStoryObject(addStoryDefaultMetadata(rest)),
        bodyPreview,
        // Phase-1 spec compatibility (`public_summary`, `is_public`).
        public_summary: bodyPreview,
        is_public: isPublic
      }

      if (query.scope === 'mine') {
        return withPreview
      }

      const { moderationRejectReason: _drop, ...publicRow } = withPreview

      return {
        ...publicRow,
        hasLiked: likedStoryIds.has(story.id)
      }
    })

    sendApiData(response, listPayload, {
      page: {
        nextCursor
      }
    })
  } catch (error) {
    next(error)
  }
})

storyRoutes.get('/admin/stories', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser || authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'Forbidden.' })
      return
    }

    const query = adminListStoriesQuerySchema.parse(request.query)
    const skip = (query.page - 1) * query.limit

    const conditions: Record<string, unknown>[] = [{ publicationStatus: 'PUBLISHED' }]

    if (query.moderation === 'pending') {
      conditions.push({ moderationStatus: 'PENDING' })
    } else if (query.moderation === 'approved') {
      conditions.push({ moderationStatus: 'APPROVED' })
    } else if (query.moderation === 'rejected') {
      conditions.push({ moderationStatus: 'REJECTED' })
    }

    if (query.search?.trim()) {
      const term = query.search.trim()
      conditions.push({
        OR: [
          { title: { contains: term } },
          { body: { contains: term } },
          { promptDescription: { contains: term } },
          { personality: { contains: term } },
          { scenario: { contains: term } },
          { firstMessage: { contains: term } },
          { exampleDialogs: { contains: term } },
          { scenarioStory: { contains: term } },
          { scenarioChat: { contains: term } }
        ]
      })
    }

    const where = conditions.length > 0 ? { AND: conditions } : {}

    const orderBy: Prisma.StoryPostOrderByWithRelationInput[] =
      query.sort === 'likes'
        ? [{ likesCount: 'desc' }, { createdAt: 'desc' }]
        : [{ createdAt: 'desc' }]

    const [total, stories] = await prisma.$transaction([
      prisma.storyPost.count({ where }),
      prisma.storyPost.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        select: storyListSelectFields
      })
    ])

    const listPayload = stories.map((story) => {
      const combined =
        combineScenarioFields(story.scenarioStory ?? '', story.scenarioChat ?? '').trim() || story.body
      const bodyPreview = combined.length > 400 ? `${combined.slice(0, 400)}...` : combined
      const { body: _omit, ...rest } = story

      return {
        ...orderStoryObject(addStoryDefaultMetadata(rest)),
        bodyPreview
      }
    })

    response.json({
      data: listPayload,
      meta: {
        page: query.page,
        limit: query.limit,
        total
      }
    })
  } catch (error) {
    next(error)
  }
})

/** Marks rejection notices as read for the author (e.g. after visiting “Your scenarios”). */
storyRoutes.post('/stories/acknowledge-rejections', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const result = await prisma.storyPost.updateMany({
      where: {
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
        updatedCount: result.count
      }
    })
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
      select: storyVisibilitySelectFields
    })

    if (!story) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    const viewer = authUser
      ? {
          userId: authUser.userId,
          role: authUser.role
        }
      : null

    if (
      !canReadStoryWithCharacterAsViewer(
        {
          authorId: story.author.id,
          publicationStatus: story.publicationStatus,
          moderationStatus: story.moderationStatus,
          character: story.character
        },
        viewer
      )
    ) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    const isAuthor = authUser?.userId === story.author.id
    const isAdminViewer = authUser?.role === 'ADMIN'

    if (
      isAuthor &&
      story.publicationStatus === 'PUBLISHED' &&
      story.moderationStatus === 'REJECTED'
    ) {
      await prisma.storyPost.updateMany({
        where: {
          id: story.id,
          authorReadRejectionAt: null
        },
        data: {
          authorReadRejectionAt: new Date()
        }
      })
    }

    const showModerationMeta = Boolean(isAuthor || isAdminViewer)
    const {
      ownerId: _omitCharacterOwnerId,
      status: _omitCharacterStatus,
      visibility: _omitCharacterVisibility,
      defaultStoryId: _omitCharacterDefaultStoryId,
      ...responseCharacter
    } = story.character
    const sanitizedStory = {
      ...story,
      character: responseCharacter,
      isDefault: Boolean(story.character.defaultStoryId && story.character.defaultStoryId === story.id),
      moderationRejectReason:
        showModerationMeta && story.moderationStatus === 'REJECTED' ? story.moderationRejectReason : null
    }
    const combined =
      combineScenarioFields(sanitizedStory.scenarioStory ?? '', sanitizedStory.scenarioChat ?? '').trim() ||
      sanitizedStory.body
    const bodyPreview = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined
    const isPublic =
      sanitizedStory.publicationStatus === 'PUBLISHED' &&
      sanitizedStory.moderationStatus === 'APPROVED'

    const hasLiked = authUser
      ? Boolean(
          await prisma.storyPostLike.findUnique({
            where: { userId_storyId: { userId: authUser.userId, storyId: story.id } },
            select: { id: true }
          })
        )
      : false

    const { characterId: _omitCharacterId, ...storyWithoutCharacterId } = sanitizedStory

    const orderedStory = orderStoryObject(storyWithoutCharacterId)

    response.json({
      data: {
        ...orderedStory,
        public_summary: bodyPreview,
        is_public: isPublic,
        hasLiked
      }
    })
  } catch (error) {
    next(error)
  }
})

storyRoutes.post('/stories', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const rawBody =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {}
    const payload = createStorySchema.parse(toPhase1CreatePayload(rawBody))

    try {
      assertSafeCharacterAssetUrls({
        voiceFileUrl: payload.voiceFileUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        response.status(400).json({
          message: error.message,
          code: error.code,
          field: error.fieldKey
        })
        return
      }
      throw error
    }
    const character = await prisma.character.findUnique({
      where: { id: payload.characterId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        visibility: true,
        isPatreonGated: true
      }
    })

    if (!character) {
      response.status(400).json({ message: 'Character not found.' })
      return
    }

    const characterAccess = await resolveCharacterAccess(
      {
        userId: authUser.userId,
        role: authUser.role,
        isEmailVerified: authUser.isEmailVerified
      },
      character
    )

    if (!characterAccess.canReadCharacter) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    const publicationStatus: 'DRAFT' | 'PUBLISHED' =
      payload.publicationStatus ?? (payload.isPublic === false ? 'DRAFT' : 'PUBLISHED')
    const now = new Date()
    const moderationStatus =
      publicationStatus === 'PUBLISHED' ? ('PENDING' as const) : ('NONE' as const)

    const scenarioStory = payload.scenarioStory.trim()
    const scenarioChat = payload.scenarioChat.trim()
    const body = combineScenarioFields(scenarioStory, scenarioChat)
    const promptDescription = trimOrNull(payload.promptDescription) ?? trimOrNull(scenarioStory)
    const personality = trimOrNull(payload.personality)
    const scenario = trimOrNull(payload.scenario) ?? trimOrNull(scenarioStory)
    const firstMessage = trimOrNull(payload.firstMessage)
    const exampleDialogs = trimOrNull(payload.exampleDialogs)

    await enqueueVoiceFileUrlProviderRegistration(payload.voiceFileUrl)

    const story = await prisma.storyPost.create({
      data: {
        authorId: authUser.userId,
        title: payload.title.trim(),
        promptDescription,
        personality,
        scenario,
        firstMessage,
        exampleDialogs,
        scenarioStory,
        scenarioChat,
        body,
        characterId: payload.characterId,
        scenarioType: payload.scenarioType ?? null,
        voiceFileUrl: payload.voiceFileUrl ?? null,
        voiceFileName: payload.voiceFileName ?? null,
        origin: resolveStoryOriginForAuthor(authUser.role),
        publicationStatus,
        moderationStatus,
        moderationRejectReason: null,
        publishedAt: publicationStatus === 'PUBLISHED' ? now : null
      },
      select: storySelectFields
    })

    if (story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'PENDING') {
      const reviewQueueNotification = {
        kind: 'story_submitted',
        title: 'New story submitted for review',
        body: `${story.title.trim()} — submitted by a creator and awaiting moderation.`,
        href: '/admin/stories'
      }

      void notifyAdminsReviewQueueBestEffort(reviewQueueNotification)
      void emailAdminsReviewQueue(reviewQueueNotification)
    }

    const combined = combineScenarioFields(story.scenarioStory ?? '', story.scenarioChat ?? '').trim() || story.body
    const bodyPreview = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined
    const isPublic = story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'
    const { characterId: _omitCharacterId, ...storyWithoutCharacterId } = story
    const orderedStory = orderStoryObject(addStoryDefaultMetadata(storyWithoutCharacterId))

    response.status(201).json({
      data: {
        ...orderedStory,
        public_summary: bodyPreview,
        is_public: isPublic
      }
    })
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
    const rawBody =
      request.body && typeof request.body === 'object' && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {}
    const payload = updateStorySchema.parse(toPhase1UpdatePayload(rawBody))

    try {
      assertSafeCharacterAssetUrls({
        voiceFileUrl: payload.voiceFileUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        response.status(400).json({
          message: error.message,
          code: error.code,
          field: error.fieldKey
        })
        return
      }
      throw error
    }
    const existing = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: {
        authorId: true,
        title: true,
        promptDescription: true,
        personality: true,
        scenario: true,
        firstMessage: true,
        exampleDialogs: true,
        body: true,
        scenarioStory: true,
        scenarioChat: true,
        characterId: true,
        scenarioType: true,
        publicationStatus: true,
        publishedAt: true,
        moderationStatus: true,
        moderationRejectReason: true,
        voiceFileUrl: true,
        voiceFileName: true
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
    const incomingScenarioStory =
      payload.scenarioStory !== undefined
        ? payload.scenarioStory
        : payload.promptDescription !== undefined
          ? payload.promptDescription
          : undefined
    const incomingScenarioChat =
      payload.scenarioChat !== undefined
        ? payload.scenarioChat
        : payload.scenario !== undefined
          ? payload.scenario
          : undefined
    const mergedStory = (
      incomingScenarioStory !== undefined ? (incomingScenarioStory ?? '') : existing.scenarioStory
    ).trim()
    const mergedChat = (
      incomingScenarioChat !== undefined ? (incomingScenarioChat ?? '') : existing.scenarioChat
    ).trim()
    const nextBody = combineScenarioFields(mergedStory, mergedChat)
    const nextPublication =
      payload.publicationStatus !== undefined
        ? payload.publicationStatus
        : payload.isPublic !== undefined
          ? payload.isPublic
            ? 'PUBLISHED'
            : 'DRAFT'
          : existing.publicationStatus
    const mergedPromptDescription = trimOrNull(
      payload.promptDescription !== undefined
        ? payload.promptDescription
        : incomingScenarioStory !== undefined
          ? incomingScenarioStory
          : existing.promptDescription ?? existing.scenarioStory
    )
    const mergedPersonality =
      payload.personality !== undefined ? trimOrNull(payload.personality) : trimOrNull(existing.personality)
    const mergedScenario = trimOrNull(
      payload.scenario !== undefined
        ? payload.scenario
        : incomingScenarioStory !== undefined
          ? incomingScenarioStory
          : existing.scenario ?? existing.scenarioStory
    )
    const mergedFirstMessage =
      payload.firstMessage !== undefined ? trimOrNull(payload.firstMessage) : trimOrNull(existing.firstMessage)
    const mergedExampleDialogs =
      payload.exampleDialogs !== undefined
        ? trimOrNull(payload.exampleDialogs)
        : trimOrNull(existing.exampleDialogs)

    if (nextPublication === 'PUBLISHED') {
      if (nextTitle.length < 3) {
        response.status(400).json({ message: 'Title must be at least 3 characters to publish.' })
        return
      }
      if (mergedStory.length < 30) {
        response.status(400).json({ message: 'Story setup must be at least 30 characters to publish.' })
        return
      }
    } else {
      if (nextTitle.length < 1) {
        response.status(400).json({ message: 'Title is required.' })
        return
      }
    }

    if (!mergedPromptDescription) {
      response.status(400).json({ message: 'Description is required.' })
      return
    }

    if (!mergedPersonality) {
      response.status(400).json({ message: 'Personality is required.' })
      return
    }

    if (!mergedScenario) {
      response.status(400).json({ message: 'Scenario is required.' })
      return
    }

    if (!mergedFirstMessage) {
      response.status(400).json({ message: 'First message is required.' })
      return
    }

    if (nextBody.length > 20000) {
      response.status(400).json({ message: 'Story and chat combined must be at most 20000 characters.' })
      return
    }

    const mergedCharacterId = existing.characterId
    const mergedScenarioType =
      payload.scenarioType !== undefined ? payload.scenarioType : existing.scenarioType ?? null

    const existingTitleTrim = existing.title.trim()
    const existingStoryTrim = (existing.scenarioStory ?? '').trim()
    const existingChatTrim = (existing.scenarioChat ?? '').trim()
    const existingPromptDescription = trimOrNull(existing.promptDescription) ?? trimOrNull(existing.scenarioStory)
    const existingPersonality = trimOrNull(existing.personality)
    const existingScenario = trimOrNull(existing.scenario) ?? trimOrNull(existing.scenarioChat)
    const existingFirstMessage = trimOrNull(existing.firstMessage)
    const existingExampleDialogs = trimOrNull(existing.exampleDialogs)
    const existingCharacterId = existing.characterId
    const existingScenarioType = existing.scenarioType ?? null
    const existingVoiceFileUrl = existing.voiceFileUrl ?? null
    const existingVoiceFileName = existing.voiceFileName ?? null

    const contentChanged =
      nextTitle !== existingTitleTrim ||
      mergedStory !== existingStoryTrim ||
      mergedChat !== existingChatTrim ||
      mergedPromptDescription !== existingPromptDescription ||
      mergedPersonality !== existingPersonality ||
      mergedScenario !== existingScenario ||
      mergedFirstMessage !== existingFirstMessage ||
      mergedExampleDialogs !== existingExampleDialogs ||
      mergedCharacterId !== existingCharacterId ||
      (mergedScenarioType ?? null) !== existingScenarioType ||
      (payload.voiceFileUrl !== undefined && (payload.voiceFileUrl ?? null) !== existingVoiceFileUrl) ||
      (payload.voiceFileName !== undefined && (payload.voiceFileName ?? null) !== existingVoiceFileName)

    const isOwnStory = existing.authorId === authUser.userId
    const adminEditsForeignStory = authUser.role === 'ADMIN' && !isOwnStory

    const updateData: Record<string, unknown> = {}

    if (payload.title !== undefined) updateData.title = payload.title.trim()
    if (incomingScenarioStory !== undefined) {
      updateData.scenarioStory = mergedStory
    }
    if (incomingScenarioChat !== undefined) {
      updateData.scenarioChat = mergedChat
    }
    if (payload.promptDescription !== undefined || incomingScenarioStory !== undefined) {
      updateData.promptDescription = mergedPromptDescription
    }
    if (payload.scenario !== undefined || incomingScenarioStory !== undefined) {
      updateData.scenario = mergedScenario
    }
    if (incomingScenarioStory !== undefined || incomingScenarioChat !== undefined) {
      updateData.body = nextBody
    }
    if (payload.personality !== undefined) updateData.personality = mergedPersonality
    if (payload.firstMessage !== undefined) updateData.firstMessage = mergedFirstMessage
    if (payload.exampleDialogs !== undefined) updateData.exampleDialogs = mergedExampleDialogs
    if (payload.scenarioType !== undefined) updateData.scenarioType = payload.scenarioType
    if (payload.voiceFileUrl !== undefined) updateData.voiceFileUrl = payload.voiceFileUrl
    if (payload.voiceFileName !== undefined) updateData.voiceFileName = payload.voiceFileName
    const hasPublicationChangeInput = payload.publicationStatus !== undefined || payload.isPublic !== undefined
    if (hasPublicationChangeInput) {
      updateData.publicationStatus = nextPublication
      if (nextPublication === 'PUBLISHED' && !existing.publishedAt) {
        updateData.publishedAt = new Date()
      }
      if (nextPublication === 'PUBLISHED') {
        if (existing.publicationStatus === 'DRAFT' || existing.moderationStatus === 'REJECTED') {
          updateData.moderationStatus = 'PENDING'
          updateData.moderationRejectReason = null
        }
      }
      if (nextPublication === 'DRAFT') {
        updateData.moderationStatus = 'NONE'
        updateData.moderationRejectReason = null
      }
    }

    if (
      isOwnStory &&
      existing.moderationStatus === 'REJECTED' &&
      existing.publicationStatus === 'PUBLISHED' &&
      !hasPublicationChangeInput
    ) {
      if (!contentChanged) {
        response.status(400).json({
          message: 'Change your scenario before submitting for review again.'
        })
        return
      }
      updateData.moderationStatus = 'PENDING'
      updateData.moderationRejectReason = null
    }

    if (
      existing.publicationStatus === 'PUBLISHED' &&
      existing.moderationStatus === 'APPROVED' &&
      isOwnStory &&
      !adminEditsForeignStory &&
      !hasPublicationChangeInput &&
      contentChanged
    ) {
      updateData.moderationStatus = 'PENDING'
      updateData.moderationRejectReason = null
    }

    if (payload.voiceFileUrl !== undefined) {
      await enqueueVoiceFileUrlProviderRegistration(payload.voiceFileUrl)
    }

    const updated = await prisma.storyPost.update({
      where: { id: storyId },
      data: updateData,
      select: storySelectFields
    })

    if (!isPlayableStory(updated)) {
      await clearDefaultIfStoryBecameNonPlayable(updated.id)
    }

    if (
      payload.voiceFileUrl !== undefined &&
      existingVoiceFileUrl &&
      existingVoiceFileUrl !== payload.voiceFileUrl
    ) {
      await tryDeleteTrustedUploadFile(existingVoiceFileUrl)
    }

    if (
      updated.publicationStatus === 'PUBLISHED' &&
      updated.moderationStatus === 'PENDING' &&
      (existing.publicationStatus !== 'PUBLISHED' || existing.moderationStatus !== 'PENDING')
    ) {
      const reviewQueueNotification = {
        kind: 'story_submitted',
        title: 'Story submitted for review',
        body: `${updated.title.trim()} needs admin moderation before it is public.`,
        href: '/admin/stories'
      }

      void notifyAdminsReviewQueueBestEffort(reviewQueueNotification)
      void emailAdminsReviewQueue(reviewQueueNotification)
    }

    const combined = combineScenarioFields(updated.scenarioStory ?? '', updated.scenarioChat ?? '').trim() || updated.body
    const bodyPreview = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined
    const isPublic = updated.publicationStatus === 'PUBLISHED' && updated.moderationStatus === 'APPROVED'
    const { characterId: _omitCharacterId, ...updatedWithoutCharacterId } = updated
    const orderedStory = orderStoryObject(addStoryDefaultMetadata(updatedWithoutCharacterId))

    response.json({
      data: {
        ...orderedStory,
        public_summary: bodyPreview,
        is_public: isPublic
      }
    })
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
      select: {
        authorId: true,
        voiceFileUrl: true,
        _count: {
          select: {
            chatSessions: true,
            pendingTurns: true,
            unityLaunchContexts: true,
            likes: true,
            defaultForCharacters: true
          }
        }
      }
    })

    if (!existing) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (existing.authorId !== authUser.userId && authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'You can only delete your own stories.' })
      return
    }

    if (
      existing._count.defaultForCharacters > 0 ||
      existing._count.chatSessions > 0 ||
      existing._count.pendingTurns > 0 ||
      existing._count.unityLaunchContexts > 0 ||
      existing._count.likes > 0
    ) {
      response.status(409).json({
        message: 'Stories with defaults, likes, sessions, or runtime history cannot be deleted. Unpublish or moderate the story instead.'
      })
      return
    }

    await prisma.storyPost.delete({ where: { id: storyId } })
    await tryDeleteTrustedUploadFile(existing.voiceFileUrl)

    response.json({ message: 'Story deleted.' })
  } catch (error) {
    next(error)
  }
})

storyRoutes.post('/admin/stories/:storyId/moderate', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser || authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'Forbidden.' })
      return
    }

    const { storyId } = storyParamsSchema.parse(request.params)
    const payload = adminModerateStorySchema.parse(request.body)

    const existing = await prisma.storyPost.findUnique({
      where: { id: storyId },
      select: { id: true, publicationStatus: true, moderationStatus: true }
    })

    if (!existing || existing.publicationStatus !== 'PUBLISHED') {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (payload.decision === 'approve') {
      if (existing.moderationStatus !== 'PENDING') {
        response.status(400).json({ message: 'Only a pending story can be approved.' })
        return
      }
      const updated = await prisma.storyPost.update({
        where: { id: storyId },
        data: {
          moderationStatus: 'APPROVED',
          moderationRejectReason: null
        },
        select: storySelectFields
      })

      response.json({ data: updated })
      return
    }

    if (existing.moderationStatus !== 'PENDING' && existing.moderationStatus !== 'APPROVED') {
      response.status(400).json({ message: 'This story cannot be rejected in its current state.' })
      return
    }

    const reason = payload.rejectReason!.trim()

    const updated = await prisma.storyPost.update({
      where: { id: storyId },
      data: {
        moderationStatus: 'REJECTED',
        moderationRejectReason: reason,
        authorReadRejectionAt: null
      },
      select: storySelectFields
    })

    await clearDefaultIfStoryBecameNonPlayable(storyId)

    response.json({ data: updated })
  } catch (error) {
    next(error)
  }
})

storyRoutes.patch('/admin/stories/:storyId/origin', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser || authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'Forbidden.' })
      return
    }

    const { storyId } = storyParamsSchema.parse(request.params)
    const payload = adminSetStoryOriginSchema.parse(request.body)

    const updated = await prisma.storyPost.update({
      where: { id: storyId },
      data: { origin: payload.origin },
      select: storySelectFields
    })

    response.json({ data: addStoryDefaultMetadata(updated) })
  } catch (error) {
    next(error)
  }
})

storyRoutes.put('/admin/characters/:characterId/default-story', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser || authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'Forbidden.' })
      return
    }

    const { characterId } = characterStoriesParamsSchema.parse(request.params)
    const payload = adminSetDefaultStorySchema.parse(request.body)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true }
    })

    if (!character) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    const result = await setCharacterDefaultStory(characterId, payload.storyId)
    if (!result.ok) {
      response.status(result.status).json({ message: result.message })
      return
    }

    response.json({ data: { characterId, defaultStoryId: result.defaultStoryId } })
  } catch (error) {
    next(error)
  }
})

storyRoutes.delete('/admin/characters/:characterId/default-story', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser || authUser.role !== 'ADMIN') {
      response.status(403).json({ message: 'Forbidden.' })
      return
    }

    const { characterId } = characterStoriesParamsSchema.parse(request.params)
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { id: true }
    })

    if (!character) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    await clearCharacterDefaultStory(characterId)
    response.json({ data: { characterId, defaultStoryId: null } })
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
      select: { id: true, authorId: true, publicationStatus: true, moderationStatus: true }
    })

    if (!story) {
      response.status(404).json({ message: 'Story not found.' })
      return
    }

    if (story.publicationStatus !== 'PUBLISHED' || story.moderationStatus !== 'APPROVED') {
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
