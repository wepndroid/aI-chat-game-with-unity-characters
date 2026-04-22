import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Request } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { prisma } from '../lib/prisma'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { requireAdmin, requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'

const imageGenerationRoutes = Router()
const uploadsRoot = path.join(process.cwd(), 'uploads')

fs.mkdirSync(uploadsRoot, { recursive: true })

const previewGenerationCooldownState = new Map<
  string,
  {
    successTimestamps: number[]
    cooldownUntil: number
  }
>()

const PREVIEW_GENERATION_WINDOW_MS = 12 * 60 * 60 * 1000
const PREVIEW_GENERATION_COOLDOWN_SECONDS = [0, 0, 0, 60, 5 * 60, 15 * 60, 30 * 60]

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname !== 'referenceImage') {
      callback(new Error('Unexpected upload field.'))
      return
    }

    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Reference image must be an image file.'))
      return
    }

    callback(null, true)
  }
})

const previewGenerationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (file.fieldname !== 'characterImage') {
      callback(new Error('Unexpected upload field.'))
      return
    }

    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Character image must be an image file.'))
      return
    }

    callback(null, true)
  }
})

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value !== 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true
    }

    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false
    }
  }

  return value
}, z.boolean())

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined
  }

  return value
}

const optionalNumberField = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(emptyStringToUndefined, schema.optional())

const generationRequestSchema = z.object({
  mode: z.enum(['txt2img', 'img2img', 'pose', 'prompt-pose']),
  prompt: z.string().trim().min(1).max(20000),
  negativePrompt: z.string().trim().max(20000).optional().default(''),
  width: z.coerce.number().int().min(64).max(2048).multipleOf(64),
  height: z.coerce.number().int().min(64).max(2048).multipleOf(64),
  steps: z.coerce.number().int().min(1).max(150),
  cfgScale: z.coerce.number().min(1).max(30),
  seed: z.coerce.number().int().min(-1).max(2147483647),
  denoisingStrength: optionalNumberField(z.coerce.number().min(0).max(1)),
  samplerName: z.string().trim().max(120).optional().default(''),
  batchSize: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(8).optional().default(1)),
  nIter: z.preprocess(emptyStringToUndefined, z.coerce.number().int().min(1).max(8).optional().default(1)),
  resizeMode: optionalNumberField(z.coerce.number().int().min(0).max(3)),
  restoreFaces: booleanLikeSchema.optional().default(false),
  tiling: booleanLikeSchema.optional().default(false),
  controlnetWeight: optionalNumberField(z.coerce.number().min(0).max(1)),
  controlnetModule: z.string().trim().max(120).optional().default(''),
  controlnetModel: z.string().trim().max(160).optional().default(''),
  extraParametersJson: z.string().max(10000).optional().default('')
})

const userPreviewGenerationSchema = z.object({
  characterId: z.string().trim().min(1).max(80).optional()
})

const sanitizeOptionalString = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const buildImageGenerationUrl = (mode: 'txt2img' | 'img2img' | 'pose' | 'prompt-pose') => {
  const configuredBaseUrl = process.env.IMAGE_GENERATION_API_BASE_URL?.trim().replace(/\/+$/, '')
  const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0 ? configuredBaseUrl : 'https://api2.squirclesystem.com/api/sdapi/v1'

  if (mode === 'pose') {
    return `${baseUrl}/txt2img/pose`
  }

  if (mode === 'prompt-pose') {
    return `${baseUrl}/prompt-pose`
  }

  return `${baseUrl}/${mode}`
}

const resolvePublicOrigin = (request: Request) => {
  const configured =
    process.env.PUBLIC_ASSET_BASE_URL?.trim().replace(/\/+$/, '') ||
    process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/+$/, '')

  if (configured) {
    return configured
  }

  const forwardedProto = request.headers['x-forwarded-proto']
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || request.protocol
  const forwardedHost = request.headers['x-forwarded-host']
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.get('host')

  return `${proto}://${host}`
}

const buildPreviewCooldownKey = async (request: Request, rawCharacterId?: string) => {
  const authUser = request.authUser
  if (!authUser) {
    throw new Error('Authentication required.')
  }

  if (!rawCharacterId) {
    return `${authUser.userId}:create`
  }

  const existingCharacter = await prisma.character.findFirst({
    where: {
      OR: [{ id: rawCharacterId }, { slug: rawCharacterId }]
    },
    select: {
      id: true,
      ownerId: true
    }
  })

  if (!existingCharacter) {
    throw new Error('Character not found.')
  }

  if (existingCharacter.ownerId !== authUser.userId && authUser.role !== 'ADMIN') {
    throw new Error('You are not allowed to regenerate this character preview.')
  }

  return `${authUser.userId}:character:${existingCharacter.id}`
}

