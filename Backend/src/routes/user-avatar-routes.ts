import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { Request } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { tryDeleteTrustedUploadFile } from '../lib/delete-local-upload-file'
import { requireAuth, requireVerifiedEmail } from '../middleware/auth-middleware'

const userAvatarRoutes = Router()

const uploadsRoot = path.join(process.cwd(), 'uploads')

fs.mkdirSync(uploadsRoot, { recursive: true })

const previewExtFromMime = (mime: string) => {
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return ''
}

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadsRoot)
  },
  filename: (_request, file, callback) => {
    const id = randomUUID()
    const fromName = path.extname(file.originalname).toLowerCase()
    const fromMime = previewExtFromMime(file.mimetype)
    const ext =
      fromName && ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)
        ? fromName
        : fromMime || '.png'
    const normalizedExt = ext === '.jpeg' ? '.jpg' : ext
    callback(null, `avatar-${id}${normalizedExt}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Avatar must be an image.'))
      return
    }
    callback(null, true)
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

userAvatarRoutes.post(
  '/users/me/avatar',
  requireAuth,
  requireVerifiedEmail,
  (request, response, next) => {
    upload.single('avatar')(request, response, (error) => {
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
        response.status(401).json({ message: 'Authentication required.' })
        return
      }

      const file = request.file
      if (!file) {
        response.status(400).json({ message: 'Missing avatar file.' })
        return
      }

      const origin = resolvePublicOrigin(request)
      const avatarUrl = `${origin}/uploads/${file.filename}`

      const previous = await prisma.user.findUnique({
        where: { id: authUser.userId },
        select: { avatarUrl: true }
      })

      await tryDeleteTrustedUploadFile(previous?.avatarUrl)

      const updated = await prisma.user.update({
        where: { id: authUser.userId },
        data: { avatarUrl },
        select: { id: true, avatarUrl: true }
      })

      response.json({
        data: {
          avatarUrl: updated.avatarUrl
        }
      })
    } catch (error) {
      next(error)
    }
  }
)

userAvatarRoutes.delete('/users/me/avatar', requireAuth, requireVerifiedEmail, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      response.status(401).json({ message: 'Authentication required.' })
      return
    }

    const previous = await prisma.user.findUnique({
      where: { id: authUser.userId },
      select: { avatarUrl: true }
    })

    await tryDeleteTrustedUploadFile(previous?.avatarUrl)

    await prisma.user.update({
      where: { id: authUser.userId },
      data: { avatarUrl: null }
    })

    response.json({
      data: {
        avatarUrl: null as string | null
      }
    })
  } catch (error) {
    next(error)
  }
})

export default userAvatarRoutes
