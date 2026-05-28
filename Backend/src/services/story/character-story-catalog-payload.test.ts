import test from 'node:test'
import assert from 'node:assert/strict'
import { toCharacterStoryCatalogPayload } from './character-story-catalog-payload'

test('toCharacterStoryCatalogPayload preserves the Unity snake_case story contract', () => {
  const payload = toCharacterStoryCatalogPayload(
    {
      id: 'story-1',
      title: 'Story title',
      promptDescription: 'Prompt description',
      personality: 'Kind',
      scenario: 'Cafe',
      firstMessage: 'Hello',
      scenarioType: 'romance',
      origin: 'OFFICIAL',
      publicationStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      moderationRejectReason: null,
      publishedAt: new Date('2026-05-12T08:00:00.000Z'),
      likesCount: 7,
      author: {
        id: 'author-1',
        username: 'author'
      }
    },
    {
      hasLiked: true,
      isDefault: true
    }
  )

  assert.deepEqual(payload, {
    id: 'story-1',
    title: 'Story title',
    prompt_description: 'Prompt description',
    personality: 'Kind',
    scenario: 'Cafe',
    first_message: 'Hello',
    scenario_type: 'romance',
    origin: 'OFFICIAL',
    publication_status: 'PUBLISHED',
    moderation_status: 'APPROVED',
    moderation_reject_reason: null,
    published_at: '2026-05-12T08:00:00.000Z',
    likes_count: 7,
    has_liked: true,
    is_default: true,
    author: {
      id: 'author-1',
      username: 'author'
    }
  })
  assert.equal(Object.hasOwn(payload, 'promptDescription'), false)
  assert.equal(Object.hasOwn(payload, 'firstMessage'), false)
  assert.equal(Object.hasOwn(payload, 'likesCount'), false)
  assert.equal(Object.hasOwn(payload, 'hasLiked'), false)
})