const getPreviewCooldownSnapshot = (cooldownKey: string, now = Date.now()) => {
  const existingState = previewGenerationCooldownState.get(cooldownKey)
  const successTimestamps = (existingState?.successTimestamps ?? []).filter((timestamp) => now - timestamp < PREVIEW_GENERATION_WINDOW_MS)
  const cooldownUntil = existingState?.cooldownUntil ?? 0

  return {
    successTimestamps,
    cooldownUntil,
    cooldownSecondsRemaining: Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
  }
}

const storePreviewCooldownSnapshot = (cooldownKey: string, successTimestamps: number[], cooldownUntil: number) => {
  previewGenerationCooldownState.set(cooldownKey, {
    successTimestamps,
    cooldownUntil
  })
}

const parseJsonObject = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return {}
  }

  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Extra parameters JSON must be an object.')
  }

  return parsed as Record<string, unknown>
}

const readJsonBody = async (response: Response) => {
  const text = await response.text()

  if (text.trim().length === 0) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return {
      rawText: text
    }
  }
}

const extractUpstreamErrorMessage = (payload: unknown, fallbackMessage: string) => {
  if (!payload || typeof payload !== 'object') {
    return fallbackMessage
  }

  const record = payload as Record<string, unknown>

  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    return record.message
  }

  if (typeof record.error === 'string' && record.error.trim().length > 0) {
    return record.error
  }

  if (record.error && typeof record.error === 'object') {
    const nestedError = record.error as Record<string, unknown>
    if (typeof nestedError.message === 'string' && nestedError.message.trim().length > 0) {
      return nestedError.message
    }
  }

  if (typeof record.rawText === 'string' && record.rawText.trim().length > 0) {
    return record.rawText
  }

  return fallbackMessage
}

