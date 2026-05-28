import test from 'node:test'
import assert from 'node:assert/strict'
import { createStoryChatSession, serializeSessionItem } from './story-chat-session-service'

const authUser = {
  userId: 'user-1',
  role: 'USER' as const,
  isEmailVerified: true
}

const storyContext = {
  story: {
    id: 'story-1',
    authorId: 'author-1',
    characterId: 'character-1',
    publicationStatus: 'PUBLISHED' as const,
    moderationStatus: 'APPROVED' as const
  },
  character: {
    id: 'character-1',
    ownerId: 'owner-1',
    status: 'APPROVED' as const,
    visibility: 'PUBLIC' as const,
    isPatreonGated: false
  }
}

test('createStoryChatSession creates a normal session from validated story context', async () => {
  const createCalls: unknown[] = []

  const result = await createStoryChatSession(authUser, 'story-1', {
    prismaClient: {
      chatSession: {
        create: async (input: unknown) => {
          createCalls.push(input)
          return {
            id: 'session-1',
            userId: 'user-1',
            storyId: 'story-1',
            characterId: 'character-1',
            createdAt: new Date('2026-05-08T12:00:00.000Z'),
            lastUpdatedAt: new Date('2026-05-08T12:00:00.000Z'),
            previewText: null
          }
        }
      }
    } as never,
    now: () => new Date('2026-05-08T12:00:00.000Z'),
    storySessionContextResolver: async () => ({
      ok: true as const,
      data: storyContext
    })
  })

  assert.equal(result.ok, true)
  assert.equal(createCalls.length, 1)
  assert.deepEqual(createCalls[0], {
    data: {
      userId: 'user-1',
      characterId: 'character-1',
      storyId: 'story-1',
      lastUpdatedAt: new Date('2026-05-08T12:00:00.000Z'),
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
  if (result.ok) {
    assert.deepEqual(result.data.context, storyContext)
    assert.deepEqual(result.data.session, {
      id: 'session-1',
      user_id: 'user-1',
      story_id: 'story-1',
      character_id: 'character-1',
      created_at: '2026-05-08T12:00:00.000Z',
      last_updated: '2026-05-08T12:00:00.000Z',
      preview_text: null
    })
  }
})

test('createStoryChatSession rejects inaccessible stories before creating a session', async () => {
  const createCalls: unknown[] = []

  const result = await createStoryChatSession(authUser, 'private-story', {
    prismaClient: {
      chatSession: {
        create: async (input: unknown) => {
          createCalls.push(input)
          return input
        }
      }
    } as never,
    storySessionContextResolver: async () => ({
      ok: false as const,
      error: {
        status: 404 as const,
        code: 'STORY_NOT_FOUND' as const,
        message: 'Story not found.'
      }
    })
  })

  assert.equal(result.ok, false)
  assert.equal(createCalls.length, 0)
  if (!result.ok) {
    assert.equal(result.error.code, 'STORY_NOT_FOUND')
  }
})

test('serializeSessionItem maps database rows to the Unity session DTO shape', () => {
  assert.deepEqual(
    serializeSessionItem({
      id: 'session-1',
      userId: 'user-1',
      storyId: 'story-1',
      characterId: 'character-1',
      createdAt: new Date('2026-05-08T12:00:00.000Z'),
      lastUpdatedAt: new Date('2026-05-08T12:01:00.000Z'),
      previewText: 'Hello'
    }),
    {
      id: 'session-1',
      user_id: 'user-1',
      story_id: 'story-1',
      character_id: 'character-1',
      created_at: '2026-05-08T12:00:00.000Z',
      last_updated: '2026-05-08T12:01:00.000Z',
      preview_text: 'Hello'
    }
  )
})
