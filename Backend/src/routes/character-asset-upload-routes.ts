import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Request } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'
import {
  isObjectStorageConfigured,
  uploadVrmBufferToObjectStorage
} from '../lib/object-storage'
import {
  buildUploadUrl,
  ensureUploadFolder,
  ensureUploadFolders,
  getUploadRelativePathFromAbsolutePath,
  uploadFolders
} from '../lib/upload-paths'
import { enqueueUploadedVoiceProviderRegistration, PROVIDER_UPLOAD_MAX_BYTES } from '../lib/tts-provider-uploaded-voice-alias'

const characterAssetUploadRoutes = Router()

ensureUploadFolders([
  uploadFolders.communityVrms,
  uploadFolders.officialVrms,
  uploadFolders.poses,
  uploadFolders.thumbnails,
  uploadFolders.voiceClips
])

const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a // "JSON" little-endian
const GLB_BINARY_MAGIC = 0x46546c67 // "glTF" little-endian
const VRMA_EXTENSION_NAME = 'VRMC_vrm_animation'
const WAV_HEADER_BYTES = 12

const parseVrmaJsonChunk = async (filePath: string) => {
  const fileBuffer = await fs.promises.readFile(filePath)

  if (fileBuffer.length < GLB_HEADER_BYTES) {
    throw new Error('Pose file is too small to be a valid .vrma file.')
  }

  const magic = fileBuffer.readUInt32LE(0)
  const version = fileBuffer.readUInt32LE(4)
  const totalLength = fileBuffer.readUInt32LE(8)

  if (magic !== GLB_BINARY_MAGIC) {
    throw new Error('Pose file is not a valid glTF binary (.vrma).')
  }

  if (version < 2) {
    throw new Error('Pose file uses an unsupported glTF version.')
  }

  if (totalLength !== fileBuffer.length) {
    throw new Error('Pose file appears truncated or malformed.')
  }

  let offset = GLB_HEADER_BYTES
  while (offset + GLB_CHUNK_HEADER_BYTES <= fileBuffer.length) {
    const chunkLength = fileBuffer.readUInt32LE(offset)
    const chunkType = fileBuffer.readUInt32LE(offset + 4)
    const chunkStart = offset + GLB_CHUNK_HEADER_BYTES
    const chunkEnd = chunkStart + chunkLength

    if (chunkEnd > fileBuffer.length) {
      throw new Error('Pose file chunk data is out of bounds.')
    }

    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      const jsonText = fileBuffer.toString('utf8', chunkStart, chunkEnd).replace(/\u0000+$/g, '')
      try {
        return JSON.parse(jsonText) as {
          extensionsUsed?: unknown
          extensionsRequired?: unknown
          animations?: unknown
        }
      } catch {
        throw new Error('Pose file contains invalid glTF JSON metadata.')
      }
    }

    offset = chunkEnd
  }

  throw new Error('Pose file does not contain a glTF JSON chunk.')
}

const validateVrmaFile = async (filePath: string) => {
  const jsonChunk = await parseVrmaJsonChunk(filePath)
  const extensionsUsed = Array.isArray(jsonChunk.extensionsUsed) ? jsonChunk.extensionsUsed : []
  const extensionsRequired = Array.isArray(jsonChunk.extensionsRequired) ? jsonChunk.extensionsRequired : []
  const animations = Array.isArray(jsonChunk.animations) ? jsonChunk.animations : []

  const hasVrmaExtension =
    extensionsUsed.includes(VRMA_EXTENSION_NAME) || extensionsRequired.includes(VRMA_EXTENSION_NAME)

  if (!hasVrmaExtension) {
    throw new Error('Pose file is missing the VRM animation extension (VRMC_vrm_animation).')
  }

  if (animations.length === 0) {
    throw new Error('Pose file has no animation tracks.')
  }
}

const validateWavFile = async (filePath: string) => {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const header = Buffer.alloc(WAV_HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, WAV_HEADER_BYTES, 0)

    if (bytesRead < WAV_HEADER_BYTES) {
      throw new Error('Voice file is too small to be a valid WAV file.')
    }

    const riff = header.toString('ascii', 0, 4)
    const wave = header.toString('ascii', 8, 12)
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error('Voice upload must be a valid .wav file.')
    }
  } finally {
    await handle.close()
  }
}

