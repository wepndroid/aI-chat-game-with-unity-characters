import { CharacterStatus, CharacterVisibility, Prisma, type UserRole } from '@prisma/client'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import sharp from 'sharp'
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
import {
  emailAdminsReviewQueue,
  notifyAdminsReviewQueueBestEffort
} from '../lib/notify-admins-review-queue'
import { prisma } from '../lib/prisma'
import { buildUniqueSlug } from '../lib/slug'
import { combineScenarioFields } from '../lib/combine-scenario-body'
import { storyScenarioTypeSchema } from '../lib/story-scenario-type'
import {
  canCreateCharacter,
  canModerateCharacterStatus,
  resolveCharacterAccess,
  type CharacterAccessActor,
  type ResolvedCharacterAccess
} from '../services/character/character-access-policy'
import {
  buildCharacterListWhereClause,
  buildPopularCharacterListWhereSql
} from '../services/character/character-list-query-policy'
import {
  resolveCharacterListThumbnailContract,
  type CharacterListThumbnailSource
} from '../services/character/character-list-thumbnail-contract'
import {
  resolveCharacterCreatePublication,
  resolveCharacterUpdatePublication,
  type CharacterPublicationPolicyError
} from '../services/character/character-publication-policy'
import { resolveCharacterStoryAvailability } from '../services/character/character-story-availability-service'
import { resolveStoryOriginForAuthor } from '../services/story/story-origin-policy'
import { decodeOffsetCursor, encodeOffsetCursor, sendApiData, sendApiError } from '../lib/api-contract'
import { isGameAccessAllowed } from '../lib/game-access'
import { defaultRuntimeAdminSettings, getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import {
  buildUploadUrl,
  ensureUploadFolder,
  getUploadRelativePathFromUrl,
  normalizeUploadRelativePath,
  resolveUploadPath,
  uploadFolders,
  uploadsRoot
} from '../lib/upload-paths'
import { enqueueUploadedVoiceProviderRegistration } from '../lib/tts-provider-uploaded-voice-alias'
import { postgresJsonbValue, postgresTimestamptzValue } from '../lib/database/postgres-sql'
import { resolveEffectiveMembershipTierForUser } from '../services/membership/membership-tier-service'

const respondCharacterAssetUrlValidationFailure = (
  request: Request,
  response: Response,
  error: CharacterAssetUrlValidationError,
  urls: {
    vroidFileUrl?: string | null
    poseFileUrl?: string | null
    previewImageUrl?: string | null
    voiceFileUrl?: string | null
    thumbnailReferenceImageUrl?: string | null
    cardThumbnailDesktopUrl?: string | null
    cardThumbnailMobileUrl?: string | null
  }
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
        previewImageUrl: urls.previewImageUrl ?? null,
        voiceFileUrl: urls.voiceFileUrl ?? null,
        thumbnailReferenceImageUrl: urls.thumbnailReferenceImageUrl ?? null,
        cardThumbnailDesktopUrl: urls.cardThumbnailDesktopUrl ?? null,
        cardThumbnailMobileUrl: urls.cardThumbnailMobileUrl ?? null
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

const enqueueVoiceFileUrlProviderRegistration = async (voiceFileUrl: string | null | undefined) => {
  const relativePath = getUploadRelativePathFromUrl(voiceFileUrl)
  if (relativePath) {
    await enqueueUploadedVoiceProviderRegistration(relativePath)
  }
}

const splitCharacterRouteKey = (value: string) => {
  const normalized = value.trim()
  const lastDashIndex = normalized.lastIndexOf('-')
  if (lastDashIndex <= 0 || lastDashIndex >= normalized.length - 1) {
    return null
  }

  return {
    idCandidate: normalized.slice(lastDashIndex + 1)
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

const characterPublicationIntentSchema = z.enum(['draft', 'publish'])

const initialCharacterStorySchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    promptDescription: z.string().trim().min(1).max(5000),
    personality: z.string().trim().min(1).max(8000),
    scenario: z.string().trim().min(1).max(8000),
    firstMessage: z.string().trim().min(1).max(50000),
    exampleDialogs: z.string().trim().max(12000).optional(),
    scenarioStory: z.string().trim().min(30).max(8000),
    scenarioChat: z.string().trim().max(12000).optional(),
    scenarioType: storyScenarioTypeSchema.optional(),
    voiceFileUrl: z.string().url().optional(),
    voiceFileName: z.string().trim().max(255).optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    const combined = combineScenarioFields(data.scenarioStory, data.scenarioChat ?? '')
    if (combined.length > 20000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Initial story and chat combined must be at most 20000 characters.',
        path: ['scenarioChat']
      })
    }
  })

const createCharacterSchema = z.object({
  name: z.string().trim().min(2).max(500),
  fullName: z.string().trim().max(500).optional(),
  tagline: z.string().trim().max(1000).optional(),
  description: z.string().trim().max(50000).optional(),
  initialStory: initialCharacterStorySchema,
  vroidFileUrl: z.string().trim().min(1).optional(),
  poseFileUrl: z.string().url().optional(),
  previewImageUrl: z.string().url().optional(),
  voiceFileUrl: z.string().url().optional(),
  voiceFileName: z.string().trim().max(255).optional(),
  thumbnailReferenceImageUrl: z.string().url().optional(),
  cardThumbnailDesktopUrl: z.string().url().optional(),
  cardThumbnailMobileUrl: z.string().url().optional(),
  legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional(),
  legacyTier: z.number().int().min(0).max(9).optional(),
  legacyHeyWaifu: z.number().int().min(0).max(1).optional(),
  isPatreonGated: z.boolean().optional(),
  publicationIntent: characterPublicationIntentSchema.optional(),
  visibility: z.nativeEnum(CharacterVisibility).optional()
}).strict()

