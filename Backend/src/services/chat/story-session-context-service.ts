import type {
  CharacterStatus,
  CharacterVisibility,
  Prisma,
  StoryModerationStatus,
  StoryPublicationStatus,
  UserRole
} from '@prisma/client'
import { prisma } from '../../lib/prisma'
import {
  resolveCharacterAccess,
  type CharacterAccessSubject,
  type ResolvedCharacterAccess
} from '../character/character-access-policy'

type StorySessionAuthUser = {
  userId: string
  role: UserRole
  isEmailVerified: boolean
  canAccessGame?: boolean
}

type StorySessionContext = {
  story: {
    id: string
    authorId: string
    characterId: string
    publicationStatus: StoryPublicationStatus
    moderationStatus: StoryModerationStatus
  }
  character: {
    id: string
    ownerId: string
    status: CharacterStatus
    visibility: CharacterVisibility
    isPatreonGated: boolean
  }
}

type StorySessionCharacterRow = {
  id: string
  ownerId: string
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
}

type StorySessionContextErrorCode =
  | 'STORY_NOT_FOUND'
  | 'STORY_NOT_LINKED_TO_CHARACTER'
  | 'CHARACTER_NOT_FOUND'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'MEMBERSHIP_REQUIRED'
  | 'CHARACTER_NOT_AVAILABLE_FOR_CHAT'

type StorySessionContextError = {
  status: 400 | 403 | 404
  code: StorySessionContextErrorCode
  message: string
}

type StorySessionContextResult =
  | { ok: true; data: StorySessionContext }
  | { ok: false; error: StorySessionContextError }

type StorySessionPrismaClient = Pick<Prisma.TransactionClient, 'storyPost' | 'character'>

type StoryCharacterAccessResolver = (
  actor: StorySessionAuthUser,
  character: CharacterAccessSubject,
  context: { hasPlayableStory: boolean }
) => ResolvedCharacterAccess | Promise<ResolvedCharacterAccess>

type StorySessionContextDependencies = {
  prismaClient?: StorySessionPrismaClient
  characterAccessResolver?: StoryCharacterAccessResolver
}

const storyNotFoundError: StorySessionContextError = {
  status: 404,
  code: 'STORY_NOT_FOUND',
  message: 'Story not found.'
}

const canReadStoryForChat = (
  story: {
    authorId: string
    publicationStatus: StoryPublicationStatus
    moderationStatus: StoryModerationStatus
  },
  authUser: StorySessionAuthUser
) => {
  if (authUser.role === 'ADMIN') {
    return true
  }

  if (story.authorId === authUser.userId) {
    return true
  }

  return story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'
}

const resolveStorySessionContext = async (
  authUser: StorySessionAuthUser,
  storyId: string,
  dependencies: StorySessionContextDependencies = {}
): Promise<StorySessionContextResult> => {
  const prismaClient = dependencies.prismaClient ?? prisma
  const characterAccessResolver = dependencies.characterAccessResolver ?? resolveCharacterAccess

  const story = await prismaClient.storyPost.findUnique({
    where: {
      id: storyId
    },
    select: {
      id: true,
      authorId: true,
      characterId: true,
      publicationStatus: true,
      moderationStatus: true
    }
  })

  if (!story || !canReadStoryForChat(story, authUser)) {
    return {
      ok: false,
      error: storyNotFoundError
    }
  }

  if (!story.characterId) {
    return {
      ok: false,
      error: {
        status: 400,
        code: 'STORY_NOT_LINKED_TO_CHARACTER',
        message: 'This story is not linked to a character.'
      }
    }
  }

  const character: StorySessionCharacterRow | null = await prismaClient.character.findUnique({
    where: {
      id: story.characterId
    },
    select: {
      id: true,
      ownerId: true,
      status: true,
      visibility: true,
      isPatreonGated: true
    }
  })

  if (!character) {
    return {
      ok: false,
      error: {
        status: 404,
        code: 'CHARACTER_NOT_FOUND',
        message: 'Character not found.'
      }
    }
  }

  const access = await characterAccessResolver(
    {
      userId: authUser.userId,
      role: authUser.role,
      isEmailVerified: authUser.isEmailVerified
    },
    character,
    {
      hasPlayableStory: true,
      canAccessGame: authUser.canAccessGame
    }
  )

  if (!access.canReadCharacter) {
    return {
      ok: false,
      error: {
        status: 404,
        code: 'CHARACTER_NOT_FOUND',
        message: 'Character not found.'
      }
    }
  }

  if (!access.canStartChat) {
    if (access.startChatRequiresVerifiedEmail) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'EMAIL_VERIFICATION_REQUIRED',
          message: 'Email verification is required before starting chat.'
        }
      }
    }

    if (access.startChatUnavailableReason === 'MEMBERSHIP_REQUIRED') {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'MEMBERSHIP_REQUIRED',
          message: 'Start a membership first to play SecretWaifu.'
        }
      }
    }

    return {
      ok: false,
      error: {
        status: 403,
        code: 'CHARACTER_NOT_AVAILABLE_FOR_CHAT',
        message: 'This character is not available for chat.'
      }
    }
  }

  return {
    ok: true,
    data: {
      story: {
        id: story.id,
        authorId: story.authorId,
        characterId: story.characterId,
        publicationStatus: story.publicationStatus,
        moderationStatus: story.moderationStatus
      },
      character
    }
  }
}

const mapStorySessionContextErrorToApiCode = (error: StorySessionContextError) => {
  if (error.status === 404) {
    return 'NOT_FOUND' as const
  }

  if (error.code === 'EMAIL_VERIFICATION_REQUIRED' || error.code === 'MEMBERSHIP_REQUIRED') {
    return error.code
  }

  if (error.status === 403) {
    return 'FORBIDDEN' as const
  }

  return 'BAD_REQUEST' as const
}

export { canReadStoryForChat, mapStorySessionContextErrorToApiCode, resolveStorySessionContext }
export type {
  StorySessionAuthUser,
  StorySessionContext,
  StorySessionContextError,
  StorySessionContextResult
}
