import { prisma } from './prisma'

const MAX_PREVIEW_CHARS = 220

const backfillScenarioFromBody = async () => {
  await prisma.$executeRawUnsafe(
    `UPDATE "StoryPost" SET "scenarioStory" = "body", "scenarioChat" = '' WHERE ("scenarioStory" = '' OR "scenarioStory" IS NULL) AND LENGTH(TRIM("body")) > 0`
  )
}

const backfillPhase1StoryAliasFields = async () => {
  await prisma.$executeRawUnsafe(
    `UPDATE "StoryPost" SET "promptDescription" = COALESCE(NULLIF(TRIM("promptDescription"), ''), NULLIF(TRIM("scenarioStory"), ''))`
  )
  await prisma.$executeRawUnsafe(
    `UPDATE "StoryPost" SET "scenario" = COALESCE(NULLIF(TRIM("scenario"), ''), NULLIF(TRIM("scenarioChat"), ''))`
  )
}

const isDuplicateColumnError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  return error.message.toLowerCase().includes('duplicate column name')
}

const addSqliteColumnIfMissing = async (tableName: string, columnName: string, columnSql: string) => {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`PRAGMA table_info('${tableName}')`)
  const names = new Set(rows.map((row) => row.name))

  if (names.has(columnName)) {
    return
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnSql}`)
  } catch (error) {
    if (!isDuplicateColumnError(error)) {
      throw error
    }
  }
}

type StoryPick = {
  id: string
  characterId: string
  publicationStatus: 'DRAFT' | 'PUBLISHED'
  moderationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
  publishedAt: Date | null
  createdAt: Date
}

const buildPreferredStoryByCharacterMap = (stories: StoryPick[]) => {
  const grouped = new Map<string, StoryPick[]>()

  for (const story of stories) {
    const rows = grouped.get(story.characterId) ?? []
    rows.push(story)
    grouped.set(story.characterId, rows)
  }

  const preferred = new Map<string, string>()

  for (const [characterId, rows] of grouped.entries()) {
    rows.sort((a, b) => {
      const aIsPublicApproved = a.publicationStatus === 'PUBLISHED' && a.moderationStatus === 'APPROVED'
      const bIsPublicApproved = b.publicationStatus === 'PUBLISHED' && b.moderationStatus === 'APPROVED'

      if (aIsPublicApproved !== bIsPublicApproved) {
        return aIsPublicApproved ? -1 : 1
      }

      const aPublishedAt = a.publishedAt?.getTime() ?? a.createdAt.getTime()
      const bPublishedAt = b.publishedAt?.getTime() ?? b.createdAt.getTime()
      return aPublishedAt - bPublishedAt
    })

    const top = rows[0]
    if (top) {
      preferred.set(characterId, top.id)
    }
  }

  return preferred
}

const createSessionFallbackStory = async (character: { id: string; ownerId: string; name: string }) => {
  const scenarioStory = `Legacy session story for ${character.name}.`

  const created = await prisma.storyPost.create({
    data: {
      authorId: character.ownerId,
      characterId: character.id,
      title: `${character.name} Session`,
      promptDescription: scenarioStory,
      personality: null,
      scenario: null,
      firstMessage: null,
      exampleDialogs: null,
      scenarioStory,
      scenarioChat: '',
      body: scenarioStory,
      scenarioType: null,
      publicationStatus: 'DRAFT',
      moderationStatus: 'NONE',
      moderationRejectReason: null,
      publishedAt: null
    },
    select: {
      id: true
    }
  })

  return created.id
}

const buildLegacyStorySlug = (storyId: string, attempt: number) => {
  const base = `legacy-story-${storyId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  const normalizedBase = base.length > 0 ? base : `legacy-story-${Date.now().toString(36)}`
  if (attempt === 0) {
    return normalizedBase
  }
  return `${normalizedBase}-${attempt}-${Date.now().toString(36)}`
}

