import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Request, Response } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import {
  createNewsArticle,
  deleteNewsArticle,
  getPublicNewsArticleBySlug,
  listAdminNewsArticles,
  listPublicNewsArticles,
  updateNewsArticle
} from '../lib/news-article-service'
import { requireAdmin } from '../middleware/auth-middleware'

const newsRoutes = Router()

const uploadsRoot = path.join(process.cwd(), 'uploads')
const tempUploadRoot = path.join(uploadsRoot, '.tmp', 'news-staging')
const newsImageRoot = path.join(uploadsRoot, 'news-images')

fs.mkdirSync(tempUploadRoot, { recursive: true })
fs.mkdirSync(newsImageRoot, { recursive: true })

const newsArticleSchema = z
  .object({
    slug: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().max(320).nullable().optional(),
    contentHtml: z.string().trim().min(1).max(200000),
    isPublished: z.boolean()
  })
  .strict()

const newsImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, tempUploadRoot)
    },
    filename: (_request, file, callback) => {
      const safeExt = path.extname(file.originalname).slice(0, 24)
      callback(null, `${randomUUID()}${safeExt}`)
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('News image uploads must be images.'))
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

const sanitizeFileName = (value: string, fallbackStem: string) => {
  const parsed = path.parse(value.trim())
  const rawName = parsed.name || fallbackStem
  const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || fallbackStem
  const safeExt = parsed.ext.replace(/[^A-Za-z0-9.]+/g, '').slice(0, 16)
  return `${safeName}${safeExt}`
}

const buildUploadUrl = (origin: string, relativePath: string) => {
  return `${origin}/uploads/${relativePath.replace(/\\/g, '/')}`
}

const respondWithBadRequest = (response: Response, error: unknown) => {
  response.status(400).json({
    message: error instanceof Error ? error.message : 'Request failed.'
  })
}

const removeTempFile = async (file: Express.Multer.File | undefined) => {
  if (!file) {
    return
  }

  try {
    await fsPromises.unlink(file.path)
  } catch {
    // best effort cleanup
  }
}

newsRoutes.get('/admin/news', requireAdmin, async (_request, response, next) => {
  try {
    const articles = await listAdminNewsArticles()
    response.json({
      data: articles
    })
  } catch (error) {
    next(error)
  }
})

newsRoutes.get('/news/public', async (_request, response, next) => {
  try {
    const articles = await listPublicNewsArticles()
    response.json({
      data: articles
    })
  } catch (error) {
    next(error)
  }
})

newsRoutes.get('/news/public/:slug', async (request, response, next) => {
  try {
    const article = await getPublicNewsArticleBySlug(String(request.params.slug))
    if (!article) {
      response.status(404).json({
        message: 'News article not found.'
      })
      return
    }

    response.json({
      data: article
    })
  } catch (error) {
    next(error)
  }
})

newsRoutes.post('/admin/news', requireAdmin, async (request, response) => {
  try {
    const payload = newsArticleSchema.parse(request.body)
    const article = await createNewsArticle(randomUUID(), payload)
    response.status(201).json({
      data: article
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

newsRoutes.patch('/admin/news/:articleId', requireAdmin, async (request, response) => {
  try {
    const payload = newsArticleSchema.parse(request.body)
    const article = await updateNewsArticle(String(request.params.articleId), payload)
    response.json({
      data: article
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

newsRoutes.delete('/admin/news/:articleId', requireAdmin, async (request, response) => {
  try {
    await deleteNewsArticle(String(request.params.articleId))
    response.json({
      data: {
        deleted: true
      }
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

newsRoutes.post(
  '/admin/news/images',
  requireAdmin,
  (request, response, next) => {
    newsImageUpload.single('image')(request, response, (error) => {
      if (error) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'Image upload failed.'
        })
        return
      }

      next()
    })
  },
  async (request, response) => {
    const imageFile = request.file
    let targetAbsolutePath: string | null = null

    if (!imageFile) {
      response.status(400).json({
        message: 'Choose an image to upload.'
      })
      return
    }

    try {
      const safeFileName = sanitizeFileName(imageFile.originalname, `news-image-${randomUUID()}`)
      const targetRelativePath = path.join('news-images', `${randomUUID()}-${safeFileName}`)
      targetAbsolutePath = path.join(uploadsRoot, targetRelativePath)
      await fsPromises.mkdir(path.dirname(targetAbsolutePath), { recursive: true })
      await fsPromises.rename(imageFile.path, targetAbsolutePath)

      response.status(201).json({
        data: {
          url: buildUploadUrl(resolvePublicOrigin(request), targetRelativePath)
        }
      })
    } catch (error) {
      await removeTempFile(imageFile)
      if (targetAbsolutePath) {
        await fsPromises.rm(targetAbsolutePath, { force: true }).catch(() => {})
      }
      respondWithBadRequest(response, error)
    }
  }
)

export default newsRoutes
