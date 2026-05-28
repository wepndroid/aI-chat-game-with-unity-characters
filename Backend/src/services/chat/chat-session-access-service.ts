import { prisma } from '../../lib/prisma'

const SOFT_DELETED_SESSION_PREVIEW_TEXT = '__session_deleted__'

type OwnedActiveChatSession = {
  id: string
  userId: string
  storyId: string
  characterId: string
}

/**
 * Shared ownership gate for Unity chat-session endpoints.
 *
 * 12D makes session deletion a hard delete. Ownership checks therefore only
 * need to prove that the row still exists for the authenticated user; transcript
 * rows and Unity session state cascade from the deleted session while quota
 * ledger rows survive independently.
 */
const findOwnedActiveChatSession = async (input: {
  sessionId: string
  userId: string
}): Promise<OwnedActiveChatSession | null> => {
  return prisma.chatSession.findFirst({
    where: {
      id: input.sessionId,
      userId: input.userId
    },
    select: {
      id: true,
      userId: true,
      storyId: true,
      characterId: true
    }
  })
}

const cleanupSoftDeletedChatSessions = async () => {
  await prisma.chatSession.deleteMany({
    where: {
      previewText: SOFT_DELETED_SESSION_PREVIEW_TEXT
    }
  })
}

export { cleanupSoftDeletedChatSessions, findOwnedActiveChatSession }
export type { OwnedActiveChatSession }
