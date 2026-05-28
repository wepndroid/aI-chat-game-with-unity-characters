import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from './prisma'
import {
  buildWebglReleasePreloadManifest
} from '../services/game-release/webgl-release-preload-manifest'
import { postgresEnumValue, postgresTimestamptzValue } from './database/postgres-sql'
import {
  mapGameReleaseRow,
  type GameReleasePlatform,
  type GameReleaseRecord,
  type GameReleaseRow,
  type NewsArticleSummary
} from '../services/game-release/game-release-row-mapper'

const uploadsRoot = path.resolve(path.join(process.cwd(), 'uploads'))

type CreateGameReleaseInput = {
  id: string
  platform: GameReleasePlatform
  versionLabel: string
  artifactUrl: string
  runtimeUrl?: string | null
  downloadUrl?: string | null
  artifactFileName?: string | null
  storagePath?: string | null
  totalBytes?: number | null
  fileCount?: number | null
  isActive?: boolean
  newsArticleId?: string | null
}

type UpdateGameReleaseMetadataInput = {
  versionLabel: string
  newsArticleId: string | null
}

const gameReleaseTimestamp = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)
const gameReleasePlatform = (platform: GameReleasePlatform) => postgresEnumValue(platform, 'GameReleasePlatform')

const normalizeVersionLabel = (value: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Version label is required.')
  }

  return normalized.slice(0, 120)
}

const baseSelect = `
  SELECT
    release."id",
    release."platform",
    release."versionLabel",
    release."artifactUrl",
    release."runtimeUrl",
    release."downloadUrl",
    release."artifactFileName",
    release."storagePath",
    release."totalBytes",
    release."fileCount",
    release."isActive",
    release."newsArticleId" AS "releaseNewsArticleId",
    release."createdAt",
    release."updatedAt",
    release."deletedAt",
    article."id" AS "joinedNewsArticleId",
    article."slug" AS "newsArticleSlug",
    article."title" AS "newsArticleTitle",
    article."summary" AS "newsArticleSummary",
    article."isPublished" AS "newsArticlePublished"
  FROM "GameRelease" release
  LEFT JOIN "NewsArticle" article
    ON article."id" = release."newsArticleId"
    AND article."deletedAt" IS NULL
`

const getReferencedNewsArticle = async (newsArticleId: string | null) => {
  if (!newsArticleId) {
    return null
  }

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "NewsArticle"
    WHERE "id" = ${newsArticleId}
      AND "deletedAt" IS NULL
    LIMIT 1
  `

  if (!rows[0]) {
    throw new Error('Selected news article was not found.')
  }

  return rows[0]
}

const listAdminGameReleases = async () => {
  const rows = await prisma.$queryRawUnsafe<Array<GameReleaseRow>>(
    `${baseSelect}
     WHERE release."deletedAt" IS NULL
     ORDER BY release."platform" ASC, release."createdAt" DESC`
  )

  return rows.map(mapGameReleaseRow)
}

const getGameReleaseById = async (id: string) => {
  const rows = await prisma.$queryRawUnsafe<Array<GameReleaseRow>>(
    `${baseSelect}
     WHERE release."id" = $1
     LIMIT 1`,
    id
  )

  return rows[0] ? mapGameReleaseRow(rows[0]) : null
}

const getPublicActiveGameReleases = async () => {
  const rows = await prisma.$queryRawUnsafe<Array<GameReleaseRow>>(
    `${baseSelect}
     WHERE release."deletedAt" IS NULL
       AND release."isActive" = TRUE
     ORDER BY release."createdAt" DESC`
  )

  const mapped = rows.map(mapGameReleaseRow)
  const windows = mapped.find((row) => row.platform === 'WINDOWS') ?? null
  const webglRelease = mapped.find((row) => row.platform === 'WEBGL') ?? null
  const webglPreloadManifest = webglRelease
    ? await buildWebglReleasePreloadManifest({
        releaseId: webglRelease.id,
        versionLabel: webglRelease.versionLabel,
        runtimeUrl: webglRelease.runtimeUrl,
        storagePath: webglRelease.storagePath,
        uploadsRoot
      }).catch(() => null)
    : null
  const webgl = webglRelease
    ? {
        ...webglRelease,
        preloadManifest: webglPreloadManifest
      }
    : null

  return {
    windows,
    webgl
  }
}

const activateGameRelease = async (id: string) => {
  const release = await getGameReleaseById(id)
  if (!release || release.deletedAt) {
    throw new Error('Release not found.')
  }

  const updatedAt = new Date().toISOString()

  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "GameRelease"
      SET "isActive" = FALSE,
          "updatedAt" = ${gameReleaseTimestamp(updatedAt)}
      WHERE "platform" = ${gameReleasePlatform(release.platform)}
        AND "deletedAt" IS NULL
        AND "isActive" = TRUE
    `,
    prisma.$executeRaw`
      UPDATE "GameRelease"
      SET "isActive" = TRUE,
          "updatedAt" = ${gameReleaseTimestamp(updatedAt)}
      WHERE "id" = ${id}
    `
  ])

  const refreshed = await getGameReleaseById(id)
  if (!refreshed) {
    throw new Error('Release not found after activation.')
  }

  return refreshed
}

