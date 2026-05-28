import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient, type StoryOrigin, type UserRole } from '@prisma/client'

const APPLY_CONFIRMATION_TOKEN = 'story-origin-defaults'

type BackfillMode = 'dry-run' | 'apply'

type BackfillArgs = {
  mode: BackfillMode
  confirm: string | null
  reportPath: string | null
}

type StoryCandidate = {
  id: string
  origin: StoryOrigin
  publishedAt: Date | null
  createdAt: Date
}

const parseArgs = (argv: string[]): BackfillArgs => {
  const mode: BackfillMode = argv.includes('--apply') ? 'apply' : 'dry-run'
  const confirmArg = argv.find((value) => value.startsWith('--confirm='))
  const reportArg = argv.find((value) => value.startsWith('--report='))

  return {
    mode,
    confirm: confirmArg ? confirmArg.slice('--confirm='.length) : null,
    reportPath: reportArg ? reportArg.slice('--report='.length) : null
  }
}

const assertPostgresDatabaseUrl = () => {
  const rawDatabaseUrl = process.env.DATABASE_URL?.trim()
  if (!rawDatabaseUrl) {
    throw new Error('DATABASE_URL is required.')
  }

  const parsed = new URL(rawDatabaseUrl)
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Story origin/default backfill must run against PostgreSQL.')
  }
}

const resolveOriginForRole = (role: UserRole): StoryOrigin => (role === 'ADMIN' ? 'OFFICIAL' : 'COMMUNITY')

const compareNewestStory = (left: StoryCandidate, right: StoryCandidate) => {
  const leftTime = left.publishedAt?.getTime() ?? left.createdAt.getTime()
  const rightTime = right.publishedAt?.getTime() ?? right.createdAt.getTime()
  if (leftTime !== rightTime) {
    return rightTime - leftTime
  }

  return right.id.localeCompare(left.id)
}

const selectDefaultStoryId = (input: {
  officialListing: boolean
  stories: StoryCandidate[]
}) => {
  const orderedStories = [...input.stories].sort(compareNewestStory)
  if (input.officialListing) {
    const officialStory = orderedStories.find((story) => story.origin === 'OFFICIAL')
    if (officialStory) {
      return officialStory.id
    }
  }

  return orderedStories[0]?.id ?? null
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.mode === 'apply' && args.confirm !== APPLY_CONFIRMATION_TOKEN) {
    throw new Error(`Apply mode requires --confirm=${APPLY_CONFIRMATION_TOKEN}.`)
  }

  assertPostgresDatabaseUrl()

  const prisma = new PrismaClient()
  try {
    const [storyRows, characterRows] = await Promise.all([
      prisma.storyPost.findMany({
        select: {
          id: true,
          origin: true,
          author: {
            select: {
              role: true
            }
          }
        }
      }),
      prisma.character.findMany({
        select: {
          id: true,
          name: true,
          officialListing: true,
          defaultStoryId: true,
          storyPosts: {
            where: {
              publicationStatus: 'PUBLISHED',
              moderationStatus: 'APPROVED'
            },
            select: {
              id: true,
              origin: true,
              author: {
                select: {
                  role: true
                }
              },
              publishedAt: true,
              createdAt: true
            }
          }
        }
      })
    ])

    const originChanges = storyRows
      .map((story) => ({
        storyId: story.id,
        currentOrigin: story.origin,
        targetOrigin: resolveOriginForRole(story.author.role)
      }))
      .filter((story) => story.currentOrigin !== story.targetOrigin)

    const defaultChanges = characterRows
      .map((character) => {
        const targetDefaultStoryId = selectDefaultStoryId({
          officialListing: character.officialListing,
          stories: character.storyPosts.map((story) => ({
            id: story.id,
            origin: resolveOriginForRole(story.author.role),
            publishedAt: story.publishedAt,
            createdAt: story.createdAt
          }))
        })

        return {
          characterId: character.id,
          characterName: character.name,
          currentDefaultStoryId: character.defaultStoryId,
          targetDefaultStoryId,
          approvedPublishedStoryCount: character.storyPosts.length
        }
      })
      .filter((character) => character.currentDefaultStoryId !== character.targetDefaultStoryId)

    const report = {
      mode: args.mode,
      generatedAt: new Date().toISOString(),
      storyCount: storyRows.length,
      characterCount: characterRows.length,
      originChangeCount: originChanges.length,
      defaultChangeCount: defaultChanges.length,
      charactersWithoutApprovedPublishedStories: characterRows
        .filter((character) => character.storyPosts.length === 0)
        .map((character) => ({
          characterId: character.id,
          characterName: character.name
        })),
      originChanges,
      defaultChanges
    }

    if (args.mode === 'apply') {
      await prisma.$transaction(async (tx) => {
        await tx.storyPost.updateMany({
          where: {
            author: {
              role: 'ADMIN'
            },
            origin: {
              not: 'OFFICIAL'
            }
          },
          data: {
            origin: 'OFFICIAL'
          }
        })
        await tx.storyPost.updateMany({
          where: {
            author: {
              role: {
                not: 'ADMIN'
              }
            },
            origin: {
              not: 'COMMUNITY'
            }
          },
          data: {
            origin: 'COMMUNITY'
          }
        })

        for (const change of defaultChanges) {
          await tx.character.update({
            where: {
              id: change.characterId
            },
            data: {
              defaultStoryId: change.targetDefaultStoryId
            },
            select: {
              id: true
            }
          })
        }
      })
    }

    const reportPath =
      args.reportPath ??
      path.join(process.cwd(), 'tmp', `story-origin-defaults-${Date.now()}.json`)
    await fs.mkdir(path.dirname(reportPath), { recursive: true })
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))

    console.log(
      [
        `Story origin/default backfill ${args.mode} complete.`,
        `Stories scanned: ${report.storyCount}. Origin changes: ${report.originChangeCount}.`,
        `Characters scanned: ${report.characterCount}. Default changes: ${report.defaultChangeCount}.`,
        `Characters without approved published stories: ${report.charactersWithoutApprovedPublishedStories.length}.`,
        `Report: ${reportPath}`
      ].join('\n')
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
