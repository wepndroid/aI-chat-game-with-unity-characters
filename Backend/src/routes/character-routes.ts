import { CharacterStatus, Prisma, type CharacterVisibility } from '@prisma/client'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import { z } from 'zod'
import {
  assertSafeCharacterAssetUrls,
  CharacterAssetUrlValidationError,
  isSafeExternalUrl,
  isTrustedSelfHostedAssetUrl,
  normalizeTrustedOrigins
} from '../lib/character-asset-url'
import { tryDeleteTrustedUploadFile } from '../lib/delete-local-upload-file'
import {
  downloadVrmObjectFromStorage,
  parseObjectStorageVrmRef
} from '../lib/object-storage'
import { optionalAuth, requireAdmin, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import { notifyAdminsReviewQueue } from '../lib/notify-admins-review-queue'
import { prisma } from '../lib/prisma'
import { buildUniqueSlug } from '../lib/slug'
import { resolvePersonaFields } from '../lib/character-persona'
import {
  buildCharacterListWhereClause,
  canCreateCharacter,
  canModerateCharacterStatus,
  resolveCharacterAccess,
  type CharacterAccessActor
} from '../services/character-access-service'
import { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError } from '../lib/api-contract'
import { defaultRuntimeAdminSettings, getRuntimeAdminSettings } from '../lib/runtime-admin-settings'

const respondCharacterAssetUrlValidationFailure = (
  request: Request,
  response: Response,
  error: CharacterAssetUrlValidationError,
  urls: { vroidFileUrl?: string | null; poseFileUrl?: string | null; previewImageUrl?: string | null }
) => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[character asset URL validation]', {
      field: error.fieldKey,
      message: error.message,
      code: error.code,
      route: `${request.method} ${request.path}`,
      trustedOrigins: normalizeTrustedOrigins(),
      urls: {
        vroidFileUrl: urls.vroidFileUrl ?? null,
        poseFileUrl: urls.poseFileUrl ?? null,
        previewImageUrl: urls.previewImageUrl ?? null
      }
    })
  }

  response.status(400).json({
    message: error.message,
    code: error.code,
    field: error.fieldKey
  })
}

const characterRoutes = Router()

const splitCharacterRouteKey = (value: string) => {
  const normalized = value.trim()
  const firstDashIndex = normalized.indexOf('-')
  if (firstDashIndex <= 0 || firstDashIndex >= normalized.length - 1) {
    return null
  }

  return {
    idCandidate: normalized.slice(0, firstDashIndex)
  }
}

characterRoutes.param('characterId', async (request: Request, _response: Response, next: NextFunction, value: string) => {
  const routeKeyParts = splitCharacterRouteKey(value)
  if (!routeKeyParts) {
    next()
    return
  }

  try {
    const [exactIdMatch, idCandidateMatch] = await Promise.all([
      prisma.character.findUnique({
        where: { id: value },
        select: { id: true }
      }),
      prisma.character.findUnique({
        where: { id: routeKeyParts.idCandidate },
        select: { id: true }
      })
    ])

    if (!exactIdMatch && idCandidateMatch) {
      request.params.characterId = routeKeyParts.idCandidate
    }

    next()
  } catch (error) {
    next(error)
  }
})

const createCharacterSchema = z.object({
  name: z.string().trim().min(2).max(500),
  fullName: z.string().trim().max(500).optional(),
  tagline: z.string().trim().max(1000).optional(),
  description: z.string().trim().max(50000).optional(),
  personality: z.string().trim().max(50000).optional(),
  scenario: z.string().trim().max(50000).optional(),
  firstMessage: z.string().trim().max(50000).optional(),
  exampleDialogs: z.string().trim().max(50000).optional(),
  vroidFileUrl: z.string().trim().min(1).optional(),
  poseFileUrl: z.string().url().optional(),
  previewImageUrl: z.string().url().optional(),
  legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  legacyTier: z.number().int().min(0).max(9).optional(),
  legacyHeyWaifu: z.number().int().min(0).max(1).optional(),
  isPatreonGated: z.boolean().optional(),
  minimumTierCents: z.number().int().min(0).optional(),
  officialListing: z.boolean().optional(),
  /** Admin only: save as DRAFT instead of publishing. Ignored for non-admin. */
  draft: z.boolean().optional()
})

const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(2).max(500).optional(),
    fullName: z.string().trim().max(500).nullable().optional(),
    tagline: z.string().trim().max(1000).nullable().optional(),
    description: z.string().trim().max(50000).nullable().optional(),
    personality: z.string().trim().max(50000).nullable().optional(),
    scenario: z.string().trim().max(50000).nullable().optional(),
    firstMessage: z.string().trim().max(50000).nullable().optional(),
    exampleDialogs: z.string().trim().max(50000).nullable().optional(),
    vroidFileUrl: z.string().trim().min(1).nullable().optional(),
    poseFileUrl: z.string().url().nullable().optional(),
    previewImageUrl: z.string().url().nullable().optional(),
    legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
    legacyTier: z.number().int().min(0).max(9).nullable().optional(),
    legacyHeyWaifu: z.number().int().min(0).max(1).nullable().optional(),
    isPatreonGated: z.boolean().optional(),
    minimumTierCents: z.number().int().min(0).nullable().optional(),
    officialListing: z.boolean().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const listCharactersQuerySchema = z.object({
  status: z.nativeEnum(CharacterStatus).optional(),
  search: z.string().trim().max(120).optional(),
  galleryScope: z.enum(['all', 'curated', 'community', 'mine']).optional(),
  /** `unity` returns a gameplay-focused roster payload (including explicit `unity_asset` metadata). */
  profile: z.enum(['full', 'unity']).optional().default('full'),
  /** List characters owned by this user (signed-in user may only use their own id; admins may use any). */
  ownerId: z.string().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  sort: z.enum(['name', 'hearts', 'views', 'newest']).optional().default('newest'),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  adminCuratedAll: z.enum(['true', '1']).optional(),
  adminCommunityAll: z.enum(['true', '1']).optional()
})

