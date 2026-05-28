import { ChatMessageRole } from '@prisma/client'

import { prisma } from '../../../lib/prisma'
import { type VisibleChatContext } from './visible-chat-prompt-types'

const MAX_HISTORY_ROWS = 30

const displayNameFromUser = (user: { playerName: string | null; username: string | null; email: string } | null) => {
  const playerName = user?.playerName?.trim()
  if (playerName) {
    return playerName
  }

  const username = user?.username?.trim()
  if (username) {
    return username
  }

  const emailName = user?.email?.split('@')[0]?.trim()
  return emailName || 'Player'
}

const displayNameFromStoryCharacter = (character: { name: string | null } | null | undefined) =>
  character?.name?.trim() || 'the character'

/**
 * Reads backend-owned story, player, and transcript context for visible chat.
 * Prisma queries stay here so prompt rendering can remain a pure translation
 * step from bounded data into provider-ready messages.
 */
const loadVisibleChatContext = async (input: {
  sessionId: string
  storyId: string
  userId: string
}): Promise<VisibleChatContext> => {
  const [storyContext, user, historyRows] = await Promise.all([
    prisma.storyPost.findUnique({
      where: { id: input.storyId },
      select: {
        title: true,
        promptDescription: true,
        personality: true,
        scenarioStory: true,
        scenarioChat: true,
        firstMessage: true,
        character: {
          select: {
            name: true
          }
        }
      }
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        playerName: true,
        username: true,
        email: true
      }
    }),
    prisma.chatMessage.findMany({
      where: {
        sessionId: input.sessionId,
        role: {
          in: [ChatMessageRole.USER, ChatMessageRole.ASSISTANT]
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: MAX_HISTORY_ROWS,
      select: {
        role: true,
        content: true
      }
    })
  ])

  return {
    story: {
      characterName: displayNameFromStoryCharacter(storyContext?.character),
      playerName: displayNameFromUser(user),
      title: storyContext?.title ?? null,
      promptDescription: storyContext?.promptDescription ?? null,
      personality: storyContext?.personality ?? null,
      scenarioStory: storyContext?.scenarioStory ?? null,
      scenarioChat: storyContext?.scenarioChat ?? null,
      firstMessage: storyContext?.firstMessage ?? null
    },
    historyRows: historyRows.slice().reverse()
  }
}

export { displayNameFromStoryCharacter, loadVisibleChatContext }