const updateCharacterSchema = z
  .object({
    name: z.string().trim().min(2).max(500).optional(),
    fullName: z.string().trim().max(500).nullable().optional(),
    tagline: z.string().trim().max(1000).nullable().optional(),
    description: z.string().trim().max(50000).nullable().optional(),
    vroidFileUrl: z.string().trim().min(1).nullable().optional(),
    poseFileUrl: z.string().url().nullable().optional(),
    previewImageUrl: z.string().url().nullable().optional(),
    voiceFileUrl: z.string().url().nullable().optional(),
    voiceFileName: z.string().trim().max(255).nullable().optional(),
    thumbnailReferenceImageUrl: z.string().url().nullable().optional(),
    cardThumbnailDesktopUrl: z.string().url().nullable().optional(),
    cardThumbnailMobileUrl: z.string().url().nullable().optional(),
    legacyFileHash: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).nullable().optional(),
    legacyTier: z.number().int().min(0).max(9).nullable().optional(),
    legacyHeyWaifu: z.number().int().min(0).max(1).nullable().optional(),
    isPatreonGated: z.boolean().optional(),
    publicationIntent: characterPublicationIntentSchema.optional(),
    visibility: z.nativeEnum(CharacterVisibility).optional()
  })
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'At least one field must be provided.'
  })

const listCharactersQuerySchema = z.object({
  status: z.nativeEnum(CharacterStatus).optional(),
  search: z.string().trim().max(120).optional(),
  /** Unity/legacy alias for roster filters (`official|community|mine`). */
  scope: z.enum(['all', 'official', 'community', 'mine']).optional(),
  galleryScope: z.enum(['all', 'curated', 'community', 'mine']).optional(),
  /** `unity` returns a gameplay-focused roster payload (including explicit `unity_asset` metadata). */
  profile: z.enum(['full', 'unity']).optional().default('full'),
  /** List characters owned by this user (signed-in user may only use their own id; admins may use any). */
  ownerId: z.string().min(1).optional(),
  cursor: z.string().trim().min(1).optional(),
  sort: z.enum(['name', 'hearts', 'messages', 'popular', 'newest']).optional().default('newest'),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  thumbnailSource: z.enum(['card', 'reference']).optional().default('card'),
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

const respondCharacterPublicationPolicyError = (
  response: Response,
  error: CharacterPublicationPolicyError
) => {
  response.status(error.statusCode).json({
    message: error.message,
    code: error.code
  })
}

const canOwnerEditApprovedCharacter = (
  actor: CharacterAccessActor,
  existingCharacter: { ownerId: string; status: CharacterStatus; visibility: CharacterVisibility },
  requestedVisibility: CharacterVisibility
) => {
  return Boolean(
    actor &&
      actor.role !== 'ADMIN' &&
      actor.userId === existingCharacter.ownerId &&
      existingCharacter.status === 'APPROVED' &&
      (existingCharacter.visibility === 'PRIVATE' || requestedVisibility === 'PRIVATE')
  )
}

const signedVrmTokenParamsSchema = z.object({
  token: z.string().min(8)
})

const reviewQueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

const adminThumbnailCharactersQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500)
})

const thumbnailVariantSchema = z.object({
  key: z.enum(['desktop', 'mobile']),
  width: z.coerce.number().int().min(32).max(4096),
  height: z.coerce.number().int().min(32).max(4096),
  fit: z.enum(['cover', 'contain']).optional().default('cover')
})

const generateCharacterThumbnailsSchema = z.object({
  sourceImageUrl: z.string().url().optional(),
  targets: z.array(thumbnailVariantSchema).min(1).max(2)
})

const generateBulkCharacterThumbnailsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  targets: z.array(thumbnailVariantSchema).min(1).max(2)
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
    role: authUser.role,
    isEmailVerified: authUser.isEmailVerified
  }
}

const toCharacterActionAccessResponse = (access: ResolvedCharacterAccess) => ({
  can_start_chat: access.canStartChat,
  start_chat_requires_auth: access.startChatRequiresAuth,
  start_chat_requires_verified_email: access.startChatRequiresVerifiedEmail,
  start_chat_unavailable_reason: access.startChatUnavailableReason,
  can_preview_3d: access.canPreviewModel,
  preview_3d_requires_auth: access.previewModelRequiresAuth,
  preview_3d_requires_verified_email: access.previewModelRequiresVerifiedEmail,
  preview_3d_unavailable_reason: access.previewModelUnavailableReason
})

const resolveActorGameAccess = async (actor: CharacterAccessActor) => {
  if (!actor) {
    return false
  }

  return isGameAccessAllowed(await resolveEffectiveMembershipTierForUser(actor.userId))
}

const vrmSignedUrlSecret = process.env.VRM_SIGNED_URL_SECRET?.trim() || process.env.AUTH_COOKIE_NAME || 'secretwaifu-vrm'
const thumbnailMimeExtensionMap: Record<string, '.jpg' | '.png' | '.webp'> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

