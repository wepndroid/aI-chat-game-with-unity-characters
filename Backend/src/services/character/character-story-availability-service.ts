import { prisma } from '../../lib/prisma'

type CharacterStoryAvailability = {
  hasPlayableStory: boolean
  defaultStoryId: string | null
}

type CharacterStoryAvailabilityPrismaClient = {
  character: {
    findUnique: (args: {
      where: {
        id: string
      }
      select: {
        defaultStoryId: true
        defaultStory: {
          select: {
            id: true
            characterId: true
            publicationStatus: true
            moderationStatus: true
          }
        }
      }
    }) => Promise<{
      defaultStoryId: string | null
      defaultStory: {
        id: string
        characterId: string
        publicationStatus: 'DRAFT' | 'PUBLISHED'
        moderationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
      } | null
    } | null>
  }
  storyPost: {
    count: (args: {
      where: {
        characterId: string
        publicationStatus: 'PUBLISHED'
        moderationStatus: 'APPROVED'
      }
    }) => Promise<number>
    findFirst: (args: {
      where: {
        characterId: string
        publicationStatus: 'PUBLISHED'
        moderationStatus: 'APPROVED'
      }
      orderBy: Array<{ publishedAt: 'desc' } | { createdAt: 'desc' }>
      select: {
        id: true
      }
    }) => Promise<{ id: string } | null>
  }
}

type CharacterStoryAvailabilityDependencies = {
  prismaClient?: CharacterStoryAvailabilityPrismaClient
}

const playableStoryOrderBy = [{ publishedAt: 'desc' }, { createdAt: 'desc' }] as const

const buildPlayableStoryWhere = (characterId: string) => ({
  characterId,
  publicationStatus: 'PUBLISHED' as const,
  moderationStatus: 'APPROVED' as const
})

const resolveCharacterStoryAvailability = async (
  characterId: string,
  dependencies: CharacterStoryAvailabilityDependencies = {}
): Promise<CharacterStoryAvailability> => {
  const prismaClient: CharacterStoryAvailabilityPrismaClient = dependencies.prismaClient ?? prisma
  const [character, playableStoryCount] = await Promise.all([
    prismaClient.character.findUnique({
      where: {
        id: characterId
      },
      select: {
        defaultStoryId: true,
        defaultStory: {
          select: {
            id: true,
            characterId: true,
            publicationStatus: true,
            moderationStatus: true
          }
        }
      }
    }),
    prismaClient.storyPost.count({
      where: buildPlayableStoryWhere(characterId)
    })
  ])
  const defaultStory = character?.defaultStory
  const defaultStoryId =
    defaultStory &&
    defaultStory.characterId === characterId &&
    defaultStory.publicationStatus === 'PUBLISHED' &&
    defaultStory.moderationStatus === 'APPROVED'
      ? defaultStory.id
      : null

  return {
    hasPlayableStory: playableStoryCount > 0,
    defaultStoryId
  }
}

const selectNewestPlayableStoryForCharacter = async (
  characterId: string,
  dependencies: CharacterStoryAvailabilityDependencies = {}
) => {
  const prismaClient: CharacterStoryAvailabilityPrismaClient = dependencies.prismaClient ?? prisma

  return prismaClient.storyPost.findFirst({
    where: buildPlayableStoryWhere(characterId),
    orderBy: [...playableStoryOrderBy],
    select: {
      id: true
    }
  })
}

export {
  buildPlayableStoryWhere,
  playableStoryOrderBy,
  resolveCharacterStoryAvailability,
  selectNewestPlayableStoryForCharacter
}
export type {
  CharacterStoryAvailability,
  CharacterStoryAvailabilityDependencies,
  CharacterStoryAvailabilityPrismaClient
}