const updateCharacterStatusSchema = z
  .object({
    status: z.nativeEnum(CharacterStatus),
    rejectReason: z.string().trim().max(2000).optional()
  })
  .superRefine((data, ctx) => {
    if (data.status === 'REJECTED') {
      const reason = data.rejectReason?.trim() ?? ''
      if (reason.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Rejection reason is required (at least 3 characters).',
          path: ['rejectReason']
        })
      }
    }
  })

const characterParamsSchema = z.object({
  characterId: z.string().min(1)
})

const signedVrmTokenParamsSchema = z.object({
  token: z.string().min(8)
})

const chatStartBodySchema = z.object({
  /** Stable anonymous id from the client (e.g. localStorage UUID) so guests only count once per character. */
  visitorKey: z
    .string()
    .trim()
    .max(128)
    .regex(/^[0-9a-fA-F-]{8,128}$/)
    .optional()
})

const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

const systemScanReportSchema = z.object({
  overall: z.enum(['passed', 'flagged']),
  issuesCount: z.coerce.number().int().min(0).max(9999).default(0),
  summary: z.string().trim().min(1).max(240),
  report: z.unknown()
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

const uploadsRoot = path.join(process.cwd(), 'uploads')
const vrmSignedUrlSecret = process.env.VRM_SIGNED_URL_SECRET?.trim() || process.env.AUTH_COOKIE_NAME || 'secretwaifu-vrm'
const parsePositiveInt = (value: string | undefined, fallbackValue: number) => {
  const parsed = Number.parseInt(value ?? '', 10)
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue
  }
  return parsed
}
const vrmSignedUrlTtlSeconds = Math.min(60 * 30, parsePositiveInt(process.env.VRM_SIGNED_URL_TTL_SECONDS, 60))

type VrmSignedTokenPayload = {
  c: string
  e: number
  m: 'self' | 'external' | 'object'
  f?: string
  u?: string
  k?: string
}

const toBase64Url = (value: string) => Buffer.from(value, 'utf8').toString('base64url')
const fromBase64Url = (value: string) => Buffer.from(value, 'base64url').toString('utf8')

const signVrmPayload = (payloadEncoded: string) => {
  return createHmac('sha256', vrmSignedUrlSecret).update(payloadEncoded).digest('base64url')
}

const createSignedVrmToken = (payload: VrmSignedTokenPayload) => {
  const payloadEncoded = toBase64Url(JSON.stringify(payload))
  const signature = signVrmPayload(payloadEncoded)
  return `${payloadEncoded}.${signature}`
}

const parseSignedVrmToken = (token: string): VrmSignedTokenPayload | null => {
  const [payloadEncoded, signature] = token.split('.')

  if (!payloadEncoded || !signature) {
    return null
  }

  const expectedSignature = signVrmPayload(payloadEncoded)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const decoded = JSON.parse(fromBase64Url(payloadEncoded)) as Partial<VrmSignedTokenPayload>
    if (
      typeof decoded.c !== 'string' ||
      typeof decoded.e !== 'number' ||
      !Number.isFinite(decoded.e)
    ) {
      return null
    }

    const mode = decoded.m ?? 'self'

    if (mode === 'external') {
      if (typeof decoded.u !== 'string') {
        return null
      }
      const normalizedUrl = decoded.u.trim()
      if (!isSafeExternalUrl(normalizedUrl)) {
        return null
      }

      const parsed = new URL(normalizedUrl)
      if (!parsed.pathname.toLowerCase().endsWith('.vrm')) {
        return null
      }

      return {
        c: decoded.c,
        e: decoded.e,
        m: 'external',
        u: normalizedUrl
      }
    }

    if (mode === 'object') {
      if (typeof decoded.k !== 'string') {
        return null
      }
      const objectKey = parseObjectStorageVrmRef(`object://vrm/${decoded.k.trim()}`)
      if (!objectKey) {
        return null
      }

      return {
        c: decoded.c,
        e: decoded.e,
        m: 'object',
        k: objectKey
      }
    }

    if (
      typeof decoded.f !== 'string' ||
      !/^[a-zA-Z0-9._-]+$/.test(decoded.f) ||
      !decoded.f.toLowerCase().endsWith('.vrm')
    ) {
      return null
    }

    return {
      c: decoded.c,
      e: decoded.e,
      m: 'self',
      f: decoded.f
    }
  } catch {
    return null
  }
}

const buildApiBaseUrl = (request: Request) => {
  const configured = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (configured) {
    return configured
  }

  const forwardedProto = request.headers['x-forwarded-proto']
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || request.protocol
  const forwardedHost = request.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.get('host')
  return `${proto}://${host}`
}

const getCharacterFieldLimits = async () => {
  const runtimeSettings = await getRuntimeAdminSettings().catch(() => null)
  return runtimeSettings?.characterFieldLimits ?? defaultRuntimeAdminSettings.characterFieldLimits
}

const validateCharacterFieldLengths = (
  response: Response,
  payload: {
    name?: string | null
    fullName?: string | null
    tagline?: string | null
    description?: string | null
    personality?: string | null
    scenario?: string | null
    exampleDialogs?: string | null
    firstMessage?: string | null
  },
  limits: Awaited<ReturnType<typeof getCharacterFieldLimits>>
) => {
  const validations: Array<{ key: keyof typeof payload; label: string; max: number; min?: number }> = [
    { key: 'name', label: 'name', max: limits.nameMaxLength, min: 2 },
    { key: 'fullName', label: 'fullName', max: limits.nameMaxLength },
    { key: 'tagline', label: 'tagline', max: limits.tagLineMaxLength },
    { key: 'description', label: 'description', max: limits.descriptionMaxLength },
    { key: 'personality', label: 'personality', max: limits.personalityMaxLength },
    { key: 'scenario', label: 'scenario', max: limits.scenarioMaxLength },
    { key: 'exampleDialogs', label: 'exampleDialogs', max: limits.exampleDialogsMaxLength },
    { key: 'firstMessage', label: 'firstMessage', max: limits.firstMessageMaxLength }
  ]

  for (const validation of validations) {
    const value = payload[validation.key]
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()

    if (validation.min && trimmed.length > 0 && trimmed.length < validation.min) {
      response.status(400).json({
        message: `${validation.label} must be at least ${validation.min} characters.`,
        field: validation.key
      })
      return false
    }

    if (trimmed.length > validation.max) {
      response.status(400).json({
        message: `${validation.label} exceeds the maximum length (${trimmed.length} / ${validation.max}).`,
        field: validation.key
      })
      return false
    }
  }

  return true
}