const previewExtFromMime = (mime: string) => {
  if (mime === 'image/jpeg') {
    return '.jpg'
  }

  if (mime === 'image/png') {
    return '.png'
  }

  if (mime === 'image/webp') {
    return '.webp'
  }

  if (mime === 'image/gif') {
    return '.gif'
  }

  return ''
}

const storage = multer.diskStorage({
  destination: (request, file, callback) => {
    if (file.fieldname === 'vrm') {
      const targetFolder = request.authUser?.role === 'ADMIN' ? uploadFolders.officialVrms : uploadFolders.communityVrms
      callback(null, ensureUploadFolder(targetFolder))
      return
    }

    if (file.fieldname === 'pose') {
      callback(null, ensureUploadFolder(uploadFolders.poses))
      return
    }

    if (file.fieldname === 'preview') {
      callback(null, ensureUploadFolder(uploadFolders.thumbnails))
      return
    }

    if (file.fieldname === 'voice') {
      callback(null, ensureUploadFolder(uploadFolders.voiceClips))
      return
    }

    callback(new Error('Unexpected field.'), '')
  },
  filename: (_request, file, callback) => {
    const id = randomUUID()

    if (file.fieldname === 'vrm') {
      callback(null, `${id}.vrm`)
      return
    }
    if (file.fieldname === 'pose') {
      callback(null, `${id}.vrma`)
      return
    }

    if (file.fieldname === 'preview') {
      const fromName = path.extname(file.originalname).toLowerCase()
      const fromMime = previewExtFromMime(file.mimetype)
      const ext = fromName && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName) ? fromName : fromMime || '.png'
      const normalizedExt = ext === '.jpeg' ? '.jpg' : ext
      callback(null, `${id}${normalizedExt}`)
      return
    }

    if (file.fieldname === 'voice') {
      callback(null, `${id}.wav`)
      return
    }

    callback(new Error('Unexpected field.'), '')
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (request, file, callback) => {
    if (file.fieldname === 'vrm') {
      if (!file.originalname.toLowerCase().endsWith('.vrm')) {
        callback(new Error('VRM upload must be a .vrm file.'))
        return
      }

      callback(null, true)
      return
    }
    if (file.fieldname === 'pose') {
      if (!file.originalname.toLowerCase().endsWith('.vrma')) {
        callback(new Error('Pose upload must be a .vrma file.'))
        return
      }
      callback(null, true)
      return
    }

    if (file.fieldname === 'preview') {
      if (!file.mimetype.startsWith('image/')) {
        callback(new Error('Preview upload must be an image.'))
        return
      }

      callback(null, true)
      return
    }

    if (file.fieldname === 'voice') {
      if (!file.originalname.toLowerCase().endsWith('.wav')) {
        callback(new Error('Voice upload must be a .wav file.'))
        return
      }
      callback(null, true)
      return
    }

    callback(new Error('Unexpected upload field.'))
  }
})

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