const resolveThumbnailExtension = (contentType: string | null) => {
  if (!contentType) {
    return '.png'
  }

  const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return thumbnailMimeExtensionMap[normalized] ?? '.png'
}

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

    if (typeof decoded.f !== 'string') {
      return null
    }

    const uploadRelativePath = normalizeUploadRelativePath(decoded.f)
    if (!uploadRelativePath || !uploadRelativePath.toLowerCase().endsWith('.vrm')) {
      return null
    }

    return {
      c: decoded.c,
      e: decoded.e,
      m: 'self',
      f: uploadRelativePath
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

const loadImageBufferFromUrl = async (rawUrl: string) => {
  const normalizedUrl = rawUrl.trim()

  if (isTrustedSelfHostedAssetUrl(normalizedUrl)) {
    const relativePath = getUploadRelativePathFromUrl(normalizedUrl)
    const absolutePath = resolveUploadPath(relativePath)

    if (!absolutePath) {
      throw new Error('Thumbnail source path is invalid.')
    }

    const fileBuffer = await fs.promises.readFile(absolutePath)
    return {
      buffer: fileBuffer,
      contentType: null
    }
  }

  if (!isSafeExternalUrl(normalizedUrl)) {
    throw new Error('Thumbnail source must be a safe public image URL.')
  }

  const upstreamResponse = await fetch(normalizedUrl)
  if (!upstreamResponse.ok) {
    throw new Error(`Unable to download thumbnail source image (${upstreamResponse.status}).`)
  }

  const upstreamContentType = upstreamResponse.headers.get('content-type')
  if (!upstreamContentType?.toLowerCase().startsWith('image/')) {
    throw new Error('Thumbnail source URL did not return an image.')
  }

  const upstreamBuffer = Buffer.from(await upstreamResponse.arrayBuffer())
  return {
    buffer: upstreamBuffer,
    contentType: upstreamContentType
  }
}

const createThumbnailUploadUrl = (request: Request, relativePath: string) => {
  return buildUploadUrl(buildApiBaseUrl(request), relativePath)
}

const generateThumbnailUrlsForCharacter = async (options: {
  request: Request
  sourceImageUrl: string
  existingDesktopUrl?: string | null
  existingMobileUrl?: string | null
  targets: Array<{
    key: 'desktop' | 'mobile'
    width: number
    height: number
    fit: 'cover' | 'contain'
  }>
}) => {
  try {
    assertSafeCharacterAssetUrls({
      previewImageUrl: options.sourceImageUrl
    })
  } catch (error) {
    if (error instanceof CharacterAssetUrlValidationError) {
      throw new Error(error.message)
    }

    throw error
  }

  const { buffer: sourceImageBuffer, contentType } = await loadImageBufferFromUrl(options.sourceImageUrl)
  const sourceSharp = sharp(sourceImageBuffer, { failOn: 'none' }).rotate()
  const sourceMetadata = await sourceSharp.metadata()
  const outputExtension = resolveThumbnailExtension(contentType)
  const previousUrlsToDelete: string[] = []
  const generatedUrlByKey: Partial<Record<'desktop' | 'mobile', string>> = {}

  for (const target of options.targets) {
    const resizedSource = sourceSharp
      .clone()
      .resize({
        width: target.width,
        height: target.height,
        fit: target.fit,
        position: 'attention'
      })

    const outputBuffer =
      outputExtension === '.jpg'
        ? await resizedSource.jpeg({ quality: 84, mozjpeg: true }).toBuffer()
        : outputExtension === '.webp'
          ? await resizedSource.webp({ quality: 84, effort: 4 }).toBuffer()
          : await resizedSource.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()

    const fileName = `${randomUUID()}-${target.key}${outputExtension}`
    const relativePath = path.join(uploadFolders.thumbnails, fileName)
    await fs.promises.writeFile(path.join(ensureUploadFolder(uploadFolders.thumbnails), fileName), outputBuffer)
    generatedUrlByKey[target.key] = createThumbnailUploadUrl(options.request, relativePath)

    const previousUrl = target.key === 'desktop' ? options.existingDesktopUrl : options.existingMobileUrl
    if (previousUrl) {
      previousUrlsToDelete.push(previousUrl)
    }
  }

  return {
    generatedUrlByKey,
    previousUrlsToDelete,
    sourceImage: {
      width: sourceMetadata.width ?? null,
      height: sourceMetadata.height ?? null
    }
  }
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

const validateCreateCharacterFieldLengths = (
  response: Response,
  payload: z.infer<typeof createCharacterSchema>,
  limits: Awaited<ReturnType<typeof getCharacterFieldLimits>>
) => {
  return validateCharacterFieldLengths(
    response,
    {
      ...payload,
      personality: payload.initialStory.personality,
      scenario: payload.initialStory.scenario,
      exampleDialogs: payload.initialStory.exampleDialogs,
      firstMessage: payload.initialStory.firstMessage
    },
    limits
  )
}

const extractUploadRelativePathFromVrmUrl = (urlValue: string | null) => {
  if (!urlValue || !isTrustedSelfHostedAssetUrl(urlValue)) {
    return null
  }

  const relativePath = getUploadRelativePathFromUrl(urlValue)
  if (!relativePath) {
    return null
  }

  if (!relativePath.toLowerCase().endsWith('.vrm')) {
    return null
  }

  return relativePath
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
  const relativePath = extractUploadRelativePathFromVrmUrl(normalizedUrl)
  const expiresAtMs = Date.now() + vrmSignedUrlTtlSeconds * 1000

  let token: string | null = null
  if (objectStorageKey) {
    token = createSignedVrmToken({
      c: characterId,
      e: expiresAtMs,
      m: 'object',
      k: objectStorageKey
    })
  } else if (relativePath) {
    token = createSignedVrmToken({
      c: characterId,
      f: relativePath,
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

const toUnityModelHash = (legacyFileHash: string | null) => {
  if (!legacyFileHash) {
    return null
  }

  return `sha256:${legacyFileHash.toLowerCase()}`
}

const characterListSelect = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  description: true,
  status: true,
  visibility: true,
  officialListing: true,
  isPatreonGated: true,
  heartsCount: true,
  messageCount: true,
  previewImageUrl: true,
  voiceFileUrl: true,
  voiceFileName: true,
  thumbnailReferenceImageUrl: true,
  cardThumbnailDesktopUrl: true,
  cardThumbnailMobileUrl: true,
  owner: {
    select: {
      id: true,
      username: true,
      role: true
    }
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.CharacterSelect

type CharacterListRow = Prisma.CharacterGetPayload<{ select: typeof characterListSelect }>
type CharacterListSort = z.infer<typeof listCharactersQuerySchema>['sort']

const buildCharacterOrderBy = (sort: CharacterListSort): Prisma.CharacterOrderByWithRelationInput[] => {
  switch (sort) {
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }]
    case 'messages':
      return [{ messageCount: 'desc' }, { heartsCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
    case 'hearts':
      return [{ heartsCount: 'desc' }, { messageCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
    case 'newest':
    case 'popular':
      return [{ createdAt: 'desc' }, { id: 'desc' }]
  }
}

const loadPopularCharacterIdPage = async (
  actor: CharacterAccessActor,
  params: {
    status?: CharacterStatus
    search?: string
    galleryScope?: 'all' | 'curated' | 'community' | 'mine'
    listOwnerId?: string
    adminCuratedAll?: boolean
    adminCommunityAll?: boolean
  },
  offset: number,
  limit: number,
  now = new Date()
) => {
  const recentWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const whereSql = buildPopularCharacterListWhereSql(actor, params)
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c."id" AS "id"
    FROM "Character" AS c
    INNER JOIN "User" AS owner ON owner."id" = c."ownerId"
    LEFT JOIN "CharacterActivityDailyMetric" AS metric
      ON metric."characterId" = c."id"
      AND metric."day" >= ${recentWindowStart}
    ${whereSql}
    GROUP BY c."id"
    ORDER BY
      COALESCE(SUM(metric."messageCount"), 0) DESC,
      c."messageCount" DESC,
      c."heartsCount" DESC,
      c."createdAt" DESC,
      c."id" DESC
    LIMIT ${limit + 1}
    OFFSET ${offset}
  `

  return {
    characterIds: rows.slice(0, limit).map((row) => row.id),
    hasMore: rows.length > limit
  }
}

const loadCharacterRowsByIds = async (characterIds: string[]) => {
  if (characterIds.length === 0) {
    return []
  }

  const characterRows = await prisma.character.findMany({
    where: {
      id: {
        in: characterIds
      }
    },
    select: characterListSelect
  })
  const characterById = new Map(characterRows.map((character) => [character.id, character]))
  return characterIds.map((characterId) => characterById.get(characterId)).filter((character): character is CharacterListRow => Boolean(character))
}

const loadCharacterListPage = async (
  actor: CharacterAccessActor,
  params: {
    whereClause: Prisma.CharacterWhereInput
    status?: CharacterStatus
    search?: string
    galleryScope?: 'all' | 'curated' | 'community' | 'mine'
    listOwnerId?: string
    adminCuratedAll?: boolean
    adminCommunityAll?: boolean
    sort: CharacterListSort
    cursor?: string
    limit: number
  }
) => {
  const offset = decodeOffsetCursor(params.cursor)

  if (params.sort === 'popular') {
    const page = await loadPopularCharacterIdPage(actor, params, offset, params.limit)
    return {
      pageRows: await loadCharacterRowsByIds(page.characterIds),
      nextCursor: page.hasMore ? encodeOffsetCursor(offset + page.characterIds.length) : null
    }
  }

  const characterRows = await prisma.character.findMany({
    where: params.whereClause,
    skip: offset,
    take: params.limit + 1,
    orderBy: buildCharacterOrderBy(params.sort),
    select: characterListSelect
  })
  const pageRows = characterRows.slice(0, params.limit)

  return {
    pageRows,
    nextCursor: characterRows.length > params.limit ? encodeOffsetCursor(offset + pageRows.length) : null
  }
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
    heartsCount: number
    messageCount: number
    previewImageUrl: string | null
    voiceFileUrl: string | null
    voiceFileName: string | null
    thumbnailReferenceImageUrl: string | null
    cardThumbnailDesktopUrl: string | null
    cardThumbnailMobileUrl: string | null
    owner: {
      id: string
      username: string
      role: UserRole
    }
    createdAt: Date
    updatedAt: Date
  }>,
  options?: {
    thumbnailSource?: CharacterListThumbnailSource
  }
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

  return Promise.all(
    characterList.map(async (character) => {
      const thumbnailContract = resolveCharacterListThumbnailContract(
        character,
        options?.thumbnailSource ?? 'card'
      )

      return {
        ...character,
        ...thumbnailContract,
        tierCode: 'free' as const,
        storyCount: storyCountMap.get(character.id) ?? 0,
        defaultStoryId: defaultStoryIdMap.get(character.id) ?? null,
        voiceFileUrl: character.voiceFileUrl,
        voiceFileName: character.voiceFileName
      }
    })
  )
}

const toUnityCharacterRoster = (
  request: Request,
  characterList: Awaited<ReturnType<typeof enrichCharacterList>>,
  unityAssetMetadataByCharacterId: Map<string, { vroidFileUrl: string | null; legacyFileHash: string | null }>,
  actor: CharacterAccessActor,
  canAccessGame: boolean
) => {
  const apiBaseUrl = buildApiBaseUrl(request)
  return characterList.map((character) => {
    const isMine = actor ? actor.userId === character.owner.id : false
    const hasPlayableStory = character.storyCount > 0 && character.defaultStoryId !== null
    const unityAssetMetadata = unityAssetMetadataByCharacterId.get(character.id)
    const access = resolveCharacterAccess(
      actor,
      {
        id: character.id,
        ownerId: character.owner.id,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated
      },
      {
        hasPlayableStory,
        hasModel: Boolean(unityAssetMetadata?.vroidFileUrl),
        canAccessGame
      }
    )
    const accessState =
      character.status !== 'APPROVED' || !hasPlayableStory
        ? 'unavailable'
        : access.canStartChat
          ? 'accessible'
          : access.startChatRequiresAuth || access.startChatRequiresVerifiedEmail
            ? 'verification_required'
            : 'unavailable'
    const sourceType = character.owner.role === 'ADMIN' || character.officialListing ? 'official' : 'community'
    const modelUrl = access.canPreviewModel
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
      source_type: sourceType,
      is_mine: isMine,
      uploader_display_name: character.owner.username,
      access_state: accessState,
      unity_asset: {
        asset_key: character.id,
        model_url: modelUrl,
        model_hash: toUnityModelHash(unityAssetMetadata?.legacyFileHash ?? null),
        model_version: character.updatedAt.toISOString(),
        icon_url: character.thumbnailUrl ?? character.previewImageUrl,
        voice_file_url: character.voiceFileUrl,
        voice_file_name: character.voiceFileName,
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
    const galleryScope = query.galleryScope ?? (query.scope === 'official' ? 'curated' : query.scope ?? 'all')

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

    const { pageRows, nextCursor } = await loadCharacterListPage(actor, {
      whereClause,
      status: query.status,
      search: query.search,
      galleryScope,
      listOwnerId: query.ownerId,
      adminCuratedAll: query.adminCuratedAll !== undefined,
      adminCommunityAll: query.adminCommunityAll !== undefined,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit
    })

    const characterList = await enrichCharacterList(pageRows, {
      thumbnailSource: query.thumbnailSource
    })
    const canAccessGame = query.profile === 'unity' ? await resolveActorGameAccess(actor) : false
    const responseData =
      query.profile === 'unity'
        ? toUnityCharacterRoster(
          request,
          characterList,
          await loadUnityAssetMetadataByCharacterId(pageRows.map((character) => character.id)),
          actor,
          canAccessGame
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

    const { pageRows, nextCursor } = await loadCharacterListPage(actor, {
      whereClause,
      status: query.status,
      search: query.search,
      galleryScope: 'all',
      adminCuratedAll: query.adminCuratedAll !== undefined,
      adminCommunityAll: query.adminCommunityAll !== undefined,
      sort: query.sort,
      cursor: query.cursor,
      limit: query.limit
    })

    const characterList = await enrichCharacterList(pageRows, {
      thumbnailSource: query.thumbnailSource
    })
    const canAccessGame = query.profile === 'unity' ? await resolveActorGameAccess(actor) : false
    const responseData =
      query.profile === 'unity'
        ? toUnityCharacterRoster(
          request,
          characterList,
          await loadUnityAssetMetadataByCharacterId(pageRows.map((character) => character.id)),
          actor,
          canAccessGame
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
        heartsCount: true,
        messageCount: true,
        previewImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true,
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
        voiceFileUrl: true,
        voiceFileName: true,
        thumbnailReferenceImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true,
        legacyFileHash: true,
        legacyTier: true,
        legacyHeyWaifu: true,
        status: true,
        visibility: true,
        isPatreonGated: true,
        heartsCount: true,
        messageCount: true,
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
        }
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const storyAvailability = await resolveCharacterStoryAvailability(character.id)
    const canAccessGame = await resolveActorGameAccess(actor)
    const hasVrmModel = Boolean(character.vroidFileUrl)
    const characterAccess = await resolveCharacterAccess(
      actor,
      {
        id: character.id,
        ownerId: character.ownerId,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated
      },
      {
        hasPlayableStory: storyAvailability.hasPlayableStory,
        hasModel: hasVrmModel,
        canAccessGame
      }
    )

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

    const vroidFileUrlForResponse = characterAccess.canPreviewModel
      ? buildSignedVrmDownloadUrl(request, character.id, character.vroidFileUrl) ?? null
      : null

    response.json({
      data: {
        id: character.id,
        slug: character.slug,
        name: character.name,
        fullName: character.fullName,
        tagline: character.tagline,
        description: character.description,
        vroidFileUrl: vroidFileUrlForResponse,
        hasVrmModel,
        defaultStoryId: storyAvailability.defaultStoryId,
        poseFileUrl: character.poseFileUrl,
        previewImageUrl: character.previewImageUrl,
        voiceFileUrl: character.voiceFileUrl,
        voiceFileName: character.voiceFileName,
        thumbnailReferenceImageUrl: character.thumbnailReferenceImageUrl,
        cardThumbnailDesktopUrl: character.cardThumbnailDesktopUrl,
        cardThumbnailMobileUrl: character.cardThumbnailMobileUrl,
        legacyFileHash: character.legacyFileHash,
        legacyTier: character.legacyTier,
        legacyHeyWaifu: character.legacyHeyWaifu,
        status: character.status,
        visibility: character.visibility,
        isPatreonGated: character.isPatreonGated,
        heartsCount: character.heartsCount,
        messageCount: character.messageCount,
        officialListing: character.officialListing,
        hasHearted,
        owner: character.owner,
        createdAt: character.createdAt,
        updatedAt: character.updatedAt,
        publishedAt: character.publishedAt,
        access: toCharacterActionAccessResponse(characterAccess)
      }
    })
  } catch (error) {
    next(error)
  }
})

/** Returns a short-lived playable VRM URL after applying the same access rules as character detail. */
characterRoutes.get('/characters/:characterId/vrm-signed-url', requireVerifiedEmail, async (request, response, next) => {
  response.setHeader('Cache-Control', 'private, max-age=0, no-store')

  try {
    const authUser = request.authUser

    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
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
        vroidFileUrl: true,
        legacyFileHash: true,
        updatedAt: true
      }
    })

    if (!character) {
      sendApiError(response, 404, 'NOT_FOUND', 'Character not found.')
      return
    }

    const access = await resolveCharacterAccess(actor, character, {
      hasModel: Boolean(character.vroidFileUrl)
    })

    if (!access.canReadCharacter) {
      sendApiError(response, 404, 'NOT_FOUND', 'Character not found.')
      return
    }

    if (!access.canPreviewModel) {
      if (access.previewModelRequiresVerifiedEmail) {
        sendApiError(response, 403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification required.')
        return
      }

      if (access.previewModelUnavailableReason === 'NO_MODEL') {
        sendApiError(response, 404, 'NOT_FOUND', 'No VRM asset is available for this character.')
        return
      }

      sendApiError(response, 403, 'FORBIDDEN', '3D preview is unavailable for this character.')
      return
    }

    if (!character.vroidFileUrl) {
      sendApiError(response, 404, 'NOT_FOUND', 'No VRM asset is available for this character.')
      return
    }

    const signedUrl = buildSignedVrmDownloadUrl(request, character.id, character.vroidFileUrl)
    if (!signedUrl) {
      sendApiError(response, 404, 'NOT_FOUND', 'VRM asset is not available for signed download.')
      return
    }

    sendApiData(response, {
      character_id: character.id,
      model_url: signedUrl,
      expires_at: new Date(Date.now() + vrmSignedUrlTtlSeconds * 1000).toISOString(),
      model_hash: toUnityModelHash(character.legacyFileHash),
      model_version: character.updatedAt.toISOString()
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
      const expectedRelativePath = extractUploadRelativePathFromVrmUrl(character.vroidFileUrl)
      if (!expectedRelativePath || expectedRelativePath !== parsed.f) {
        response.status(403).json({
          message: 'VRM token no longer matches the current asset.'
        })
        return
      }

      const absolutePath = resolveUploadPath(expectedRelativePath)
      if (!absolutePath) {
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

characterRoutes.post('/characters', requireVerifiedEmail, async (request, response, next) => {
  try {
    const payload = createCharacterSchema.parse(request.body)
    const characterFieldLimits = await getCharacterFieldLimits()
    if (!validateCreateCharacterFieldLengths(response, payload, characterFieldLimits)) {
      return
    }
    try {
      assertSafeCharacterAssetUrls({
        vroidFileUrl: payload.vroidFileUrl,
        poseFileUrl: payload.poseFileUrl,
        previewImageUrl: payload.previewImageUrl,
        voiceFileUrl: payload.voiceFileUrl,
        thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl,
        cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl,
        cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl
      })
      assertSafeCharacterAssetUrls({
        voiceFileUrl: payload.initialStory.voiceFileUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        respondCharacterAssetUrlValidationFailure(request, response, error, {
          vroidFileUrl: payload.vroidFileUrl,
          poseFileUrl: payload.poseFileUrl,
          previewImageUrl: payload.previewImageUrl,
          voiceFileUrl: payload.voiceFileUrl,
          thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl,
          cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl,
          cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl
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
    const requestedVisibility = payload.visibility ?? CharacterVisibility.PUBLIC
    const publicationDecision = resolveCharacterCreatePublication({
      actorRole: actor.role,
      visibility: requestedVisibility,
      publicationIntent: payload.publicationIntent,
      now: new Date()
    })

    if (!publicationDecision.ok) {
      respondCharacterPublicationPolicyError(response, publicationDecision)
      return
    }

    const nextStatus = publicationDecision.status
    const publishedAt = publicationDecision.publishedAt
    const reviewQueueNotification =
      nextStatus === 'PENDING' && !isAdmin
        ? {
            kind: 'character_submitted',
            title: 'New VRM submitted for review',
            body: `${payload.name.trim()} — submitted by a creator and awaiting moderation.`,
            href: '/admin/review-queue'
          }
        : null

    await enqueueVoiceFileUrlProviderRegistration(payload.voiceFileUrl)
    await enqueueVoiceFileUrlProviderRegistration(payload.initialStory.voiceFileUrl)

    const createdCharacter = await prisma.$transaction(async (transactionClient) => {
      const now = new Date()
      const initialStory = payload.initialStory
      const storyPublicationStatus = nextStatus === 'DRAFT' ? ('DRAFT' as const) : ('PUBLISHED' as const)
      const storyModerationStatus =
        nextStatus === 'APPROVED'
          ? ('APPROVED' as const)
          : storyPublicationStatus === 'PUBLISHED'
            ? ('PENDING' as const)
            : ('NONE' as const)
      const scenarioStory = initialStory.scenarioStory.trim()
      const scenarioChat = initialStory.scenarioChat?.trim() ?? ''
      const storyPublishedAt = storyPublicationStatus === 'PUBLISHED' ? publishedAt ?? now : null

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
          voiceFileUrl: payload.voiceFileUrl,
          voiceFileName: payload.voiceFileName,
          thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl,
          cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl,
          cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl,
          legacyFileHash: payload.legacyFileHash,
          legacyTier: payload.legacyTier,
          legacyHeyWaifu: payload.legacyHeyWaifu,
          isPatreonGated: payload.isPatreonGated ?? false,
          visibility: requestedVisibility,
          officialListing,
          status: nextStatus,
          publishedAt
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

      const createdStory = await transactionClient.storyPost.create({
        data: {
          authorId: actor.userId,
          characterId: nextCharacter.id,
          title: initialStory.title,
          promptDescription: initialStory.promptDescription,
          personality: initialStory.personality,
          scenario: initialStory.scenario,
          firstMessage: initialStory.firstMessage,
          exampleDialogs: initialStory.exampleDialogs ?? null,
          scenarioStory,
          scenarioChat,
          body: combineScenarioFields(scenarioStory, scenarioChat),
          scenarioType: initialStory.scenarioType ?? null,
          voiceFileUrl: initialStory.voiceFileUrl ?? null,
          voiceFileName: initialStory.voiceFileName ?? null,
          origin: resolveStoryOriginForAuthor(actor.role),
          publicationStatus: storyPublicationStatus,
          moderationStatus: storyModerationStatus,
          moderationRejectReason: null,
          publishedAt: storyPublishedAt
        },
        select: {
          id: true
        }
      })

      if (storyPublicationStatus === 'PUBLISHED' && storyModerationStatus === 'APPROVED') {
        await transactionClient.character.update({
          where: {
            id: nextCharacter.id
          },
          data: {
            defaultStoryId: createdStory.id
          },
          select: {
            id: true
          }
        })
      }

      return nextCharacter
    })

    if (reviewQueueNotification) {
      void notifyAdminsReviewQueueBestEffort(reviewQueueNotification)
      void emailAdminsReviewQueue(reviewQueueNotification)
    }

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
        previewImageUrl: payload.previewImageUrl,
        voiceFileUrl: payload.voiceFileUrl,
        thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl,
        cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl,
        cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl
      })
    } catch (error) {
      if (error instanceof CharacterAssetUrlValidationError) {
        respondCharacterAssetUrlValidationFailure(request, response, error, {
          vroidFileUrl: payload.vroidFileUrl,
          poseFileUrl: payload.poseFileUrl,
          previewImageUrl: payload.previewImageUrl,
          voiceFileUrl: payload.voiceFileUrl,
          thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl,
          cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl,
          cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl
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
        visibility: true,
        publishedAt: true,
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

    const requestedVisibility = payload.visibility ?? existingCharacter.visibility
    const publicationDecision = resolveCharacterUpdatePublication({
      actorRole: actor.role,
      characterOwnerRole: existingCharacter.owner.role,
      existingPublishedAt: existingCharacter.publishedAt,
      publicationIntent: payload.publicationIntent,
      now: new Date()
    })

    if (!publicationDecision.ok) {
      respondCharacterPublicationPolicyError(response, publicationDecision)
      return
    }

    const ownerCanEditApprovedCharacter = canOwnerEditApprovedCharacter(actor, existingCharacter, requestedVisibility)

    // Non-admin creators cannot edit approved shared characters. Private edits stay owner-only, and changing
    // a shared approved character back to private is allowed so creators can safely unpublish their model.
    if (actor.role !== 'ADMIN' && existingCharacter.status === 'APPROVED' && !ownerCanEditApprovedCharacter) {
      response.status(403).json({
        message: 'Approved characters cannot be edited.'
      })
      return
    }

    if (publicationDecision.requiresDefaultStory) {
      const storyAvailability = await resolveCharacterStoryAvailability(existingCharacter.id)
      if (!storyAvailability.hasPlayableStory) {
        response.status(400).json({
          message: 'Character requires at least one approved published story before publication.',
          code: 'DEFAULT_STORY_REQUIRED'
        })
        return
      }
    }

    const shouldApprovePrivateOwnerEdit =
      actor.role !== 'ADMIN' &&
      requestedVisibility === CharacterVisibility.PRIVATE &&
      Object.keys(payload).length > 0
    const shouldResetStatusToPending =
      actor.role !== 'ADMIN' &&
      requestedVisibility !== CharacterVisibility.PRIVATE &&
      (existingCharacter.status === 'REJECTED' || existingCharacter.visibility === CharacterVisibility.PRIVATE) &&
      Object.keys(payload).length > 0

    if (payload.voiceFileUrl !== undefined) {
      await enqueueVoiceFileUrlProviderRegistration(payload.voiceFileUrl)
    }

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
          ...(payload.voiceFileUrl !== undefined ? { voiceFileUrl: payload.voiceFileUrl } : {}),
          ...(payload.voiceFileName !== undefined ? { voiceFileName: payload.voiceFileName } : {}),
          ...(payload.thumbnailReferenceImageUrl !== undefined
            ? { thumbnailReferenceImageUrl: payload.thumbnailReferenceImageUrl }
            : {}),
          ...(payload.cardThumbnailDesktopUrl !== undefined
            ? { cardThumbnailDesktopUrl: payload.cardThumbnailDesktopUrl }
            : {}),
          ...(payload.cardThumbnailMobileUrl !== undefined
            ? { cardThumbnailMobileUrl: payload.cardThumbnailMobileUrl }
            : {}),
          ...(payload.legacyFileHash !== undefined ? { legacyFileHash: payload.legacyFileHash } : {}),
          ...(payload.legacyTier !== undefined ? { legacyTier: payload.legacyTier } : {}),
          ...(payload.legacyHeyWaifu !== undefined ? { legacyHeyWaifu: payload.legacyHeyWaifu } : {}),
          ...(payload.isPatreonGated !== undefined ? { isPatreonGated: payload.isPatreonGated } : {}),
          visibility: requestedVisibility,
          officialListing: existingCharacter.owner.role === 'ADMIN',
          ...(publicationDecision.status !== undefined
            ? {
              status: publicationDecision.status,
              moderationRejectReason: publicationDecision.clearsModerationRejectReason ? null : undefined,
              publishedAt: publicationDecision.publishedAt
            }
            : {}),
          ...(shouldApprovePrivateOwnerEdit
            ? {
              status: 'APPROVED',
              moderationRejectReason: null,
              publishedAt: new Date()
            }
            : {}),
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

      return nextCharacter
    })

    if (
      shouldResetStatusToPending &&
      updatedCharacter.status === 'PENDING' &&
      existingCharacter.owner.role !== 'ADMIN'
    ) {
      const reviewQueueNotification = {
        kind: 'character_resubmitted',
        title: 'VRM resubmitted for review',
        body: `${updatedCharacter.name.trim()} was resubmitted by the creator and needs review.`,
        href: '/admin/review-queue'
      }

      void notifyAdminsReviewQueueBestEffort(reviewQueueNotification)
      void emailAdminsReviewQueue(reviewQueueNotification)
    }

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
      const reviewQueueNotification = {
        kind: 'character_submitted',
        title: 'New VRM submitted for review',
        body: `${updatedCharacter.name.trim()} — submitted for moderation.`,
        href: '/admin/review-queue'
      }

      void notifyAdminsReviewQueueBestEffort(reviewQueueNotification)
      void emailAdminsReviewQueue(reviewQueueNotification)
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
        isPatreonGated: true
      }
    })

    if (!character) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const characterAccess = await resolveCharacterAccess(actor, character)

    if (!characterAccess.canReadCharacter) {
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

    if (payload.status === 'APPROVED') {
      const storyAvailability = await resolveCharacterStoryAvailability(currentCharacter.id)
      if (!storyAvailability.hasPlayableStory) {
        response.status(400).json({
          message: 'Character requires at least one approved published story before approval.',
          code: 'DEFAULT_STORY_REQUIRED'
        })
        return
      }
    }

    const rejectReasonTrimmed = payload.rejectReason?.trim() ?? ''
    const updatedCharacter = await prisma.$transaction(async (transactionClient) => {

      const nextCharacter = await transactionClient.character.update({
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

      return nextCharacter
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

characterRoutes.get('/admin/characters/thumbnail-candidates', requireAdmin, async (request, response, next) => {
  try {
    const query = adminThumbnailCharactersQuerySchema.parse(request.query)
    const normalizedSearch = query.search?.trim()

    const characterList = await prisma.character.findMany({
      where: {
        ...(normalizedSearch
          ? {
            OR: [
              { name: { contains: normalizedSearch } },
              { slug: { contains: normalizedSearch } }
            ]
          }
          : {})
      },
      take: query.limit,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        previewImageUrl: true,
        updatedAt: true
      }
    })

    response.json({ data: characterList })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/admin/characters/:characterId/thumbnails/generate', requireAdmin, async (request, response, next) => {
  try {
    const { characterId } = characterParamsSchema.parse(request.params)
    const payload = generateCharacterThumbnailsSchema.parse(request.body)

    const existingCharacter = await prisma.character.findFirst({
      where: {
        OR: [{ id: characterId }, { slug: characterId }]
      },
      select: {
        id: true,
        name: true,
        previewImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true
      }
    })

    if (!existingCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const sourceImageUrl = payload.sourceImageUrl?.trim() || existingCharacter.previewImageUrl
    if (!sourceImageUrl) {
      response.status(400).json({
        message: 'This character does not have an original preview image to resize.'
      })
      return
    }

    const { generatedUrlByKey, previousUrlsToDelete, sourceImage } = await generateThumbnailUrlsForCharacter({
      request,
      sourceImageUrl,
      existingDesktopUrl: existingCharacter.cardThumbnailDesktopUrl,
      existingMobileUrl: existingCharacter.cardThumbnailMobileUrl,
      targets: payload.targets
    })

    const updatedCharacter = await prisma.character.update({
      where: {
        id: existingCharacter.id
      },
      data: {
        ...(generatedUrlByKey.desktop ? { cardThumbnailDesktopUrl: generatedUrlByKey.desktop } : {}),
        ...(generatedUrlByKey.mobile ? { cardThumbnailMobileUrl: generatedUrlByKey.mobile } : {})
      },
      select: {
        id: true,
        name: true,
        previewImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true
      }
    })

    await Promise.all(previousUrlsToDelete.map((url) => tryDeleteTrustedUploadFile(url)))

    response.json({
      data: {
        ...updatedCharacter,
        sourceImageUrl,
        sourceImage
      }
    })
  } catch (error) {
    next(error)
  }
})

characterRoutes.post('/admin/characters/thumbnails/generate-bulk', requireAdmin, async (request, response, next) => {
  try {
    const payload = generateBulkCharacterThumbnailsSchema.parse(request.body)
    const normalizedSearch = payload.search?.trim()

    const characterList = await prisma.character.findMany({
      where: {
        previewImageUrl: {
          not: null
        },
        ...(normalizedSearch
          ? {
            OR: [
              { name: { contains: normalizedSearch } },
              { slug: { contains: normalizedSearch } }
            ]
          }
          : {})
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        previewImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true
      }
    })

    if (characterList.length === 0) {
      response.json({
        data: {
          totalMatched: 0,
          generatedCount: 0,
          skippedCount: 0,
          failureCount: 0,
          results: []
        }
      })
      return
    }

    const results: Array<{
      id: string
      name: string
      status: 'generated' | 'skipped' | 'failed'
      message?: string
      cardThumbnailDesktopUrl?: string | null
      cardThumbnailMobileUrl?: string | null
    }> = []

    for (const character of characterList) {
      if (!character.previewImageUrl) {
        results.push({
          id: character.id,
          name: character.name,
          status: 'skipped',
          message: 'Character has no original preview image.'
        })
        continue
      }

      try {
        const { generatedUrlByKey, previousUrlsToDelete } = await generateThumbnailUrlsForCharacter({
          request,
          sourceImageUrl: character.previewImageUrl,
          existingDesktopUrl: character.cardThumbnailDesktopUrl,
          existingMobileUrl: character.cardThumbnailMobileUrl,
          targets: payload.targets
        })

        const updatedCharacter = await prisma.character.update({
          where: {
            id: character.id
          },
          data: {
            ...(generatedUrlByKey.desktop ? { cardThumbnailDesktopUrl: generatedUrlByKey.desktop } : {}),
            ...(generatedUrlByKey.mobile ? { cardThumbnailMobileUrl: generatedUrlByKey.mobile } : {})
          },
          select: {
            cardThumbnailDesktopUrl: true,
            cardThumbnailMobileUrl: true
          }
        })

        await Promise.all(previousUrlsToDelete.map((url) => tryDeleteTrustedUploadFile(url)))

        results.push({
          id: character.id,
          name: character.name,
          status: 'generated',
          cardThumbnailDesktopUrl: updatedCharacter.cardThumbnailDesktopUrl,
          cardThumbnailMobileUrl: updatedCharacter.cardThumbnailMobileUrl
        })
      } catch (error) {
        results.push({
          id: character.id,
          name: character.name,
          status: 'failed',
          message: error instanceof Error ? error.message : 'Thumbnail generation failed.'
        })
      }
    }

    response.json({
      data: {
        totalMatched: characterList.length,
        generatedCount: results.filter((item) => item.status === 'generated').length,
        skippedCount: results.filter((item) => item.status === 'skipped').length,
        failureCount: results.filter((item) => item.status === 'failed').length,
        results
      }
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
        previewImageUrl: true,
        voiceFileUrl: true,
        thumbnailReferenceImageUrl: true,
        cardThumbnailDesktopUrl: true,
        cardThumbnailMobileUrl: true
      }
    })

    if (!existingCharacter) {
      response.status(404).json({
        message: 'Character not found.'
      })
      return
    }

    const assetUrlList = [
      existingCharacter.vroidFileUrl,
      existingCharacter.poseFileUrl,
      existingCharacter.previewImageUrl,
      existingCharacter.voiceFileUrl,
      existingCharacter.thumbnailReferenceImageUrl,
      existingCharacter.cardThumbnailDesktopUrl,
      existingCharacter.cardThumbnailMobileUrl
    ]

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
        >`SELECT "characterId", "overall", "issuesCount", "summary", "createdAt"
            FROM "CharacterSystemScanReport"
            WHERE "characterId" IN (${Prisma.join(pendingCharacterIdList)})
            ORDER BY "createdAt" DESC`
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

    await prisma.$executeRaw`INSERT INTO "CharacterSystemScanReport" ("id", "characterId", "overall", "issuesCount", "summary", "reportJson", "createdAt")
      VALUES (${reportId}, ${character.id}, ${payload.overall}, ${payload.issuesCount}, ${payload.summary}, ${postgresJsonbValue(JSON.stringify(payload.report))}, ${postgresTimestamptzValue(createdAt)})`

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
    >`SELECT "id", "overall", "issuesCount", "summary", "reportJson"::text AS "reportJson", "createdAt"
      FROM "CharacterSystemScanReport"
      WHERE "characterId" = ${character.id}
      ORDER BY "createdAt" DESC
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
