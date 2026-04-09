import { prisma } from './prisma'

/**
 * SQLite dev DBs created before story moderation must get `moderationStatus` /
 * `moderationRejectReason` or every StoryPost query throws (500). `prisma db push`
 * fixes this when possible; this runs idempotent ALTERs when the columns are still missing.
 */
const ensureStoryModerationColumns = async () => {
  const databaseUrl = process.env.DATABASE_URL ?? ''
  if (!databaseUrl.startsWith('file:')) {
    return
  }

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>("PRAGMA table_info('StoryPost')")
    const names = new Set(rows.map((row) => row.name))

    if (!names.has('moderationStatus')) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'NONE'`
      )
    }

    if (!names.has('moderationRejectReason')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoryPost" ADD COLUMN "moderationRejectReason" TEXT`)
    }

    if (!names.has('scenarioType')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoryPost" ADD COLUMN "scenarioType" TEXT`)
    }

    await prisma.$executeRawUnsafe(
      `UPDATE "StoryPost" SET "moderationStatus" = 'APPROVED' WHERE "publicationStatus" = 'PUBLISHED' AND "moderationStatus" = 'NONE'`
    )
    await prisma.$executeRawUnsafe(
      `UPDATE "StoryPost" SET "moderationStatus" = 'NONE' WHERE "publicationStatus" = 'DRAFT'`
    )
  } catch (error) {
    console.error('[ensureStoryModerationColumns]', error)
    throw error
  }
}

export { ensureStoryModerationColumns }