const extractUploadFilenameFromVrmUrl = (urlValue: string | null) => {
  if (!urlValue || !isTrustedSelfHostedAssetUrl(urlValue)) {
    return null
  }

  try {
    const parsed = new URL(urlValue)
    const filename = decodeURIComponent(parsed.pathname.split('/').pop() ?? '')

    if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename) || !filename.toLowerCase().endsWith('.vrm')) {
      return null
    }

    return filename
  } catch {
    return null
  }
}

const isSafeExternalVrmUrlForProxy = (urlValue: string) => {
  const normalized = urlValue.trim()
  if (!isSafeExternalUrl(normalized)) {
    return false
  }

  try {
    const parsed = new URL(normalized)
    return parsed.pathname.toLowerCase().endsWith('.vrm')
  } catch {
    return false
  }
}

const buildSignedVrmDownloadUrl = (request: Request, characterId: string, vroidFileUrl: string | null) => {
  if (!vroidFileUrl) {
    return null
  }

  const normalizedUrl = vroidFileUrl.trim()
  const objectStorageKey = parseObjectStorageVrmRef(normalizedUrl)
  const filename = extractUploadFilenameFromVrmUrl(normalizedUrl)
  const expiresAtMs = Date.now() + vrmSignedUrlTtlSeconds * 1000

  let token: string | null = null
  if (objectStorageKey) {
    token = createSignedVrmToken({
      c: characterId,
      e: expiresAtMs,
      m: 'object',
      k: objectStorageKey
    })
  } else if (filename) {
    token = createSignedVrmToken({
      c: characterId,
      f: filename,
      e: expiresAtMs,
      m: 'self'
    })
  } else if (isSafeExternalVrmUrlForProxy(normalizedUrl)) {
    token = createSignedVrmToken({
      c: characterId,
      e: expiresAtMs,
      m: 'external',
      u: normalizedUrl
    })
  }

  if (!token) {
    return null
  }

  const base = buildApiBaseUrl(request)
  return `${base}/api/characters/assets/vrm/${encodeURIComponent(token)}`
}

const resolveUnityTierCode = (character: { isPatreonGated: boolean; minimumTierCents: number | null }) => {
  if (!character.isPatreonGated || !character.minimumTierCents || character.minimumTierCents <= 0) {
    return 'free'
  }

  return `patreon_${character.minimumTierCents}`
}

const toUnityModelHash = (legacyFileHash: string | null) => {
  if (!legacyFileHash) {
    return null
  }

  return `sha256:${legacyFileHash.toLowerCase()}`
}