const createGameRelease = async (input: CreateGameReleaseInput) => {
  await getReferencedNewsArticle(input.newsArticleId ?? null)

  const now = new Date().toISOString()
  const nextRelease = {
    ...input,
    versionLabel: normalizeVersionLabel(input.versionLabel),
    artifactFileName: input.artifactFileName?.trim() || null,
    storagePath: input.storagePath?.trim() || null,
    runtimeUrl: input.runtimeUrl?.trim() || input.artifactUrl,
    downloadUrl: input.downloadUrl?.trim() || input.artifactUrl,
    totalBytes: input.totalBytes ?? null,
    fileCount: input.fileCount ?? null,
    isActive: input.isActive ?? true,
    newsArticleId: input.newsArticleId ?? null
  }

  await prisma.$transaction(async (transaction) => {
    if (nextRelease.isActive) {
      await transaction.$executeRaw`
        UPDATE "GameRelease"
        SET "isActive" = FALSE,
            "updatedAt" = ${gameReleaseTimestamp(now)}
        WHERE "platform" = ${gameReleasePlatform(nextRelease.platform)}
          AND "deletedAt" IS NULL
          AND "isActive" = TRUE
      `
    }

    await transaction.$executeRaw`
      INSERT INTO "GameRelease"
        ("id", "platform", "versionLabel", "changelogHtml", "artifactUrl", "runtimeUrl", "downloadUrl", "artifactFileName", "storagePath", "totalBytes", "fileCount", "isActive", "newsArticleId", "createdAt", "updatedAt", "deletedAt")
      VALUES
        (${nextRelease.id}, ${gameReleasePlatform(nextRelease.platform)}, ${nextRelease.versionLabel}, ${''}, ${nextRelease.artifactUrl}, ${nextRelease.runtimeUrl}, ${nextRelease.downloadUrl}, ${nextRelease.artifactFileName}, ${nextRelease.storagePath}, ${nextRelease.totalBytes}, ${nextRelease.fileCount}, ${nextRelease.isActive}, ${nextRelease.newsArticleId}, ${gameReleaseTimestamp(now)}, ${gameReleaseTimestamp(now)}, NULL)
    `
  })

  const created = await getGameReleaseById(nextRelease.id)
  if (!created) {
    throw new Error('Release could not be created.')
  }

  return created
}

const updateGameReleaseMetadata = async (id: string, input: UpdateGameReleaseMetadataInput) => {
  const existing = await getGameReleaseById(id)
  if (!existing || existing.deletedAt) {
    throw new Error('Release not found.')
  }

  await getReferencedNewsArticle(input.newsArticleId)

  const updatedAt = new Date().toISOString()

  await prisma.$executeRaw`
    UPDATE "GameRelease"
    SET "versionLabel" = ${normalizeVersionLabel(input.versionLabel)},
        "newsArticleId" = ${input.newsArticleId},
        "updatedAt" = ${gameReleaseTimestamp(updatedAt)}
    WHERE "id" = ${id}
  `

  const updated = await getGameReleaseById(id)
  if (!updated) {
    throw new Error('Release not found after update.')
  }

  return updated
}

const deleteStoredReleaseArtifacts = async (storagePathValue: string | null) => {
  if (!storagePathValue) {
    return
  }

  const resolvedTarget = path.resolve(path.join(uploadsRoot, storagePathValue))
  const relativeToUploads = path.relative(uploadsRoot, resolvedTarget)

  if (relativeToUploads.startsWith('..') || path.isAbsolute(relativeToUploads)) {
    throw new Error('Refusing to delete a path outside uploads.')
  }

  await fs.rm(resolvedTarget, { recursive: true, force: true })
}

const deleteGameRelease = async (id: string) => {
  const existing = await getGameReleaseById(id)
  if (!existing || existing.deletedAt) {
    throw new Error('Release not found.')
  }

  if (existing.isActive) {
    throw new Error('Select another active version before deleting this one.')
  }

  const deletedAt = new Date().toISOString()

  await prisma.$executeRaw`
    UPDATE "GameRelease"
    SET "deletedAt" = ${gameReleaseTimestamp(deletedAt)},
        "updatedAt" = ${gameReleaseTimestamp(deletedAt)},
        "isActive" = FALSE
    WHERE "id" = ${id}
  `

  await deleteStoredReleaseArtifacts(existing.storagePath)
}

const countReleasesUsingNewsArticle = async (newsArticleId: string) => {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) AS "count"
    FROM "GameRelease"
    WHERE "newsArticleId" = ${newsArticleId}
      AND "deletedAt" IS NULL
  `

  return Number(rows[0]?.count ?? 0)
}

export {
  countReleasesUsingNewsArticle,
  createGameRelease,
  deleteGameRelease,
  getGameReleaseById,
  getPublicActiveGameReleases,
  listAdminGameReleases,
  updateGameReleaseMetadata,
  activateGameRelease
}
export type { CreateGameReleaseInput, GameReleasePlatform, GameReleaseRecord, NewsArticleSummary }
