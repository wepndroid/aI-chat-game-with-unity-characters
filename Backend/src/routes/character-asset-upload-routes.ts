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

const characterAssetUploadRoutes = Router()

const uploadsRoot = path.join(process.cwd(), 'uploads')

fs.mkdirSync(uploadsRoot, { recursive: true })

const GLB_HEADER_BYTES = 12
const GLB_CHUNK_HEADER_BYTES = 8
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a // "JSON" little-endian
const GLB_BINARY_MAGIC = 0x46546c67 // "glTF" little-endian
const VRMA_EXTENSION_NAME = 'VRMC_vrm_animation'

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
  destination: (_request, _file, callback) => {
    callback(null, uploadsRoot)
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
      { name: 'preview', maxCount: 1 }
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

    if (!vrmFile && !poseFile && !previewFile) {
      response.status(400).json({
        message: 'Provide a VRM file, pose file, and/or a preview image.'
      })
      return
    }

    const runtimeSettings = await getRuntimeAdminSettings().catch(() => null)
    const uploadLimits = runtimeSettings?.uploadLimits
    const maxVrmBytes = (uploadLimits?.maxVrmSizeMb ?? 100) * 1024 * 1024
    const maxPreviewBytes = (uploadLimits?.maxPreviewImageSizeMb ?? 10) * 1024 * 1024
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

    const origin = resolvePublicOrigin(request)
    const data: { vroidFileUrl?: string; poseFileUrl?: string; previewImageUrl?: string } = {}

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
        data.vroidFileUrl = `${origin}/uploads/${vrmFile.filename}`
      }
    }
    if (poseFile) {
      data.poseFileUrl = `${origin}/uploads/${poseFile.filename}`
    }

    if (previewFile) {
      data.previewImageUrl = `${origin}/uploads/${previewFile.filename}`
    }

    response.json({ data })
  }
)

export default characterAssetUploadRoutes
