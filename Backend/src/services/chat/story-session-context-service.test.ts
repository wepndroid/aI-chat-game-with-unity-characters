import test from 'node:test'
import assert from 'node:assert/strict'
import type { StoryModerationStatus, StoryPublicationStatus } from '@prisma/client'
import { resolveStorySessionContext } from './story-session-context-service'

const authUser = {
  userId: 'user-1',
  role: 'USER' as const,
  isEmailVerified: true
}

type FakeStory = {
  id: string
  authorId: string
  characterId: string
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
}

const defaultStory: FakeStory = {
  id: 'story-1',
  authorId: 'author-1',
  characterId: 'character-1',
  publicationStatus: 'PUBLISHED' as const,
  moderationStatus: 'APPROVED' as const
}

const defaultCharacter = {
  id: 'character-1',
  ownerId: 'owner-1',
  status: 'APPROVED' as const,
  visibility: 'PUBLIC' as const,
  isPatreonGated: false
}

const allowAccess = async () => ({
  canListCharacter: true,
  canReadCharacter: true,
  canAccessPrivateOrUnlisted: false,
  canCreateCharacter: true,
  canModerateCharacterStatus: false,
  canStartChat: true,
  startChatRequiresAuth: false,
  startChatRequiresVerifiedEmail: false,
  startChatUnavailableReason: null,
  canPreviewModel: true,
  previewModelRequiresAuth: false,
  previewModelRequiresVerifiedEmail: false,
  previewModelUnavailableReason: null
})

const denyReadAccess = async () => ({
  canListCharacter: false,
  canReadCharacter: false,
  canAccessPrivateOrUnlisted: false,
  canCreateCharacter: true,
  canModerateCharacterStatus: false,
  canStartChat: false,
  startChatRequiresAuth: false,
  startChatRequiresVerifiedEmail: false,
  startChatUnavailableReason: 'NOT_APPROVED' as const,
  canPreviewModel: false,
  previewModelRequiresAuth: false,
  previewModelRequiresVerifiedEmail: false,
  previewModelUnavailableReason: 'NOT_APPROVED' as const
})

const denyUnverifiedChatAccess = async () => ({
  canListCharacter: true,
  canReadCharacter: true,
  canAccessPrivateOrUnlisted: false,
  canCreateCharacter: true,
  canModerateCharacterStatus: false,
  canStartChat: false,
  startChatRequiresAuth: false,
  startChatRequiresVerifiedEmail: true,
  startChatUnavailableReason: 'EMAIL_VERIFICATION_REQUIRED' as const,
  canPreviewModel: false,
  previewModelRequiresAuth: false,
  previewModelRequiresVerifiedEmail: true,
  previewModelUnavailableReason: 'EMAIL_VERIFICATION_REQUIRED' as const
})

const denyMembershipChatAccess = async () => ({
  canListCharacter: true,
  canReadCharacter: true,
  canAccessPrivateOrUnlisted: false,
  canCreateCharacter: true,
  canModerateCharacterStatus: false,
  canStartChat: false,
  startChatRequiresAuth: false,
  startChatRequiresVerifiedEmail: false,
  startChatUnavailableReason: 'MEMBERSHIP_REQUIRED' as const,
  canPreviewModel: true,
  previewModelRequiresAuth: false,
  previewModelRequiresVerifiedEmail: false,
  previewModelUnavailableReason: null
})

const createPrismaClient = (input: {
  story?: FakeStory | null
  character?: typeof defaultCharacter | null
  calls?: { storyFinds: number; characterFinds: number }
}) => {
  const calls = input.calls ?? { storyFinds: 0, characterFinds: 0 }

  return {
    storyPost: {
      findUnique: async () => {
        calls.storyFinds += 1
        return input.story ?? null
      }
    },
    character: {
      findUnique: async () => {
        calls.characterFinds += 1
        return input.character ?? null
      }
    }
  }
}