const enrichCharacterList = async (
  characterList: Array<{
    id: string
    slug: string
    name: string
    tagline: string | null
    description: string | null
    status: CharacterStatus
    visibility: CharacterVisibility
    officialListing: boolean
    isPatreonGated: boolean
    minimumTierCents: number | null
    heartsCount: number
    viewsCount: number
    previewImageUrl: string | null
    owner: {
      id: string
      username: string
    }
    createdAt: Date
    updatedAt: Date
  }>
) => {
  if (characterList.length === 0) {
    return []
  }

  const characterIds = characterList.map((character) => character.id)
  const [storyCountRows, latestStoryRows] = await Promise.all([
    prisma.storyPost.groupBy({
      by: ['characterId'],
      where: {
        characterId: { in: characterIds },
        publicationStatus: 'PUBLISHED',
        moderationStatus: 'APPROVED'
      },
      _count: {
        characterId: true
      }
    }),
    prisma.storyPost.findMany({
      where: {
        characterId: { in: characterIds },
        publicationStatus: 'PUBLISHED',
        moderationStatus: 'APPROVED'
      },
      orderBy: [{ characterId: 'asc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        characterId: true
      }
    })
  ])

  const storyCountMap = new Map<string, number>()
  for (const row of storyCountRows) {
    storyCountMap.set(row.characterId, row._count.characterId)
  }

  const defaultStoryIdMap = new Map<string, string>()
  for (const row of latestStoryRows) {
    if (!defaultStoryIdMap.has(row.characterId)) {
      defaultStoryIdMap.set(row.characterId, row.id)
    }
  }

  return characterList.map((character) => ({
    ...character,
    thumbnailUrl: character.previewImageUrl,
    tierCode: resolveUnityTierCode(character),
    storyCount: storyCountMap.get(character.id) ?? 0,
    defaultStoryId: defaultStoryIdMap.get(character.id) ?? null
  }))
}

const toUnityCharacterRoster = (
  request: Request,
  characterList: Awaited<ReturnType<typeof enrichCharacterList>>,
  unityAssetMetadataByCharacterId: Map<string, { vroidFileUrl: string | null; legacyFileHash: string | null }>
) => {
  const apiBaseUrl = buildApiBaseUrl(request)
  return characterList.map((character) => {
    const unityAssetMetadata = unityAssetMetadataByCharacterId.get(character.id)
    const canExposeInlineModelUrl = character.tierCode === 'free'
    const modelUrl = canExposeInlineModelUrl
      ? buildSignedVrmDownloadUrl(request, character.id, unityAssetMetadata?.vroidFileUrl ?? null)
      : null

    return {
      id: character.id,
      slug: character.slug,
      name: character.name,
      preview_image_url: character.previewImageUrl,
      thumbnail_url: character.thumbnailUrl,
      tier_code: character.tierCode,
      story_count: character.storyCount,
      default_story_id: character.defaultStoryId,
      unity_asset: {
        asset_key: character.id,
        model_url: modelUrl,
        model_hash: toUnityModelHash(unityAssetMetadata?.legacyFileHash ?? null),
        model_version: character.updatedAt.toISOString(),
        icon_url: character.thumbnailUrl ?? character.previewImageUrl,
        signed_model_url_endpoint: `${apiBaseUrl}/api/characters/${encodeURIComponent(character.id)}/vrm-signed-url`
      }
    }
  })
}

const loadUnityAssetMetadataByCharacterId = async (characterIds: string[]) => {
  if (characterIds.length === 0) {
    return new Map<string, { vroidFileUrl: string | null; legacyFileHash: string | null }>()
  }

  const rows = await prisma.character.findMany({
    where: {
      id: { in: characterIds }
    },
    select: {
      id: true,
      vroidFileUrl: true,
      legacyFileHash: true
    }
  })

  return new Map(rows.map((row) => [row.id, { vroidFileUrl: row.vroidFileUrl, legacyFileHash: row.legacyFileHash }]))
}

characterRoutes.get('/characters', optionalAuth, async (request, response, next) => {
  try {
    const query = listCharactersQuerySchema.parse(request.query)
    const actor = toCharacterAccessActor(request)
    const galleryScope = query.galleryScope ?? 'all'

    if (galleryScope === 'mine' && !actor) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    if (query.ownerId) {
      if (!actor) {
        sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
        return
      }

      if (actor.userId !== query.ownerId && actor.role !== 'ADMIN') {
        sendApiError(response, 403, 'FORBIDDEN', 'You can only list your own characters.')
        return
      }
    }

    const whereClause = buildCharacterListWhereClause(actor, {
      status: query.status,
      search: query.search,
      galleryScope,
      listOwnerId: query.ownerId,
      adminCuratedAll: query.adminCuratedAll !== undefined,
      adminCommunityAll: query.adminCommunityAll !== undefined
    })

    const orderBy: Prisma.CharacterOrderByWithRelationInput =
      query.sort === 'name'
        ? { name: 'asc' }
        : query.sort === 'hearts'
          ? { heartsCount: 'desc' }
          : query.sort === 'views'
            ? { viewsCount: 'desc' }
            : { createdAt: 'desc' }

    const offset = decodeOffsetCursor(query.cursor)
    const characterRows = await prisma.character.findMany({
      where: whereClause,
      skip: offset,
      take: query.limit + 1,
      orderBy,
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        description: true,
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

    const pageRows = characterRows.slice(0, query.limit)
    const hasMore = characterRows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null
    const characterList = await enrichCharacterList(pageRows)
    const responseData =
      query.profile === 'unity'
        ? toUnityCharacterRoster(
          request,
          characterList,
          await loadUnityAssetMetadataByCharacterId(pageRows.map((character) => character.id))
        )
        : characterList

    sendApiData(response, responseData, {
      page: {
        nextCursor
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('url')) {
      sendApiError(response, 400, 'BAD_REQUEST', error.message)
      return
    }

    next(error)
  }
})

/** PDF / integration spec: public character catalog alias — same as `GET /characters` with `galleryScope=all`. */
characterRoutes.get('/characters/public', optionalAuth, async (request, response, next) => {
  try {
    const query = listCharactersQuerySchema.parse({
      ...request.query,
      galleryScope: 'all'
    })
    const actor = toCharacterAccessActor(request)

    const whereClause = buildCharacterListWhereClause(actor, {
      status: query.status,
      search: query.search,
      galleryScope: 'all',
      adminCuratedAll: query.adminCuratedAll !== undefined,
      adminCommunityAll: query.adminCommunityAll !== undefined
    })

    const orderBy: Prisma.CharacterOrderByWithRelationInput =
      query.sort === 'name'
        ? { name: 'asc' }
        : query.sort === 'hearts'
          ? { heartsCount: 'desc' }
          : query.sort === 'views'
            ? { viewsCount: 'desc' }
            : { createdAt: 'desc' }

    const offset = decodeOffsetCursor(query.cursor)
    const characterRows = await prisma.character.findMany({
      where: whereClause,
      skip: offset,
      take: query.limit + 1,
      orderBy,
      select: {
        id: true,
        slug: true,
        name: true,
        tagline: true,
        description: true,
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

    const pageRows = characterRows.slice(0, query.limit)
    const hasMore = characterRows.length > query.limit
    const nextCursor = hasMore ? encodeOffsetCursor(offset + pageRows.length) : null
    const characterList = await enrichCharacterList(pageRows)
    const responseData =
      query.profile === 'unity'
        ? toUnityCharacterRoster(
          request,
          characterList,
          await loadUnityAssetMetadataByCharacterId(pageRows.map((character) => character.id))
        )
        : characterList

    sendApiData(response, responseData, {
      page: {
        nextCursor
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('url')) {
      sendApiError(response, 400, 'BAD_REQUEST', error.message)
      return
    }

    next(error)
  }
})

/**
 * Integration / Unity: AI persona fields from CharacterCard (strict Phase-1 source of truth).
 * Same access rules as GET /characters/:characterId for reading.
 */
characterRoutes.get('/character-cards/:characterId', optionalAuth, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const actor = toCharacterAccessActor(request)

    const character = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        slug: true,
        name: true,
        fullName: true,
        tagline: true,
        description: true,
        status: true,
        visibility: true,
        ownerId: true,
        isPatreonGated: true,
        minimumTierCents: true,
        characterCard: {
          select: {
            id: true,
            fullName: true,
            description: true,
            personality: true,
            scenario: true,
            firstMessage: true,
            exampleDialogs: true,
            isPublic: true
          }
        }
      }
    })

    if (!character) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    const persona = resolvePersonaFields(character, character.characterCard)

    const characterAccess = await resolveCharacterAccess(actor, {
      id: character.id,
      ownerId: character.ownerId,
      status: character.status,
      visibility: character.visibility,
      isPatreonGated: character.isPatreonGated,
      minimumTierCents: character.minimumTierCents
    })

    if (!characterAccess.canReadCharacter) {
      response.status(404).json({ message: 'Character not found.' })
      return
    }

    response.json({
      data: {
        characterId: character.id,
        slug: character.slug,
        name: character.name,
        tagline: character.tagline,
        characterCardId: persona.characterCardId,
        characterCardIsPublic: persona.characterCardIsPublic,
        fullName: persona.fullName,
        description: persona.description,
        personality: persona.personality,
        scenario: persona.scenario,
        firstMessage: persona.firstMessage,
        exampleDialogs: persona.exampleDialogs,
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
        moderationRejectReason: true,
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
        vroidFileUrl: true,
        poseFileUrl: true,
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
        characterCard: {
          select: {
            id: true,
            fullName: true,
            description: true,
            personality: true,
            scenario: true,
            firstMessage: true,
            exampleDialogs: true,
            isPublic: true
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

    const persona = resolvePersonaFields(character, character.characterCard)

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

    const vroidFileUrlForResponse =
      characterAccess.canAccessPatreonGatedContent
        ? (buildSignedVrmDownloadUrl(request, character.id, character.vroidFileUrl) ?? null)
        : null

    response.json({
      data: {
        id: character.id,
        slug: character.slug,
        name: character.name,
        fullName: persona.fullName,
        tagline: character.tagline,
        description: persona.description,
        personality: persona.personality,
        scenario: persona.scenario,
        firstMessage: persona.firstMessage,
        exampleDialogs: persona.exampleDialogs,
        characterCardId: persona.characterCardId,
        characterCardIsPublic: persona.characterCardIsPublic,
        vroidFileUrl: vroidFileUrlForResponse,
        poseFileUrl: character.poseFileUrl,
        previewImageUrl: character.previewImageUrl,
        legacyFileHash: character.legacyFileHash,
        legacyTier: character.legacyTier,
        legacyHeyWaifu: character.legacyHeyWaifu,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated,
        minimumTierCents: character.minimumTierCents,
        heartsCount: character.heartsCount,
        viewsCount: character.viewsCount,
        officialListing: character.officialListing,
        hasHearted,
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

/** Count a “chat start” (play demo) — not a page view. Same eligibility as the former GET increment. */
characterRoutes.get('/characters/:characterId/vrm-signed-url', requireAuth, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const { characterId } = characterParamsSchema.parse(request.params)
    const actor = toCharacterAccessActor(request)

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
        minimumTierCents: true,
        vroidFileUrl: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const access = await resolveCharacterAccess(actor, character)

    if (!access.canReadCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (!access.canAccessPatreonGatedContent) {
      response.status(403).json({
        message: 'Your membership tier does not allow this character.'
      })
      return
    }

    if (!character.vroidFileUrl) {
      response.status(404).json({
        message: 'No VRM asset is available for this character.'
      })
      return
    }

    const signedUrl = buildSignedVrmDownloadUrl(request, character.id, character.vroidFileUrl)
    if (!signedUrl) {
      response.status(404).json({
        message: 'VRM asset is not available for signed download.'
      })
      return
    }

    response.json({
      data: {
        characterId: character.id,
        downloadUrl: signedUrl,
        expiresAt: new Date(Date.now() + vrmSignedUrlTtlSeconds * 1000).toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.get('/characters/assets/vrm/:token', async (request, response, next) => {
  try {
    const { token } = signedVrmTokenParamsSchema.parse(request.params)
    const parsed = parseSignedVrmToken(token)

    if (!parsed) {
      response.status(403).json({
        message: 'Invalid VRM download token.'
      })
      return
    }

    if (parsed.e < Date.now()) {
      response.status(403).json({
        message: 'VRM download token has expired.'
      })
      return
    }

    const character = await prisma.character.findUnique({
      where: {
        id: parsed.c
      },
      select: {
        id: true,
        vroidFileUrl: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (parsed.m === 'object') {
      const currentObjectKey = parseObjectStorageVrmRef(character.vroidFileUrl)
      if (!currentObjectKey || parsed.k !== currentObjectKey) {
        response.status(403).json({
          message: 'VRM token no longer matches the current asset.'
        })
        return
      }

      const downloaded = await downloadVrmObjectFromStorage(currentObjectKey)
      response.setHeader('Cache-Control', 'private, max-age=0, no-store')
      response.setHeader('Content-Type', downloaded.contentType || 'model/gltf-binary')
      if (downloaded.contentLength !== null) {
        response.setHeader('Content-Length', String(downloaded.contentLength))
      }
      if (downloaded.eTag) {
        response.setHeader('ETag', downloaded.eTag)
      }

      downloaded.stream.on('error', (streamError) => {
        if (!response.headersSent) {
          response.status(502).json({
            message: 'Failed to stream VRM from object storage.'
          })
          return
        }

        response.destroy(streamError as Error)
      })
      downloaded.stream.pipe(response)
      return
    }

    if (parsed.m === 'self') {
      const expectedFilename = extractUploadFilenameFromVrmUrl(character.vroidFileUrl)
      if (!expectedFilename || expectedFilename !== parsed.f) {
        response.status(403).json({
          message: 'VRM token no longer matches the current asset.'
        })
        return
      }

      const absolutePath = path.join(uploadsRoot, expectedFilename)
      if (!absolutePath.startsWith(uploadsRoot)) {
        response.status(403).json({
          message: 'Invalid asset path.'
        })
        return
      }

      await fs.promises.access(absolutePath, fs.constants.R_OK)
      response.setHeader('Cache-Control', 'private, max-age=0, no-store')
      response.setHeader('Content-Type', 'model/gltf-binary')
      response.sendFile(absolutePath)
      return
    }

    const currentExternalUrl = character.vroidFileUrl?.trim() ?? null
    if (!currentExternalUrl || parsed.u !== currentExternalUrl || !isSafeExternalVrmUrlForProxy(currentExternalUrl)) {
      response.status(403).json({
        message: 'VRM token no longer matches the current asset.'
      })
      return
    }

    const upstreamAbortController = new AbortController()
    const upstreamTimeout = setTimeout(() => upstreamAbortController.abort(), 20_000)
    try {
      const upstreamResponse = await fetch(currentExternalUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: upstreamAbortController.signal
      })

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        response.status(502).json({
          message: 'Failed to fetch VRM from upstream storage.'
        })
        return
      }

      const contentLengthHeader = upstreamResponse.headers.get('content-length')
      const parsedLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : NaN
      if (Number.isFinite(parsedLength) && parsedLength > 150 * 1024 * 1024) {
        response.status(502).json({
          message: 'VRM download is too large.'
        })
        return
      }

      response.setHeader('Cache-Control', 'private, max-age=0, no-store')
      response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'model/gltf-binary')
      if (contentLengthHeader) {
        response.setHeader('Content-Length', contentLengthHeader)
      }

      const stream = Readable.fromWeb(upstreamResponse.body as any)
      stream.on('error', (streamError) => {
        if (!response.headersSent) {
          response.status(502).json({
            message: 'Failed to stream VRM from upstream storage.'
          })
          return
        }

        response.destroy(streamError as Error)
      })
      stream.pipe(response)
      return
    } finally {
      clearTimeout(upstreamTimeout)
    }
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters/:characterId/chat-start', optionalAuth, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const body = chatStartBodySchema.parse(request.body ?? {})
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
        ownerId: true,
        status: true,
        visibility: true,
        isPatreonGated: true,
        minimumTierCents: true,
        viewsCount: true
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

    if (character.status === 'APPROVED') {
      const shouldCountView = !actor || (actor.userId !== character.ownerId && actor.role !== 'ADMIN')

      if (shouldCountView) {
        const dedupeKey =
          actor && actor.userId !== character.ownerId && actor.role !== 'ADMIN'
            ? `u:${actor.userId}`
            : body.visitorKey
              ? `v:${body.visitorKey}`
              : null

        if (dedupeKey) {
          try {
            await prisma.characterChatStartLedger.create({
              data: {
                characterId: character.id,
                dedupeKey
              }
            })

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
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              const fresh = await prisma.character.findUniqueOrThrow({
                where: {
                  id: character.id
                },
                select: {
                  viewsCount: true
                }
              })

              viewsCount = fresh.viewsCount
            } else {
              throw error
            }
          }
        }
      }
    }

    response.json({
      data: {
        viewsCount
      }
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/characters', requireVerifiedEmail, async (request, response, next) => {
  try {
    const payload = createCharacterSchema.parse(request.body)
    const characterFieldLimits = await getCharacterFieldLimits()
    if (!validateCharacterFieldLengths(response, payload, characterFieldLimits)) {
      return
    }
    try {
      assertSafeCharacterAssetUrls({
        vroidFileUrl: payload.vroidFileUrl,
        poseFileUrl: payload.poseFileUrl,
        previewImageUrl: payload.previewImageUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        respondCharacterAssetUrlValidationFailure(request, response, error, {
          vroidFileUrl: payload.vroidFileUrl,
          poseFileUrl: payload.poseFileUrl,
          previewImageUrl: payload.previewImageUrl
        })
        return
      }
      throw error
    }
    const actor = toCharacterAccessActor(request)

    if (!canCreateCharacter(actor) || !actor) {
      response.status(403).json({
        message: 'You are not allowed to create characters.'
      })
      return
    }

    const slugSuffix = Date.now().toString().slice(-6)
    const generatedSlug = buildUniqueSlug(payload.name, slugSuffix)

    // Official / curated listing follows the uploader: only admin accounts (e.g. Upload VRM in admin) are official.
    const officialListing = actor.role === 'ADMIN'
    const isAdmin = actor.role === 'ADMIN'
    const adminSaveAsDraft = isAdmin && payload.draft === true
    const nextStatus = isAdmin ? (adminSaveAsDraft ? 'DRAFT' : 'APPROVED') : 'PENDING'
    const publishedAt = nextStatus === 'APPROVED' ? new Date() : null

    const createdCharacter = await prisma.$transaction(async (transactionClient) => {
      const nextCharacter = await transactionClient.character.create({
        data: {
          slug: generatedSlug,
          ownerId: actor.userId,
          name: payload.name,
          fullName: payload.fullName,
          tagline: payload.tagline,
          description: payload.description,
          vroidFileUrl: payload.vroidFileUrl,
          poseFileUrl: payload.poseFileUrl,
          previewImageUrl: payload.previewImageUrl,
          legacyFileHash: payload.legacyFileHash,
          legacyTier: payload.legacyTier,
          legacyHeyWaifu: payload.legacyHeyWaifu,
          isPatreonGated: payload.isPatreonGated ?? false,
          minimumTierCents: payload.minimumTierCents,
          visibility: 'PUBLIC',
          officialListing,
          status: nextStatus,
          ...(publishedAt ? { publishedAt } : { publishedAt: null })
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

      await transactionClient.characterCard.create({
        data: {
          characterId: nextCharacter.id,
          creatorUserId: actor.userId,
          fullName: payload.fullName ?? null,
          description: payload.description ?? null,
          personality: payload.personality ?? null,
          scenario: payload.scenario ?? null,
          firstMessage: payload.firstMessage ?? null,
          exampleDialogs: payload.exampleDialogs ?? null,
          isPublic: true
        }
      })

      if (nextStatus === 'PENDING' && !isAdmin) {
        await notifyAdminsReviewQueue(transactionClient, {
          kind: 'character_submitted',
          title: 'New VRM submitted for review',
          body: `${payload.name.trim()} — submitted by a creator and awaiting moderation.`,
          href: '/admin/review-queue'
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
    const characterFieldLimits = await getCharacterFieldLimits()
    if (!validateCharacterFieldLengths(response, payload, characterFieldLimits)) {
      return
    }
    try {
      assertSafeCharacterAssetUrls({
        vroidFileUrl: payload.vroidFileUrl,
        poseFileUrl: payload.poseFileUrl,
        previewImageUrl: payload.previewImageUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        respondCharacterAssetUrlValidationFailure(request, response, error, {
          vroidFileUrl: payload.vroidFileUrl,
          poseFileUrl: payload.poseFileUrl,
          previewImageUrl: payload.previewImageUrl
        })
        return
      }
      throw error
    }

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
        status: true,
        owner: {
          select: {
            role: true
          }
        }
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

    // Non-admin creators cannot edit approved characters (metadata is locked once approved).
    if (actor.role !== 'ADMIN' && existingCharacter.status === 'APPROVED') {
      response.status(403).json({
        message: 'Approved characters cannot be edited.'
      })
      return
    }

    const shouldResetStatusToPending =
      actor.role !== 'ADMIN' &&
      existingCharacter.status === 'REJECTED' &&
      Object.keys(payload).length > 0

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
          ...(payload.vroidFileUrl !== undefined ? { vroidFileUrl: payload.vroidFileUrl } : {}),
          ...(payload.poseFileUrl !== undefined ? { poseFileUrl: payload.poseFileUrl } : {}),
          ...(payload.previewImageUrl !== undefined ? { previewImageUrl: payload.previewImageUrl } : {}),
          ...(payload.legacyFileHash !== undefined ? { legacyFileHash: payload.legacyFileHash } : {}),
          ...(payload.legacyTier !== undefined ? { legacyTier: payload.legacyTier } : {}),
          ...(payload.legacyHeyWaifu !== undefined ? { legacyHeyWaifu: payload.legacyHeyWaifu } : {}),
          ...(payload.isPatreonGated !== undefined ? { isPatreonGated: payload.isPatreonGated } : {}),
          ...(payload.minimumTierCents !== undefined ? { minimumTierCents: payload.minimumTierCents } : {}),
          visibility: 'PUBLIC',
          officialListing: existingCharacter.owner.role === 'ADMIN',
          ...(shouldResetStatusToPending
            ? {
              status: 'PENDING',
              moderationRejectReason: null,
              publishedAt: null
            }
            : {})
        },
        select: {
          id: true,
          slug: true,
          name: true,
          fullName: true,
          description: true,
          status: true,
          visibility: true,
          updatedAt: true
        }
      })

      await transactionClient.characterCard.upsert({
        where: {
          characterId: nextCharacter.id
        },
        create: {
          characterId: nextCharacter.id,
          creatorUserId: existingCharacter.ownerId,
          fullName: nextCharacter.fullName,
          description: nextCharacter.description,
          personality: payload.personality ?? null,
          scenario: payload.scenario ?? null,
          firstMessage: payload.firstMessage ?? null,
          exampleDialogs: payload.exampleDialogs ?? null,
          isPublic: true
        },
        update: {
          ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
          ...(payload.description !== undefined ? { description: payload.description } : {}),
          ...(payload.personality !== undefined ? { personality: payload.personality } : {}),
          ...(payload.scenario !== undefined ? { scenario: payload.scenario } : {}),
          ...(payload.firstMessage !== undefined ? { firstMessage: payload.firstMessage } : {}),
          ...(payload.exampleDialogs !== undefined ? { exampleDialogs: payload.exampleDialogs } : {}),
          isPublic: true
        }
      })

      if (
        shouldResetStatusToPending &&
        nextCharacter.status === 'PENDING' &&
        existingCharacter.owner.role !== 'ADMIN'
      ) {
        await notifyAdminsReviewQueue(transactionClient, {
          kind: 'character_resubmitted',
          title: 'VRM resubmitted for review',
          body: `${nextCharacter.name.trim()} was resubmitted by the creator and needs review.`,
          href: '/admin/review-queue'
        })
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
        status: true,
        owner: {
          select: {
            role: true
          }
        }
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
        moderationRejectReason: null,
        publishedAt: null
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        updatedAt: true
      }
    })

    if (existingCharacter.owner.role !== 'ADMIN') {
      await notifyAdminsReviewQueue(prisma, {
        kind: 'character_submitted',
        title: 'New VRM submitted for review',
        body: `${updatedCharacter.name.trim()} — submitted for moderation.`,
        href: '/admin/review-queue'
      })
    }

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

    const currentCharacter = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        publishedAt: true,
        ownerId: true,
        name: true,
        slug: true
      }
    })

    if (!currentCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const rejectReasonTrimmed = payload.rejectReason?.trim() ?? ''
    const updatedCharacter = await prisma.character.update({
      where: {
        id: currentCharacter.id
      },
      data: {
        status: payload.status,
        moderationRejectReason: payload.status === 'REJECTED' ? rejectReasonTrimmed : null,
        ...(payload.status === 'APPROVED'
          ? {
            publishedAt: currentCharacter.publishedAt ?? new Date()
          }
          : {
            publishedAt: null
          })
      },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        visibility: true,
        publishedAt: true,
        updatedAt: true,
        moderationRejectReason: true
      }
    })

    if (payload.status === 'APPROVED') {
      await prisma.userNotification.create({
        data: {
          userId: currentCharacter.ownerId,
          kind: 'character_approved',
          title: 'Character approved',
          body: `"${updatedCharacter.name}" is now live.`,
          href: `/characters/${updatedCharacter.slug}`
        }
      })
    } else if (payload.status === 'REJECTED') {
      await prisma.userNotification.create({
        data: {
          userId: currentCharacter.ownerId,
          kind: 'character_rejected',
          title: 'Character not approved',
          body:
            rejectReasonTrimmed.length > 0
              ? rejectReasonTrimmed
              : `"${updatedCharacter.name}" was not approved. You can revise and resubmit.`,
          href: `/characters/${updatedCharacter.slug}`
        }
      })
    }

    response.json({
      data: updatedCharacter
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.delete('/characters/:characterId', requireAdmin, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)

    const existingCharacter = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        vroidFileUrl: true,
        poseFileUrl: true,
        previewImageUrl: true
      }
    })

    if (!existingCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const assetUrlList = [existingCharacter.vroidFileUrl, existingCharacter.poseFileUrl, existingCharacter.previewImageUrl]

    await prisma.character.delete({
      where: {
        id: existingCharacter.id
      }
    })

    await Promise.all(assetUrlList.map((assetUrl) => tryDeleteTrustedUploadFile(assetUrl)))

    response.json({
      data: {
        deleted: true,
        id: existingCharacter.id
      }
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
        status: 'PENDING',
        owner: {
          role: {
            not: 'ADMIN'
          }
        }
      },
      take: query.limit,
      orderBy: {
        updatedAt: 'desc'
      },
      select: {
        id: true,
        slug: true,
        name: true,
        vroidFileUrl: true,
        poseFileUrl: true,
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

    const pendingCharacterIdList = pendingCharacterList.map((character) => character.id)
    const scanRows =
      pendingCharacterIdList.length > 0
        ? await prisma.$queryRaw<
          Array<{
            characterId: string
            overall: string
            issuesCount: number
            summary: string
            createdAt: string | Date
          }>
        >`SELECT characterId, overall, issuesCount, summary, createdAt
            FROM CharacterSystemScanReport
            WHERE characterId IN (${Prisma.join(pendingCharacterIdList)})
            ORDER BY datetime(createdAt) DESC`
        : []

    const latestScanByCharacterId = new Map<string, (typeof scanRows)[number]>()
    for (const row of scanRows) {
      if (!latestScanByCharacterId.has(row.characterId)) {
        latestScanByCharacterId.set(row.characterId, row)
      }
    }

    response.json({
      data: pendingCharacterList.map((character) => ({
        ...character,
        vroidFileUrl: buildSignedVrmDownloadUrl(request, character.id, character.vroidFileUrl),
        systemScanSummary: latestScanByCharacterId.get(character.id)
          ? {
            overall: latestScanByCharacterId.get(character.id)!.overall,
            issuesCount: latestScanByCharacterId.get(character.id)!.issuesCount,
            summary: latestScanByCharacterId.get(character.id)!.summary,
            createdAt:
              typeof latestScanByCharacterId.get(character.id)!.createdAt === 'string'
                ? latestScanByCharacterId.get(character.id)!.createdAt
                : (latestScanByCharacterId.get(character.id)!.createdAt as Date).toISOString()
          }
          : null
      }))
    })
  } catch (error) {
    next(error)
  }
})

/** Accept a system scan report (Unity/WebGL -> postMessage -> web -> backend). */
characterRoutes.post('/characters/:characterId/system-scan-report', requireAuth, async (request, response, next) => {
  try {
    const actor = toCharacterAccessActor(request)
    const { characterId } = characterParamsSchema.parse(request.params)

    if (!actor) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const payload = systemScanReportSchema.parse(request.body)

    const character = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        ownerId: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    if (actor.role !== 'ADMIN' && character.ownerId !== actor.userId) {
      response.status(403).json({
        message: 'You are not allowed to submit scan reports for this character.'
      })
      return
    }

    const reportId = randomUUID()
    const createdAt = new Date()

    await prisma.$executeRaw`INSERT INTO CharacterSystemScanReport (id, characterId, overall, issuesCount, summary, reportJson, createdAt)
      VALUES (${reportId}, ${character.id}, ${payload.overall}, ${payload.issuesCount}, ${payload.summary}, ${JSON.stringify(payload.report)}, ${createdAt.toISOString()})`

    response.status(201).json({
      data: {
        id: reportId,
        overall: payload.overall,
        issuesCount: payload.issuesCount,
        summary: payload.summary,
        createdAt: createdAt.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

/** Admin: fetch the latest scan report for a character (used by Review Queue detail modal). */
characterRoutes.get('/admin/characters/:characterId/system-scan-report', requireAdmin, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)

    const character = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const latestRows = await prisma.$queryRaw<
      Array<{
        id: string
        overall: string
        issuesCount: number
        summary: string
        reportJson: string
        createdAt: string
      }>
    >`SELECT id, overall, issuesCount, summary, reportJson, createdAt
      FROM CharacterSystemScanReport
      WHERE characterId = ${character.id}
      ORDER BY datetime(createdAt) DESC
      LIMIT 1`

    const latest = latestRows[0] ?? null

    response.json({
      data: latest
        ? {
          ...latest,
          reportJson: (() => {
            try {
              return JSON.parse(latest.reportJson)
            } catch {
              return latest.reportJson
            }
          })()
        }
        : null
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/admin/me/official-vrms-seen', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const seenAt = new Date()

    await prisma.user.update({
      where: {
        id: authUser.userId
      },
      data: {
        officialVrmsListSeenAt: seenAt
      }
    })

    response.json({
      data: {
        officialVrmsListSeenAt: seenAt.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/admin/me/community-vrms-seen', requireAdmin, async (request, response, next) => {
  try {
    const authUser = request.authUser

    if (!authUser) {
      response.status(401).json({
        message: 'Authentication required.'
      })
      return
    }

    const seenAt = new Date()

    await prisma.user.update({
      where: {
        id: authUser.userId
      },
      data: {
        communityVrmsListSeenAt: seenAt
      }
    })

    response.json({
      data: {
        communityVrmsListSeenAt: seenAt.toISOString()
      }
    })
  } catch (error) {
    next(error)
  }
})

export default characterRoutes
