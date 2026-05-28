import type { WebglReleasePreloadManifest } from './webgl-release-preload-manifest'

type GameReleasePlatform = 'WINDOWS' | 'WEBGL'

type NewsArticleSummary = {
  id: string
  slug: string
  title: string
  summary: string | null
  isPublished: boolean
}

type GameReleaseRecord = {
  id: string
  platform: GameReleasePlatform
  versionLabel: string
  artifactUrl: string
  runtimeUrl: string
  downloadUrl: string
  artifactFileName: string | null
  storagePath: string | null
  totalBytes: number | null
  fileCount: number | null
  isActive: boolean
  newsArticleId: string | null
  newsArticle: NewsArticleSummary | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  preloadManifest?: WebglReleasePreloadManifest | null
}

type GameReleaseRow = Record<string, unknown>

const parseNullableInteger = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value))
  }
  if (typeof value === 'bigint') {
    return Number(value)
  }
  return null
}

const readString = (value: unknown) => (typeof value === 'string' ? value : null)

const readDateTimeString = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return typeof value === 'string' ? value : null
}

const readOptionalUrl = (value: unknown, fallback: string) => {
  const candidate = readString(value)
  return candidate && candidate.trim().length > 0 ? candidate : fallback
}

const mapSummaryFromRow = (row: GameReleaseRow): NewsArticleSummary | null => {
  const id = readString(row.joinedNewsArticleId)
  const slug = readString(row.newsArticleSlug)
  const title = readString(row.newsArticleTitle)

  if (!id || !slug || !title) {
    return null
  }

  return {
    id,
    slug,
    title,
    summary: readString(row.newsArticleSummary),
    isPublished: Boolean(row.newsArticlePublished)
  }
}

/**
 * Maps raw GameRelease SQL rows after the query has assigned stable aliases.
 *
 * `releaseNewsArticleId` is the foreign key stored on the release. `joinedNewsArticleId`
 * is the row identity returned by the optional article join. Keeping those columns
 * distinct prevents duplicate SQL aliases from making Prisma raw rows ambiguous.
 */
const mapGameReleaseRow = (row: GameReleaseRow): GameReleaseRecord => {
  const artifactUrl = String(row.artifactUrl)

  return {
    id: String(row.id),
    platform: String(row.platform) as GameReleasePlatform,
    versionLabel: String(row.versionLabel),
    artifactUrl,
    runtimeUrl: readOptionalUrl(row.runtimeUrl, artifactUrl),
    downloadUrl: readOptionalUrl(row.downloadUrl, artifactUrl),
    artifactFileName: readString(row.artifactFileName),
    storagePath: readString(row.storagePath),
    totalBytes: parseNullableInteger(row.totalBytes),
    fileCount: parseNullableInteger(row.fileCount),
    isActive: Boolean(row.isActive),
    newsArticleId: readString(row.releaseNewsArticleId),
    newsArticle: mapSummaryFromRow(row),
    createdAt: readDateTimeString(row.createdAt) ?? String(row.createdAt),
    updatedAt: readDateTimeString(row.updatedAt) ?? String(row.updatedAt),
    deletedAt: readDateTimeString(row.deletedAt)
  }
}

export { mapGameReleaseRow }
export type { GameReleasePlatform, GameReleaseRecord, GameReleaseRow, NewsArticleSummary }