imageGenerationRoutes.post(
  '/admin/image-generation/test',
  requireAdmin,
  (request, response, next) => {
    upload.single('referenceImage')(request, response, (error) => {
      if (error) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Upload failed.'
        })
        return
      }

      next()
    })
  },
  async (request, response, next) => {
    try {
      const payload = generationRequestSchema.parse(request.body)
      const referenceImageFile = request.file ?? null

      if ((payload.mode === 'img2img' || payload.mode === 'pose' || payload.mode === 'prompt-pose') && !referenceImageFile) {
        const missingImageMessage =
          payload.mode === 'pose'
            ? 'Pose image is required for pose mode.'
            : payload.mode === 'prompt-pose'
              ? 'Character image is required for prompt-pose mode.'
              : 'Reference image is required for img2img mode.'
        sendApiError(response, 400, 'BAD_REQUEST', missingImageMessage)
        return
      }

      const token = process.env.IMAGE_GENERATION_API_TOKEN?.trim() ?? ''
      if (!token) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'IMAGE_GENERATION_API_TOKEN is not configured.')
        return
      }

      const referenceImageBase64 = referenceImageFile ? referenceImageFile.buffer.toString('base64') : null
      const externalPayload: Record<string, unknown> = {
        ...(parseJsonObject(payload.extraParametersJson) as Record<string, unknown>),
        prompt: payload.prompt,
        negative_prompt: payload.negativePrompt,
        width: payload.width,
        height: payload.height,
        steps: payload.steps,
        cfg_scale: payload.cfgScale,
        seed: payload.seed
      }

      if (payload.mode === 'txt2img') {
        const samplerName = sanitizeOptionalString(payload.samplerName)
        if (samplerName) {
          externalPayload.sampler_name = samplerName
        }

        externalPayload.batch_size = payload.batchSize
        externalPayload.n_iter = payload.nIter
        externalPayload.restore_faces = payload.restoreFaces
        externalPayload.tiling = payload.tiling
      }

      if (payload.mode === 'img2img' && referenceImageBase64) {
        const samplerName = sanitizeOptionalString(payload.samplerName)
        if (samplerName) {
          externalPayload.sampler_name = samplerName
        }

        externalPayload.init_images = [referenceImageBase64]
        externalPayload.denoising_strength = typeof payload.denoisingStrength === 'number' ? payload.denoisingStrength : 0.65
        externalPayload.resize_mode = typeof payload.resizeMode === 'number' ? payload.resizeMode : 0
        externalPayload.restore_faces = payload.restoreFaces
      }

      if (payload.mode === 'pose' && referenceImageBase64) {
        const samplerName = sanitizeOptionalString(payload.samplerName)
        if (samplerName) {
          externalPayload.sampler_name = samplerName
        }

        externalPayload.pose_image = referenceImageBase64
        externalPayload.controlnet_weight = typeof payload.controlnetWeight === 'number' ? payload.controlnetWeight : 1.0
        externalPayload.controlnet_module = sanitizeOptionalString(payload.controlnetModule) ?? 'openpose_full'
        externalPayload.controlnet_model = sanitizeOptionalString(payload.controlnetModel) ?? 'controlnet-openpose-sdxl'
      }

      if (payload.mode === 'prompt-pose' && referenceImageBase64) {
        externalPayload.character_image = referenceImageBase64
        externalPayload.denoising_strength = typeof payload.denoisingStrength === 'number' ? payload.denoisingStrength : 0.75
      }

      const responseParameters: Record<string, unknown> = {
        ...externalPayload
      }

      if (payload.mode === 'img2img' && referenceImageBase64) {
        responseParameters.init_images = ['[reference image supplied]']
      }

      if (payload.mode === 'pose' && referenceImageBase64) {
        responseParameters.pose_image = '[pose image supplied]'
      }

      if (payload.mode === 'prompt-pose' && referenceImageBase64) {
        responseParameters.character_image = '[character image supplied]'
      }

      const upstreamResponse = await fetch(buildImageGenerationUrl(payload.mode), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(externalPayload)
      })

      const upstreamBody = await readJsonBody(upstreamResponse)

      if (!upstreamResponse.ok) {
        sendApiError(
          response,
          502,
          'AI_PROVIDER_FAILURE',
          extractUpstreamErrorMessage(upstreamBody, `Image generation failed with status ${upstreamResponse.status}.`),
          typeof upstreamBody === 'object' && upstreamBody !== null ? (upstreamBody as Record<string, unknown>) : undefined
        )
        return
      }

      const upstreamRecord = upstreamBody && typeof upstreamBody === 'object' ? (upstreamBody as Record<string, unknown>) : {}
      const images = Array.isArray(upstreamRecord.images)
        ? upstreamRecord.images.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : []

      if (images.length === 0) {
        sendApiError(response, 502, 'AI_PROVIDER_FAILURE', 'Image generation completed without returning any images.')
        return
      }

      sendApiData(response, {
        mode: payload.mode,
        imageCount: images.length,
        images,
        firstImageBase64: images[0] ?? null,
        info: upstreamRecord.info ?? null,
        parameters: responseParameters
      })
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendApiError(response, 400, 'BAD_REQUEST', 'Extra parameters JSON must be valid JSON.')
        return
      }

      next(error)
    }
  }
)

