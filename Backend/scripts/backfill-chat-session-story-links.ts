/**
 * One-time backfill for legacy DBs:
 * - Links ChatSession rows whose storyId is null to a best-fit StoryPost by character.
 * - Seeds previewText / lastUpdatedAt from the latest stored chat message.
 *
 * Uses raw SQL to discover null storyId rows so it still works after storyId becomes required in Prisma schema.
 */
import { PrismaClient, StoryModerationStatus, StoryPublicationStatus } from '@prisma/client'

const prisma = new PrismaClient()

const MAX_PREVIEW_CHARS = 220

type StoryPick = {
  id: string
  characterId: string
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
  publishedAt: Date | null
  createdAt: Date
}

const buildPreferredStoryMap = (stories: StoryPick[]) => {
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

const createFallbackStoryForCharacter = async (character: { id: string; ownerId: string; name: string }) => {
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

const main = async () => {
  const orphanSessionRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "ChatSession" WHERE "storyId" IS NULL`
  )

  if (orphanSessionRows.length === 0) {
    console.log('No ChatSession rows with null storyId found.')
    return
  }

  const orphanSessionIds = orphanSessionRows.map((row) => row.id)

  const [stories, orphanSessions] = await Promise.all([
    prisma.storyPost.findMany({
      select: {
        id: true,
        characterId: true,
        publicationStatus: true,
        moderationStatus: true,
        publishedAt: true,
        createdAt: true
      }
    }),
    prisma.chatSession.findMany({
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
  ])

  const preferredStoryByCharacter = buildPreferredStoryMap(stories)
  const fallbackStoryByCharacter = new Map<string, string>()
  let linkedCount = 0

  for (const session of orphanSessions) {
    const character = session.characterCard.character
    let resolvedStoryId =
      preferredStoryByCharacter.get(character.id) ??
      fallbackStoryByCharacter.get(character.id) ??
      null

    if (!resolvedStoryId) {
      resolvedStoryId = await createFallbackStoryForCharacter(character)
      preferredStoryByCharacter.set(character.id, resolvedStoryId)
      fallbackStoryByCharacter.set(character.id, resolvedStoryId)
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

    linkedCount += 1
  }

  console.log(`ChatSession backfill complete: linked=${linkedCount}, total=${orphanSessions.length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