characterAssetUploadRoutes.post(
  '/characters/assets/upload',
  requireAuth,
  requireVerifiedEmail,
  (request, response, next) => {
    upload.fields([
      { name: 'vrm', maxCount: 1 },
      { name: 'pose', maxCount: 1 },
      { name: 'preview', maxCount: 1 },
      { name: 'voice', maxCount: 1 }
    ])(request, response, (error) => {
      if (error) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Upload failed.'
        })
        return
      }

      next()
    })
  },
  async (request, response) => {
    const fileMap = request.files as Record<string, Express.Multer.File[]> | undefined
    const vrmFile = fileMap?.vrm?.[0]
    const poseFile = fileMap?.pose?.[0]
    const previewFile = fileMap?.preview?.[0]
    const voiceFile = fileMap?.voice?.[0]

    if (!vrmFile && !poseFile && !previewFile && !voiceFile) {
      response.status(400).json({
        message: 'Provide a VRM file, pose file, preview image, and/or a voice WAV file.'
      })
      return
    }

    const runtimeSettings = await getRuntimeAdminSettings().catch(() => null)
    const uploadLimits = runtimeSettings?.uploadLimits
    const maxVrmBytes = (uploadLimits?.maxVrmSizeMb ?? 100) * 1024 * 1024
    const maxPreviewBytes = (uploadLimits?.maxPreviewImageSizeMb ?? 10) * 1024 * 1024
    const maxVoiceBytes = PROVIDER_UPLOAD_MAX_BYTES
    const allowedPreviewMimeTypes = uploadLimits?.allowedPreviewMimeTypes ?? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

    if (vrmFile && vrmFile.size > maxVrmBytes) {
      fs.unlink(vrmFile.path, () => {})
      response.status(400).json({
        message: `VRM exceeds max size limit (${uploadLimits?.maxVrmSizeMb ?? 100}MB).`
      })
      return
    }
    if (poseFile && poseFile.size > maxVrmBytes) {
      fs.unlink(poseFile.path, () => {})
      response.status(400).json({
        message: `Pose exceeds max size limit (${uploadLimits?.maxVrmSizeMb ?? 100}MB).`
      })
      return
    }

    if (poseFile) {
      try {
        await validateVrmaFile(poseFile.path)
      } catch (error) {
        fs.unlink(poseFile.path, () => {})
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Pose file failed VRMA validation.'
        })
        return
      }
    }

    if (previewFile && previewFile.size > maxPreviewBytes) {
      fs.unlink(previewFile.path, () => {})
      response.status(400).json({
        message: `Preview image exceeds max size limit (${uploadLimits?.maxPreviewImageSizeMb ?? 10}MB).`
      })
      return
    }

    if (previewFile && !allowedPreviewMimeTypes.includes(previewFile.mimetype)) {
      fs.unlink(previewFile.path, () => {})
      response.status(400).json({
        message: 'Preview image type is not allowed by upload policy.'
      })
      return
    }

    if (voiceFile && voiceFile.size > maxVoiceBytes) {
      fs.unlink(voiceFile.path, () => {})
      response.status(400).json({
        message: 'Voice WAV exceeds max size limit (25MiB).'
      })
      return
    }

    if (voiceFile) {
      try {
        await validateWavFile(voiceFile.path)
      } catch (error) {
        fs.unlink(voiceFile.path, () => {})
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Voice file failed WAV validation.'
        })
        return
      }
    }

    const origin = resolvePublicOrigin(request)
    const data: {
      vroidFileUrl?: string
      poseFileUrl?: string
      previewImageUrl?: string
      voiceFileUrl?: string
      voiceFileName?: string
    } = {}

    if (vrmFile) {
      if (isObjectStorageConfigured()) {
        try {
          const vrmBuffer = await fs.promises.readFile(vrmFile.path)
          const uploadedVrm = await uploadVrmBufferToObjectStorage({
            fileName: vrmFile.filename,
            fileContent: vrmBuffer,
            contentType: vrmFile.mimetype || 'model/gltf-binary'
          })
          data.vroidFileUrl = uploadedVrm.reference
        } finally {
          fs.unlink(vrmFile.path, () => {})
        }
      } else {
        const relativePath = getUploadRelativePathFromAbsolutePath(vrmFile.path)
        if (!relativePath) {
          response.status(500).json({ message: 'Uploaded VRM path is invalid.' })
          return
        }
        data.vroidFileUrl = buildUploadUrl(origin, relativePath)
      }
    }
    if (poseFile) {
      const relativePath = getUploadRelativePathFromAbsolutePath(poseFile.path)
      if (!relativePath) {
        response.status(500).json({ message: 'Uploaded pose path is invalid.' })
        return
      }
      data.poseFileUrl = buildUploadUrl(origin, relativePath)
    }

    if (previewFile) {
      const relativePath = getUploadRelativePathFromAbsolutePath(previewFile.path)
      if (!relativePath) {
        response.status(500).json({ message: 'Uploaded preview path is invalid.' })
        return
      }
      data.previewImageUrl = buildUploadUrl(origin, relativePath)
    }

    if (voiceFile) {
      const relativePath = getUploadRelativePathFromAbsolutePath(voiceFile.path)
      if (!relativePath) {
        response.status(500).json({ message: 'Uploaded voice path is invalid.' })
        return
      }
      data.voiceFileUrl = buildUploadUrl(origin, relativePath)
      data.voiceFileName = voiceFile.originalname.trim() || voiceFile.filename
      try {
        await enqueueUploadedVoiceProviderRegistration(relativePath)
      } catch {
        fs.unlink(voiceFile.path, () => {})
        response.status(500).json({
          message: 'Voice upload could not be prepared for runtime TTS.'
        })
        return
      }
    }

    response.json({ data })
  }
)

export default characterAssetUploadRoutes
