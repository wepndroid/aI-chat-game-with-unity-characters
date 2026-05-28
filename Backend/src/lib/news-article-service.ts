import { prisma } from './prisma'
import { countReleasesUsingNewsArticle } from './game-release-service'
import { postgresTimestamptzValue } from './database/postgres-sql'

type NewsArticleRecord = {
  id: string
  slug: string
  title: string
  summary: string | null
  contentHtml: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

type UpsertNewsArticleInput = {
  slug: string
  title: string
  summary?: string | null
  contentHtml: string
  isPublished: boolean
}

const newsArticleTimestamp = (timestamp: string | Date | null) => postgresTimestamptzValue(timestamp)

const normalizeSlug = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    throw new Error('Article slug is required.')
  }

  return normalized.slice(0, 120)
}

const normalizeTitle = (value: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Article title is required.')
  }

  return normalized.slice(0, 180)
}

const normalizeSummary = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, 320) : null
}

const normalizeContentHtml = (value: string) => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Article content is required.')
  }

  if (normalized.length > 200_000) {
    throw new Error('Article content is too large.')
  }

  return normalized
}

const readDateTimeString = (value: unknown) => {
  if (value instanceof Date) {
    return value.toISOString()
  }

  return typeof value === 'string' ? value : null
}

const mapRowToNewsArticleRecord = (row: Record<string, unknown>): NewsArticleRecord => ({
  id: String(row.id),
  slug: String(row.slug),
  title: String(row.title),
  summary: typeof row.summary === 'string' ? row.summary : null,
  contentHtml: String(row.contentHtml),
  isPublished: Boolean(row.isPublished),
  createdAt: readDateTimeString(row.createdAt) ?? String(row.createdAt),
  updatedAt: readDateTimeString(row.updatedAt) ?? String(row.updatedAt),
  deletedAt: readDateTimeString(row.deletedAt)
})

const ensureSlugIsUnique = async (slug: string, excludeId?: string) => {
  const rows = excludeId
    ? await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "NewsArticle"
        WHERE "slug" = ${slug}
          AND "deletedAt" IS NULL
          AND "id" <> ${excludeId}
        LIMIT 1
      `
    : await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "NewsArticle"
        WHERE "slug" = ${slug}
          AND "deletedAt" IS NULL
        LIMIT 1
      `

  if (rows[0]) {
    throw new Error('That article slug is already in use.')
  }
}

const listAdminNewsArticles = async () => {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "slug", "title", "summary", "contentHtml", "isPublished", "createdAt", "updatedAt", "deletedAt"
    FROM "NewsArticle"
    WHERE "deletedAt" IS NULL
    ORDER BY "createdAt" DESC
  `

  return rows.map(mapRowToNewsArticleRecord)
}

const listPublicNewsArticles = async () => {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "slug", "title", "summary", "contentHtml", "isPublished", "createdAt", "updatedAt", "deletedAt"
    FROM "NewsArticle"
    WHERE "deletedAt" IS NULL
      AND "isPublished" = TRUE
    ORDER BY "createdAt" DESC
  `

  return rows.map(mapRowToNewsArticleRecord)
}

const getNewsArticleById = async (id: string) => {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "slug", "title", "summary", "contentHtml", "isPublished", "createdAt", "updatedAt", "deletedAt"
    FROM "NewsArticle"
    WHERE "id" = ${id}
    LIMIT 1
  `

  return rows[0] ? mapRowToNewsArticleRecord(rows[0]) : null
}

const getPublicNewsArticleBySlug = async (slug: string) => {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT "id", "slug", "title", "summary", "contentHtml", "isPublished", "createdAt", "updatedAt", "deletedAt"
    FROM "NewsArticle"
    WHERE "slug" = ${slug}
      AND "deletedAt" IS NULL
      AND "isPublished" = TRUE
    LIMIT 1
  `

  return rows[0] ? mapRowToNewsArticleRecord(rows[0]) : null
}

const createNewsArticle = async (id: string, input: UpsertNewsArticleInput) => {
  const nextArticle = {
    id,
    slug: normalizeSlug(input.slug),
    title: normalizeTitle(input.title),
    summary: normalizeSummary(input.summary),
    contentHtml: normalizeContentHtml(input.contentHtml),
    isPublished: input.isPublished
  }

  await ensureSlugIsUnique(nextArticle.slug)

  const now = new Date().toISOString()
  await prisma.$executeRaw`
    INSERT INTO "NewsArticle"
      ("id", "slug", "title", "summary", "contentHtml", "isPublished", "createdAt", "updatedAt", "deletedAt")
    VALUES
      (${nextArticle.id}, ${nextArticle.slug}, ${nextArticle.title}, ${nextArticle.summary}, ${nextArticle.contentHtml}, ${nextArticle.isPublished}, ${newsArticleTimestamp(now)}, ${newsArticleTimestamp(now)}, NULL)
  `

  const created = await getNewsArticleById(id)
  if (!created) {
    throw new Error('Article could not be created.')
  }

  return created
}

const updateNewsArticle = async (id: string, input: UpsertNewsArticleInput) => {
  const existing = await getNewsArticleById(id)
  if (!existing || existing.deletedAt) {
    throw new Error('Article not found.')
  }

  const nextArticle = {
    slug: normalizeSlug(input.slug),
    title: normalizeTitle(input.title),
    summary: normalizeSummary(input.summary),
    contentHtml: normalizeContentHtml(input.contentHtml),
    isPublished: input.isPublished
  }

  await ensureSlugIsUnique(nextArticle.slug, id)

  const updatedAt = new Date().toISOString()
  await prisma.$executeRaw`
    UPDATE "NewsArticle"
    SET "slug" = ${nextArticle.slug},
        "title" = ${nextArticle.title},
        "summary" = ${nextArticle.summary},
        "contentHtml" = ${nextArticle.contentHtml},
        "isPublished" = ${nextArticle.isPublished},
        "updatedAt" = ${newsArticleTimestamp(updatedAt)}
    WHERE "id" = ${id}
  `

  const updated = await getNewsArticleById(id)
  if (!updated) {
    throw new Error('Article not found after update.')
  }

  return updated
}

const deleteNewsArticle = async (id: string) => {
  const existing = await getNewsArticleById(id)
  if (!existing || existing.deletedAt) {
    throw new Error('Article not found.')
  }

  const referencingReleases = await countReleasesUsingNewsArticle(id)
  if (referencingReleases > 0) {
    throw new Error('Unlink this article from game releases before deleting it.')
  }

  const deletedAt = new Date().toISOString()
  await prisma.$executeRaw`
    UPDATE "NewsArticle"
    SET "deletedAt" = ${newsArticleTimestamp(deletedAt)},
        "updatedAt" = ${newsArticleTimestamp(deletedAt)}
    WHERE "id" = ${id}
  `
}

export {
  createNewsArticle,
  deleteNewsArticle,
  getNewsArticleById,
  getPublicNewsArticleBySlug,
  listAdminNewsArticles,
  listPublicNewsArticles,
  updateNewsArticle
}
export type { NewsArticleRecord, UpsertNewsArticleInput }
