import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveStoryLaunchPayload } from './story-launch-payload-service'

const authUser = {
  userId: 'user-1',
  role: 'USER' as const,
  isEmailVerified: true
}

test('resolveStoryLaunchPayload returns the Unity story DTO with user-specific flags', async () => {
  const result = await resolveStoryLaunchPayload(authUser, 'story-1', 'character-1', {
    prismaClient: {
      storyPost: {
        findUnique: async () => ({
          id: 'story-1',
          title: 'Story title',
          promptDescription: 'Prompt',
          personality: 'Kind',
          scenario: 'Cafe',
          firstMessage: 'Hi',
          scenarioType: 'romance',
          origin: 'OFFICIAL',
          publishedAt: new Date('2026-05-08T11:00:00.000Z'),
          likesCount: 3,
          author: {
            id: 'author-1',
            username: 'author'
          }
        }),
        count: async () => 1,
        findFirst: async () => null
      },
      character: {
        findUnique: async () => ({
          defaultStoryId: 'story-1',
          defaultStory: {
            id: 'story-1',
            characterId: 'character-1',
            publicationStatus: 'PUBLISHED',
            moderationStatus: 'APPROVED'
          }
        })
      },
      storyPostLike: {
        findUnique: async () => ({
          id: 'like-1'
        })
      }
    } as never
  })

  assert.deepEqual(result, {
    id: 'story-1',
    title: 'Story title',
    prompt_description: 'Prompt',
    personality: 'Kind',
    scenario: 'Cafe',
    first_message: 'Hi',
    scenario_type: 'romance',
    published_at: '2026-05-08T11:00:00.000Z',
    likes_count: 3,
    has_liked: true,
    origin: 'OFFICIAL',
    is_default: true,
    author: {
      id: 'author-1',
      username: 'author'
    }
  })
})

test('resolveStoryLaunchPayload returns null for a missing story without extra reads', async () => {
  let availabilityReads = 0
  let likeReads = 0

  const result = await resolveStoryLaunchPayload(authUser, 'missing-story', 'character-1', {
    prismaClient: {
      storyPost: {
        findUnique: async () => null,
        count: async () => 0,
        findFirst: async () => null
      },
      character: {
        findUnique: async () => {
          availabilityReads += 1
          return null
        }
      },
      storyPostLike: {
        findUnique: async () => {
          likeReads += 1
          return null
        }
      }
    } as never
  })

  assert.equal(result, null)
  assert.equal(availabilityReads, 0)
  assert.equal(likeReads, 0)
})
