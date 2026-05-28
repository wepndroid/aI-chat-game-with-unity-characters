import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Request, Response } from 'express'
import { Router } from 'express'
import multer from 'multer'
import unzipper from 'unzipper'
import { z } from 'zod'
import {
  activateGameRelease,
  createGameRelease,
  deleteGameRelease,
  getPublicActiveGameReleases,
  listAdminGameReleases,
  updateGameReleaseMetadata
} from '../lib/game-release-service'
import { requireAdmin } from '../middleware/auth-middleware'
import { instrumentExtractedWebglIndex } from '../services/game-release/webgl-index-instrumentation'

const gameReleaseRoutes = Router()

const uploadsRoot = path.join(process.cwd(), 'uploads')
const tempUploadRoot = path.join(uploadsRoot, '.tmp', 'game-release-staging')
const windowsReleaseRoot = path.join(uploadsRoot, 'game-releases', 'windows')
const webglReleaseRoot = path.join(uploadsRoot, 'game-releases', 'webgl')

fs.mkdirSync(tempUploadRoot, { recursive: true })
fs.mkdirSync(windowsReleaseRoot, { recursive: true })
fs.mkdirSync(webglReleaseRoot, { recursive: true })

const metadataPatchSchema = z
  .object({
    versionLabel: z.string().trim().min(1).max(120),
    newsArticleId: z.string().trim().min(1).nullable()
  })
  .strict()

const tempStorage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, tempUploadRoot)
  },
  filename: (_request, file, callback) => {
    const safeExt = path.extname(file.originalname).slice(0, 24)
    callback(null, `${randomUUID()}${safeExt}`)
  }
})

const windowsUpload = multer({
  storage: tempStorage,
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024
  }
})

const webglZipUpload = multer({
  storage: tempStorage,
  limits: {
    fileSize: 4 * 1024 * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      callback(new Error('WebGL upload must be a .zip file.'))
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

const toBooleanFromMultipart = (value: unknown, defaultValue: boolean) => {
  if (typeof value !== 'string') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true
  }

  return defaultValue
}

const sanitizeFileName = (value: string, fallbackStem: string) => {
  const parsed = path.parse(value.trim())
  const rawName = parsed.name || fallbackStem
  const safeName = rawName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || fallbackStem
  const safeExt = parsed.ext.replace(/[^A-Za-z0-9.]+/g, '').slice(0, 16)
  return `${safeName}${safeExt}`
}

const normalizeRelativeZipPath = (value: string) => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) {
    throw new Error('Zip entries must have a path.')
  }
  if (normalized.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Zip contains an invalid path.')
  }
  if (!/^[A-Za-z0-9._\/()-]+$/.test(normalized)) {
    throw new Error('Zip contains unsupported file names.')
  }

  return normalized
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

const moveFile = async (sourcePath: string, destinationPath: string) => {
  await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true })
  await fsPromises.rename(sourcePath, destinationPath)
}

const buildUploadUrl = (origin: string, relativePath: string) => {
  return `${origin}/uploads/${relativePath.replace(/\\/g, '/')}`
}

const respondWithBadRequest = (response: Response, error: unknown) => {
  response.status(400).json({
    message: error instanceof Error ? error.message : 'Request failed.'
  })
}

type ExtractedWebglArchiveResult = {
  fileCount: number
  totalBytes: number
}

type WebglZipFileEntry = {
  path: string
  type: string
  stream: () => NodeJS.ReadableStream
  uncompressedSize?: number
  vars?: {
    uncompressedSize?: number
  }
}

const getZipEntryUncompressedSize = (entry: WebglZipFileEntry) => {
  if (typeof entry.uncompressedSize === 'number' && Number.isFinite(entry.uncompressedSize)) {
    return Math.max(0, entry.uncompressedSize)
  }

  if (typeof entry.vars?.uncompressedSize === 'number' && Number.isFinite(entry.vars.uncompressedSize)) {
    return Math.max(0, entry.vars.uncompressedSize)
  }

  return 0
}