const createLegacyStoryPlaceholderCharacter = async (authorId: string, storyId: string) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const createdCharacter = await prisma.$transaction(async (tx) => {
        const nextCharacter = await tx.character.create({
          data: {
            ownerId: authorId,
            slug: buildLegacyStorySlug(storyId, attempt),
            name: `Legacy Character ${storyId.slice(-6)}`,
            status: 'DRAFT',
            visibility: 'PRIVATE',
            officialListing: false,
            isPatreonGated: false
          },
          select: {
            id: true
          }
        })

        await tx.characterCard.create({
          data: {
            characterId: nextCharacter.id,
            creatorUserId: authorId,
            fullName: null,
            description: null,
            personality: null,
            scenario: null,
            firstMessage: null,
            exampleDialogs: null,
            isPublic: true
          }
        })

        return nextCharacter
      })

      return createdCharacter.id
    } catch {
      // Retry with another slug if the generated one collides.
    }
  }

  throw new Error(`Failed to create fallback character for legacy story ${storyId}.`)
}

const ensureStoryCharacterLinks = async () => {
  const orphanStories = await prisma.$queryRawUnsafe<Array<{ id: string; authorId: string }>>(
    `SELECT "id", "authorId" FROM "StoryPost" WHERE "characterId" IS NULL`
  )

  for (const orphanStory of orphanStories) {
    const sessionLinkedCharacter = await prisma.chatSession.findFirst({
      where: {
        storyId: orphanStory.id
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        characterCard: {
          select: {
            characterId: true
          }
        }
      }
    })

    let resolvedCharacterId = sessionLinkedCharacter?.characterCard.characterId ?? null

    if (!resolvedCharacterId) {
      const firstOwnedCharacter = await prisma.character.findFirst({
        where: {
          ownerId: orphanStory.authorId
        },
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          id: true
        }
      })

      resolvedCharacterId = firstOwnedCharacter?.id ?? null
    }

    if (!resolvedCharacterId) {
      resolvedCharacterId = await createLegacyStoryPlaceholderCharacter(orphanStory.authorId, orphanStory.id)
    }

    await prisma.storyPost.update({
      where: {
        id: orphanStory.id
      },
      data: {
        characterId: resolvedCharacterId
      }
    })
  }
}

const ensureChatSessionStoryLinks = async () => {
  const orphanSessionRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ChatSession" WHERE "storyId" IS NULL`
  )
  if (orphanSessionRows.length === 0) {
    return
  }
  const orphanSessionIds = orphanSessionRows.map((row) => row.id)

  const stories = await prisma.storyPost.findMany({
    select: {
      id: true,
      characterId: true,
      publicationStatus: true,
      moderationStatus: true,
      publishedAt: true,
      createdAt: true
    }
  })
  const preferredStoryByCharacter = buildPreferredStoryByCharacterMap(stories)
  const createdFallbackByCharacter = new Map<string, string>()

  const orphanSessions = await prisma.chatSession.findMany({
    where: {
      id: {
        in: orphanSessionIds
      }
    },
    select: {
      id: true,
      characterCard: {
        select: {
          character: {
            select: {
              id: true,
              ownerId: true,
              name: true
            }
          }
        }
      },
      messages: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 1,
        select: {
          content: true,
          createdAt: true
        }
      }
    }
  })

  for (const session of orphanSessions) {
    const character = session.characterCard.character
    let resolvedStoryId =
      preferredStoryByCharacter.get(character.id) ??
      createdFallbackByCharacter.get(character.id) ??
      null

    if (!resolvedStoryId) {
      resolvedStoryId = await createSessionFallbackStory(character)
      preferredStoryByCharacter.set(character.id, resolvedStoryId)
      createdFallbackByCharacter.set(character.id, resolvedStoryId)
    }

    const latestMessage = session.messages[0] ?? null
    const updateData: {
      storyId: string
      previewText?: string | null
      lastUpdatedAt?: Date
    } = {
      storyId: resolvedStoryId
    }

    if (latestMessage) {
      updateData.previewText = latestMessage.content.slice(0, MAX_PREVIEW_CHARS)
      updateData.lastUpdatedAt = latestMessage.createdAt
    }

    await prisma.chatSession.update({
      where: {
        id: session.id
      },
      data: updateData
    })
  }
}

