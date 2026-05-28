import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  resolveStorySessionContext,
  type StorySessionAuthUser,
  type StorySessionContext,
  type StorySessionContextError,
  type StorySessionContextResult
} from './story-session-context-service'

type StoryChatSessionRow = {
  id: string
  userId: string
  storyId: string
  characterId: string
  createdAt: Date
  lastUpdatedAt: Date
  previewText: string | null
}

type StoryChatSessionItem = {
  id: string
  user_id: string
  story_id: string
  character_id: string
  created_at: string
  last_updated: string
  preview_text: string | null
}

type StoryChatSessionCreateSuccess = {
  context: StorySessionContext
  session: StoryChatSessionItem
}

type StoryChatSessionCreateResult =
  | { ok: true; data: StoryChatSessionCreateSuccess }
  | { ok: false; error: StorySessionContextError }

type StoryChatSessionPrismaClient = Pick<Prisma.TransactionClient, 'chatSession'>

type StorySessionContextResolver = (
  authUser: StorySessionAuthUser,
  storyId: string,
  dependencies?: { prismaClient?: Prisma.TransactionClient }
) => Promise<StorySessionContextResult>

type StoryChatSessionDependencies = {
  prismaClient?: StoryChatSessionPrismaClient & Partial<Prisma.TransactionClient>
  storySessionContextResolver?: StorySessionContextResolver
  now?: () => Date
}

const serializeSessionItem = (sessionRow: StoryChatSessionRow): StoryChatSessionItem => ({
  id: sessionRow.id,
  user_id: sessionRow.userId,
  story_id: sessionRow.storyId,
  character_id: sessionRow.characterId,
  created_at: sessionRow.createdAt.toISOString(),
  last_updated: sessionRow.lastUpdatedAt.toISOString(),
  preview_text: sessionRow.previewText
})

/**
 * Creates the normal story-bound chat session used by both `/api/sessions`
 * and WebGL launch resolution, so launch-created sessions cannot drift from
 * the standard authorization and persistence semantics.
 */
const createStoryChatSession = async (
  authUser: StorySessionAuthUser,
  storyId: string,
  dependencies: StoryChatSessionDependencies = {}
): Promise<StoryChatSessionCreateResult> => {
  const prismaClient = dependencies.prismaClient ?? prisma
  const contextResolver = dependencies.storySessionContextResolver ?? resolveStorySessionContext
  const now = dependencies.now ?? (() => new Date())

  const context = await contextResolver(authUser, storyId, {
    prismaClient: prismaClient as Prisma.TransactionClient
  })

  if (!context.ok) {
    return context
  }

  const created = await prismaClient.chatSession.create({
    data: {
      userId: authUser.userId,
      characterId: context.data.character.id,
      storyId: context.data.story.id,
      lastUpdatedAt: now(),
      previewText: null
    },
    select: {
      id: true,
      userId: true,
      storyId: true,
      characterId: true,
      createdAt: true,
      lastUpdatedAt: true,
      previewText: true
    }
  })

  return {
    ok: true,
    data: {
      context: context.data,
      session: serializeSessionItem(created)
    }
  }
}

export { createStoryChatSession, serializeSessionItem }
export type {
  StoryChatSessionCreateResult,
  StoryChatSessionCreateSuccess,
  StoryChatSessionDependencies,
  StoryChatSessionItem,
  StoryChatSessionRow
}