const extractWebglArchive = async (zipFilePath: string, targetAbsoluteRoot: string): Promise<ExtractedWebglArchiveResult> => {
  const directory = await unzipper.Open.file(zipFilePath)
  const fileEntries = directory.files.filter((entry: WebglZipFileEntry) => entry.type === 'File') as WebglZipFileEntry[]

  if (fileEntries.length === 0) {
    throw new Error('The WebGL zip file is empty.')
  }

  let hasRootIndexHtml = false
  let totalBytes = 0

  for (const entry of fileEntries) {
    const normalizedRelativePath = normalizeRelativeZipPath(entry.path)
    if (normalizedRelativePath.toLowerCase() === 'index.html') {
      hasRootIndexHtml = true
    }

    const destinationPath = path.resolve(path.join(targetAbsoluteRoot, normalizedRelativePath))
    if (!destinationPath.startsWith(path.resolve(targetAbsoluteRoot))) {
      throw new Error('A zip entry resolved outside the release directory.')
    }

    await fsPromises.mkdir(path.dirname(destinationPath), { recursive: true })
    await pipeline(entry.stream(), fs.createWriteStream(destinationPath))
    totalBytes += getZipEntryUncompressedSize(entry)
  }

  if (!hasRootIndexHtml) {
    throw new Error('The WebGL zip file must contain index.html in the root of the archive.')
  }

  await instrumentExtractedWebglIndex(targetAbsoluteRoot)

  return {
    fileCount: fileEntries.length,
    totalBytes
  }
}

gameReleaseRoutes.get('/admin/game-releases', requireAdmin, async (_request, response, next) => {
  try {
    const releases = await listAdminGameReleases()
    response.json({
      data: releases
    })
  } catch (error) {
    next(error)
  }
})

gameReleaseRoutes.get('/game-releases/public', async (_request, response, next) => {
  try {
    const releases = await getPublicActiveGameReleases()
    response.json({
      data: releases
    })
  } catch (error) {
    next(error)
  }
})