const rebuildSqliteChatSessionTableForRequiredStoryLink = async () => {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF`)

  try {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "ChatSession__new"`)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ChatSession__new" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "characterCardId" TEXT NOT NULL,
        "storyId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "previewText" TEXT,
        CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ChatSession_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ChatSession_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ChatSession__new" ("id", "userId", "characterCardId", "storyId", "createdAt", "lastUpdatedAt", "previewText")
      SELECT "id", "userId", "characterCardId", "storyId", "createdAt", "lastUpdatedAt", "previewText"
      FROM "ChatSession"
    `)
    await prisma.$executeRawUnsafe(`DROP TABLE "ChatSession"`)
    await prisma.$executeRawUnsafe(`ALTER TABLE "ChatSession__new" RENAME TO "ChatSession"`)
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ChatSession_userId_createdAt_idx" ON "ChatSession"("userId", "createdAt")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ChatSession_characterCardId_idx" ON "ChatSession"("characterCardId")`
    )
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "ChatSession_storyId_userId_createdAt_idx" ON "ChatSession"("storyId", "userId", "createdAt")`
    )
  } finally {
    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON`)
  }
}

const enforcePostgresChatSessionStoryConstraint = async () => {
  await prisma.$executeRawUnsafe(`ALTER TABLE "ChatSession" ALTER COLUMN "storyId" SET NOT NULL`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "ChatSession" DROP CONSTRAINT IF EXISTS "ChatSession_storyId_fkey"`)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ChatSession"
    ADD CONSTRAINT "ChatSession_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
  `)
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
      await addSqliteColumnIfMissing('StoryPost', 'scenarioStory', `TEXT NOT NULL DEFAULT ''`)
      await addSqliteColumnIfMissing('StoryPost', 'scenarioChat', `TEXT NOT NULL DEFAULT ''`)
      await addSqliteColumnIfMissing('StoryPost', 'promptDescription', `TEXT`)
      await addSqliteColumnIfMissing('StoryPost', 'personality', `TEXT`)
      await addSqliteColumnIfMissing('StoryPost', 'scenario', `TEXT`)
      await addSqliteColumnIfMissing('StoryPost', 'firstMessage', `TEXT`)
      await addSqliteColumnIfMissing('StoryPost', 'exampleDialogs', `TEXT`)

      await addSqliteColumnIfMissing('ChatSession', 'storyId', `TEXT`)

      await backfillScenarioFromBody()
      await backfillPhase1StoryAliasFields()
      await ensureStoryCharacterLinks()
      await ensureChatSessionStoryLinks()

      const chatSessionRowsAfter = await prisma.$queryRawUnsafe<Array<{ name: string; notnull: number }>>(
        "PRAGMA table_info('ChatSession')"
      )
      const storyIdColumn = chatSessionRowsAfter.find((row) => row.name === 'storyId')
      if (!storyIdColumn || storyIdColumn.notnull !== 1) {
        await rebuildSqliteChatSessionTableForRequiredStoryLink()
      }
      return
    }

    if (databaseUrl.startsWith('postgresql:') || databaseUrl.startsWith('postgres:')) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "scenarioStory" TEXT NOT NULL DEFAULT ''`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "scenarioChat" TEXT NOT NULL DEFAULT ''`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "promptDescription" TEXT`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "personality" TEXT`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "scenario" TEXT`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "firstMessage" TEXT`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "StoryPost" ADD COLUMN IF NOT EXISTS "exampleDialogs" TEXT`
      )
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "storyId" TEXT`
      )
      await backfillScenarioFromBody()
      await backfillPhase1StoryAliasFields()
      await ensureStoryCharacterLinks()
      await ensureChatSessionStoryLinks()
      await prisma.$executeRawUnsafe(`ALTER TABLE "StoryPost" ALTER COLUMN "characterId" SET NOT NULL`)
      await enforcePostgresChatSessionStoryConstraint()
    }
  } catch (error) {
    console.error('[ensureStoryScenarioSplitColumns]', error)
    throw error
  }
}

export { ensureStoryScenarioSplitColumns }
