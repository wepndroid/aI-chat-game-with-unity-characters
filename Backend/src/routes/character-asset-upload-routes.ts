import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Request } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { getRuntimeAdminSettings } from '../lib/runtime-admin-settings'
import { requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'

const characterAssetUploadRoutes = Router()

const uploadsRoot = path.join(process.cwd(), 'uploads')

fs.mkdirSync(uploadsRoot, { recursive: true })

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
    const previewFile = fileMap?.preview?.[0]

    if (!vrmFile && !previewFile) {
      response.status(400).json({
        message: 'Provide a VRM file and/or a preview image.'
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
    const data: { vroidFileUrl?: string; previewImageUrl?: string } = {}

    if (vrmFile) {
      data.vroidFileUrl = `${origin}/uploads/${vrmFile.filename}`
    }

    if (previewFile) {
      data.previewImageUrl = `${origin}/uploads/${previewFile.filename}`
    }

    response.json({ data })
  }
)

export default characterAssetUploadRoutes