gameReleaseRoutes.post(
  '/admin/game-releases/windows',
  requireAdmin,
  (request, response, next) => {
    windowsUpload.single('artifact')(request, response, (error) => {
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
    const artifactFile = request.file
    let targetAbsolutePath: string | null = null

    if (!artifactFile) {
      response.status(400).json({
        message: 'Upload a Windows build file.'
      })
      return
    }

    try {
      const versionLabel = typeof request.body.versionLabel === 'string' ? request.body.versionLabel : ''
      const newsArticleId =
        typeof request.body.newsArticleId === 'string' && request.body.newsArticleId.trim().length > 0
          ? request.body.newsArticleId.trim()
          : null
      const isActive = toBooleanFromMultipart(request.body.activate, true)
      const releaseId = randomUUID()
      const safeFileName = sanitizeFileName(artifactFile.originalname, `windows-build-${releaseId}`)
      const targetRelativePath = path.join('game-releases', 'windows', `${releaseId}-${safeFileName}`)
      targetAbsolutePath = path.join(uploadsRoot, targetRelativePath)

      await moveFile(artifactFile.path, targetAbsolutePath)

      const downloadUrl = buildUploadUrl(resolvePublicOrigin(request), targetRelativePath)
      const release = await createGameRelease({
        id: releaseId,
        platform: 'WINDOWS',
        versionLabel,
        artifactUrl: downloadUrl,
        runtimeUrl: downloadUrl,
        downloadUrl,
        artifactFileName: artifactFile.originalname.trim() || safeFileName,
        storagePath: targetRelativePath,
        totalBytes: artifactFile.size,
        fileCount: 1,
        isActive,
        newsArticleId
      })

      response.status(201).json({
        data: release
      })
    } catch (error) {
      await removeTempFile(artifactFile)
      if (targetAbsolutePath) {
        await fsPromises.rm(targetAbsolutePath, { force: true }).catch(() => {})
      }
      respondWithBadRequest(response, error)
    }
  }
)

gameReleaseRoutes.post(
  '/admin/game-releases/webgl',
  requireAdmin,
  (request, response, next) => {
    webglZipUpload.single('archive')(request, response, (error) => {
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
    const archiveFile = request.file
    let releaseRootAbsolutePath: string | null = null

    if (!archiveFile) {
      response.status(400).json({
        message: 'Upload a WebGL zip file.'
      })
      return
    }

    try {
      const versionLabel = typeof request.body.versionLabel === 'string' ? request.body.versionLabel : ''
      const newsArticleId =
        typeof request.body.newsArticleId === 'string' && request.body.newsArticleId.trim().length > 0
          ? request.body.newsArticleId.trim()
          : null
      const isActive = toBooleanFromMultipart(request.body.activate, true)
      const releaseId = randomUUID()
      const safeArchiveFileName = sanitizeFileName(archiveFile.originalname, `webgl-build-${releaseId}`)
      const releaseRootRelativePath = path.join('game-releases', 'webgl', releaseId)
      releaseRootAbsolutePath = path.join(uploadsRoot, releaseRootRelativePath)
      const archiveRelativePath = path.join(releaseRootRelativePath, safeArchiveFileName)
      const archiveAbsolutePath = path.join(uploadsRoot, archiveRelativePath)
      const extractedRootRelativePath = path.join(releaseRootRelativePath, 'build')
      const extractedRootAbsolutePath = path.join(uploadsRoot, extractedRootRelativePath)

      await fsPromises.mkdir(releaseRootAbsolutePath, { recursive: true })
      await moveFile(archiveFile.path, archiveAbsolutePath)
      const extracted = await extractWebglArchive(archiveAbsolutePath, extractedRootAbsolutePath)

      const origin = resolvePublicOrigin(request)
      const runtimeUrl = buildUploadUrl(origin, path.join(extractedRootRelativePath, 'index.html'))
      const downloadUrl = buildUploadUrl(origin, archiveRelativePath)

      const release = await createGameRelease({
        id: releaseId,
        platform: 'WEBGL',
        versionLabel,
        artifactUrl: downloadUrl,
        runtimeUrl,
        downloadUrl,
        artifactFileName: archiveFile.originalname.trim() || safeArchiveFileName,
        storagePath: releaseRootRelativePath,
        totalBytes: extracted.totalBytes,
        fileCount: extracted.fileCount,
        isActive,
        newsArticleId
      })

      response.status(201).json({
        data: release
      })
    } catch (error) {
      await removeTempFile(archiveFile)
      if (releaseRootAbsolutePath) {
        await fsPromises.rm(releaseRootAbsolutePath, { recursive: true, force: true }).catch(() => {})
      }
      respondWithBadRequest(response, error)
    }
  }
)

gameReleaseRoutes.patch('/admin/game-releases/:releaseId', requireAdmin, async (request, response) => {
  try {
    const payload = metadataPatchSchema.parse(request.body)
    const releaseId = String(request.params.releaseId)
    const release = await updateGameReleaseMetadata(releaseId, {
      versionLabel: payload.versionLabel,
      newsArticleId: payload.newsArticleId ?? null
    })
    response.json({
      data: release
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

gameReleaseRoutes.post('/admin/game-releases/:releaseId/activate', requireAdmin, async (request, response) => {
  try {
    const releaseId = String(request.params.releaseId)
    const release = await activateGameRelease(releaseId)
    response.json({
      data: release
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

gameReleaseRoutes.delete('/admin/game-releases/:releaseId', requireAdmin, async (request, response) => {
  try {
    const releaseId = String(request.params.releaseId)
    await deleteGameRelease(releaseId)
    response.json({
      data: {
        deleted: true
      }
    })
  } catch (error) {
    respondWithBadRequest(response, error)
  }
})

export default gameReleaseRoutes
