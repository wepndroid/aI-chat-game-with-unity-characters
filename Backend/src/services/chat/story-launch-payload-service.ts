import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { resolveCharacterStoryAvailability } from '../character/character-story-availability-service'
import type { StorySessionAuthUser } from './story-session-context-service'

type StoryLaunchPayload = {
  id: string
  title: string
  prompt_description: string | null
  personality: string | null
  scenario: string | null
  first_message: string | null
  scenario_type: string | null
  origin: string
  published_at: string | null
  likes_count: number
  has_liked: boolean
  is_default: boolean
  author: {
    id: string
    username: string
  }
}

type StoryLaunchPayloadPrismaClient = Pick<Prisma.TransactionClient, 'character' | 'storyPost' | 'storyPostLike'>

type StoryLaunchPayloadDependencies = {
  prismaClient?: StoryLaunchPayloadPrismaClient
}

/**
 * Builds the Unity story DTO used by WebGL launch bootstrap. Authorization is
 * owned by `resolveStorySessionContext`; this serializer only reads the
 * already-validated story and computes per-user presentation flags.
 */
const resolveStoryLaunchPayload = async (
  authUser: StorySessionAuthUser,
  storyId: string,
  characterId: string,
  dependencies: StoryLaunchPayloadDependencies = {}
): Promise<StoryLaunchPayload | null> => {
  const prismaClient = dependencies.prismaClient ?? prisma

  const story = await prismaClient.storyPost.findUnique({
    where: {
      id: storyId
    },
    select: {
      id: true,
      title: true,
      promptDescription: true,
      personality: true,
      scenario: true,
      firstMessage: true,
      scenarioType: true,
      origin: true,
      publishedAt: true,
      likesCount: true,
      author: {
        select: {
          id: true,
          username: true
        }
      }
    }
  })

  if (!story) {
    return null
  }

  const storyAvailability = await resolveCharacterStoryAvailability(characterId, { prismaClient })
  const likedStory = await prismaClient.storyPostLike.findUnique({
    where: {
      userId_storyId: {
        userId: authUser.userId,
        storyId
      }
    },
    select: {
      id: true
    }
  })

  return {
    id: story.id,
    title: story.title,
    prompt_description: story.promptDescription,
    personality: story.personality,
    scenario: story.scenario,
    first_message: story.firstMessage,
    scenario_type: story.scenarioType,
    origin: story.origin,
    published_at: story.publishedAt?.toISOString() ?? null,
    likes_count: story.likesCount,
    has_liked: Boolean(likedStory),
    is_default: story.id === storyAvailability.defaultStoryId,
    author: {
      id: story.author.id,
      username: story.author.username
    }
  }
}

export { resolveStoryLaunchPayload }
export type { StoryLaunchPayload, StoryLaunchPayloadDependencies }