imageGenerationRoutes.post(
  '/characters/preview/generate',
  requireAuth,
  requireVerifiedEmail,
  (request, response, next) => {
    previewGenerationUpload.single('characterImage')(request, response, (error) => {
      if (error) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Upload failed.'
        })
        return
      }

      next()
    })
  },
  async (request, response, next) => {
    try {
      const authUser = request.authUser
      if (!authUser) {
        sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
        return
      }

      const payload = userPreviewGenerationSchema.parse(request.body)
      const characterImageFile = request.file ?? null

      if (!characterImageFile) {
        sendApiError(response, 400, 'BAD_REQUEST', 'Character image is required.')
        return
      }

      const token = process.env.IMAGE_GENERATION_API_TOKEN?.trim() ?? ''
      if (!token) {
        sendApiError(response, 500, 'INTERNAL_ERROR', 'IMAGE_GENERATION_API_TOKEN is not configured.')
        return
      }

      const runtimeSettings = await getRuntimeAdminSettings()
      const thumbnailGenerationSettings = runtimeSettings.thumbnailGeneration

      let cooldownKey: string
      try {
        cooldownKey = await buildPreviewCooldownKey(request, payload.characterId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Preview generation is unavailable.'
        const status = message === 'Character not found.' ? 404 : message.includes('not allowed') ? 403 : 400
        sendApiError(response, status, status === 404 ? 'NOT_FOUND' : status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST', message)
        return
      }

      const isCooldownExempt = authUser.role === 'ADMIN'
      const cooldownSnapshot = isCooldownExempt
        ? {
            successTimestamps: [] as number[],
            cooldownUntil: 0,
            cooldownSecondsRemaining: 0
          }
        : getPreviewCooldownSnapshot(cooldownKey)

      if (!isCooldownExempt && cooldownSnapshot.cooldownSecondsRemaining > 0) {
        sendApiError(
          response,
          429,
          'PREVIEW_GENERATION_COOLDOWN',
          `Thumbnail regeneration is cooling down. Please try again in about ${cooldownSnapshot.cooldownSecondsRemaining} second${cooldownSnapshot.cooldownSecondsRemaining === 1 ? '' : 's'}.`
        )
        return
      }

      const externalPayload: Record<string, unknown> = {
        character_image: characterImageFile.buffer.toString('base64'),
        prompt: thumbnailGenerationSettings.prompt,
        negative_prompt: thumbnailGenerationSettings.negativePrompt,
        denoising_strength: thumbnailGenerationSettings.denoisingStrength,
        cfg_scale: thumbnailGenerationSettings.cfgScale,
        steps: thumbnailGenerationSettings.steps,
        width: thumbnailGenerationSettings.width,
        height: thumbnailGenerationSettings.height,
        seed: thumbnailGenerationSettings.seed,
        sampler_name: thumbnailGenerationSettings.samplerName
      }

      const upstreamResponse = await fetch(buildImageGenerationUrl('prompt-pose'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(externalPayload)
      })

      const upstreamBody = await readJsonBody(upstreamResponse)

      if (!upstreamResponse.ok) {
        sendApiError(
          response,
          502,
          'AI_PROVIDER_FAILURE',
          extractUpstreamErrorMessage(upstreamBody, `Image generation failed with status ${upstreamResponse.status}.`),
          typeof upstreamBody === 'object' && upstreamBody !== null ? (upstreamBody as Record<string, unknown>) : undefined
        )
        return
      }

      const upstreamRecord = upstreamBody && typeof upstreamBody === 'object' ? (upstreamBody as Record<string, unknown>) : {}
      const images = Array.isArray(upstreamRecord.images)
        ? upstreamRecord.images.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
        : []
      const debugUpstreamResponse = Object.fromEntries(Object.entries(upstreamRecord).filter(([key]) => key !== 'images'))

      const firstImageBase64 = images[0] ?? null
      if (!firstImageBase64) {
        sendApiError(response, 502, 'AI_PROVIDER_FAILURE', 'Image generation completed without returning any images.')
        return
      }

      const outputBuffer = Buffer.from(firstImageBase64, 'base64')
      const previewFileName = `${randomUUID()}.png`
      const previewPath = path.join(uploadsRoot, previewFileName)
      await fs.promises.writeFile(previewPath, outputBuffer)

      const now = Date.now()
      const nextSuccessTimestamps = isCooldownExempt ? [] : [...cooldownSnapshot.successTimestamps, now]
      const successCount = isCooldownExempt ? 0 : nextSuccessTimestamps.length
      const nextCooldownSeconds = isCooldownExempt
        ? 0
        : (PREVIEW_GENERATION_COOLDOWN_SECONDS[Math.min(successCount - 1, PREVIEW_GENERATION_COOLDOWN_SECONDS.length - 1)] ?? 0)
      const nextCooldownUntil = nextCooldownSeconds > 0 ? now + nextCooldownSeconds * 1000 : 0

      if (!isCooldownExempt) {
        storePreviewCooldownSnapshot(cooldownKey, nextSuccessTimestamps, nextCooldownUntil)
      }

      sendApiData(response, {
        previewImageUrl: `${resolvePublicOrigin(request)}/uploads/${previewFileName}`,
        cooldownSecondsRemaining: nextCooldownSeconds,
        successfulGenerationsInWindow: successCount,
        instantGenerationsRemaining: isCooldownExempt ? Number.MAX_SAFE_INTEGER : Math.max(0, 3 - successCount),
        debug:
          authUser.role === 'ADMIN'
            ? {
                isCooldownExempt,
                requestParameters: {
                  prompt: thumbnailGenerationSettings.prompt,
                  negative_prompt: thumbnailGenerationSettings.negativePrompt,
                  denoising_strength: thumbnailGenerationSettings.denoisingStrength,
                  cfg_scale: thumbnailGenerationSettings.cfgScale,
                  steps: thumbnailGenerationSettings.steps,
                  width: thumbnailGenerationSettings.width,
                  height: thumbnailGenerationSettings.height,
                  seed: thumbnailGenerationSettings.seed,
                  sampler_name: thumbnailGenerationSettings.samplerName,
                  character_image: '[reference image supplied]'
                },
                upstreamStatus: upstreamResponse.status,
                upstreamResponse: debugUpstreamResponse
              }
            : null
      })
    } catch (error) {
      next(error)
    }
  }
)

export default imageGenerationRoutes