test('resolveStorySessionContext hides missing stories as not found', async () => {
  const result = await resolveStorySessionContext(authUser, 'missing-story', {
    prismaClient: createPrismaClient({ story: null }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 404)
    assert.equal(result.error.code, 'STORY_NOT_FOUND')
    assert.equal(result.error.message, 'Story not found.')
  }
})

test('resolveStorySessionContext hides unpublished stories from other users', async () => {
  const calls = { storyFinds: 0, characterFinds: 0 }
  const result = await resolveStorySessionContext(authUser, 'draft-story', {
    prismaClient: createPrismaClient({
      story: {
        ...defaultStory,
        authorId: 'other-user',
        publicationStatus: 'DRAFT',
        moderationStatus: 'NONE'
      },
      calls
    }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, false)
  assert.equal(calls.characterFinds, 0)
  if (!result.ok) {
    assert.equal(result.error.status, 404)
    assert.equal(result.error.code, 'STORY_NOT_FOUND')
    assert.equal(result.error.message, 'Story not found.')
  }
})

test('resolveStorySessionContext allows the story author to use a draft story', async () => {
  const result = await resolveStorySessionContext({ ...authUser, userId: 'author-1' }, 'draft-story', {
    prismaClient: createPrismaClient({
      story: {
        ...defaultStory,
        publicationStatus: 'DRAFT',
        moderationStatus: 'NONE'
      },
      character: defaultCharacter
    }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.story.id, 'story-1')
    assert.equal(result.data.character.id, 'character-1')
  }
})

test('resolveStorySessionContext rejects stories without character links', async () => {
  const result = await resolveStorySessionContext(authUser, 'story-without-character', {
    prismaClient: createPrismaClient({
      story: {
        ...defaultStory,
        characterId: ''
      }
    }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 400)
    assert.equal(result.error.code, 'STORY_NOT_LINKED_TO_CHARACTER')
    assert.equal(result.error.message, 'This story is not linked to a character.')
  }
})

test('resolveStorySessionContext rejects missing characters', async () => {
  const result = await resolveStorySessionContext(authUser, 'story-1', {
    prismaClient: createPrismaClient({
      story: defaultStory,
      character: null
    }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 404)
    assert.equal(result.error.code, 'CHARACTER_NOT_FOUND')
    assert.equal(result.error.message, 'Character not found.')
  }
})

test('resolveStorySessionContext rejects unreadable characters', async () => {
  const result = await resolveStorySessionContext(authUser, 'story-1', {
    prismaClient: createPrismaClient({
      story: defaultStory,
      character: defaultCharacter
    }) as never,
    characterAccessResolver: denyReadAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 404)
    assert.equal(result.error.code, 'CHARACTER_NOT_FOUND')
    assert.equal(result.error.message, 'Character not found.')
  }
})

test('resolveStorySessionContext rejects email-unverified users before chat launch', async () => {
  const result = await resolveStorySessionContext({ ...authUser, isEmailVerified: false }, 'story-1', {
    prismaClient: createPrismaClient({
      story: defaultStory,
      character: defaultCharacter
    }) as never,
    characterAccessResolver: denyUnverifiedChatAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 403)
    assert.equal(result.error.code, 'EMAIL_VERIFICATION_REQUIRED')
    assert.equal(result.error.message, 'Email verification is required before starting chat.')
  }
})

test('resolveStorySessionContext rejects free-tier users before chat launch', async () => {
  const result = await resolveStorySessionContext({ ...authUser, canAccessGame: false }, 'story-1', {
    prismaClient: createPrismaClient({
      story: defaultStory,
      character: defaultCharacter
    }) as never,
    characterAccessResolver: denyMembershipChatAccess
  })

  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.error.status, 403)
    assert.equal(result.error.code, 'MEMBERSHIP_REQUIRED')
    assert.equal(result.error.message, 'Start a membership first to play SecretWaifu.')
  }
})

test('resolveStorySessionContext returns story and character on success', async () => {
  const result = await resolveStorySessionContext(authUser, 'story-1', {
    prismaClient: createPrismaClient({
      story: defaultStory,
      character: defaultCharacter
    }) as never,
    characterAccessResolver: allowAccess
  })

  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.data.story, defaultStory)
    assert.deepEqual(result.data.character, defaultCharacter)
  }
})
