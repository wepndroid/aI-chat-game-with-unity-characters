import { prisma } from './prisma'

const backfillScenarioFromBody = async () => {
  await prisma.$executeRawUnsafe(
    `UPDATE "StoryPost" SET "scenarioStory" = "body", "scenarioChat" = '' WHERE ("scenarioStory" = '' OR "scenarioStory" IS NULL) AND LENGTH(TRIM("body")) > 0`
  )
}

/**
 * Adds `scenarioStory` / `scenarioChat` for DBs created before the split.
 * Backfills `scenarioStory` from legacy `body` when chat is empty.
 *
 * SQLite: PRAGMA + ALTER (older SQLite has no IF NOT EXISTS on ADD COLUMN).
 * PostgreSQL: `ADD COLUMN IF NOT EXISTS` so hosted DBs match the Prisma model without a manual migration.
 */
const ensureStoryScenarioSplitColumns = async () => {
  const databaseUrl = process.env.DATABASE_URL ?? ''

  try {
    if (databaseUrl.startsWith('file:')) {
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>("PRAGMA table_info('StoryPost')")
      const names = new Set(rows.map((row) => row.name))

      if (!names.has('scenarioStory')) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "StoryPost" ADD COLUMN "scenarioStory" TEXT NOT NULL DEFAULT ''`)
      }

      if (!names.has('scenarioChat')) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "StoryPost" ADD COLUMN "scenarioChat" TEXT NOT NULL DEFAULT ''`)
      }

      await backfillScenarioFromBody()
      return
    }

    if (databaseUrl.startsWith('postgresql:') || databaseUrl.startsWith('postgres:')) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "scenarioStory" TEXT NOT NULL DEFAULT ''`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "scenarioChat" TEXT NOT NULL DEFAULT ''`
      )
      await backfillScenarioFromBody()
    }
  } catch (error) {
    console.error('[ensureStoryScenarioSplitColumns]', error)
    throw error
  }
}

export { ensureStoryScenarioSplitColumns }
