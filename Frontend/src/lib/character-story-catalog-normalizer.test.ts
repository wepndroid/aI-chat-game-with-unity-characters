import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCharacterStoryCatalogResponse } from './character-story-catalog-normalizer'

test('normalizeCharacterStoryCatalogResponse maps Unity snake_case stories to frontend camelCase records', () => {
  const normalized = normalizeCharacterStoryCatalogResponse({
    data: {
      character: {
        id: 'character-1',
        slug: 'meiko',
        name: 'Meiko Shikari',
        default_story_id: 'story-1'
      },
      stories: [
        {
          id: 'story-1',
          title: 'Story title',
          prompt_description: 'Prompt description',
          personality: 'Strict',
          scenario: 'Academy',
          first_message: 'Stand up.',
          scenario_type: 'roleplay',
          publication_status: 'PUBLISHED',
          moderation_status: 'APPROVED',
          moderation_reject_reason: null,
          published_at: '2026-05-12T08:00:00.000Z',
          likes_count: 12,
          has_liked: true,
          origin: 'OFFICIAL',
          is_default: true,
          author: {
            id: 'author-1',
            username: 'author'
          }
        }
      ]
    },
    meta: {
      page: {
        nextCursor: 'cursor-2'
      }
    }
  })

  assert.equal(normalized.data.character.default_story_id, 'story-1')
  assert.equal(normalized.meta?.page?.nextCursor, 'cursor-2')
  assert.deepEqual(normalized.data.stories[0], {
    id: 'story-1',
    title: 'Story title',
    promptDescription: 'Prompt description',
    personality: 'Strict',
    scenario: 'Academy',
    firstMessage: 'Stand up.',
    exampleDialogs: null,
    voiceFileUrl: null,
    voiceFileName: null,
    scenarioStory: 'Prompt description',
    scenarioChat: 'Academy',
    bodyPreview: 'Prompt description',
    publicationStatus: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    moderationRejectReason: null,
    publishedAt: '2026-05-12T08:00:00.000Z',
    likesCount: 12,
    hasLiked: true,
    characterId: 'character-1',
    scenarioType: 'roleplay',
    author: {
      id: 'author-1',
      username: 'author'
    },
    character: {
      id: 'character-1',
      name: 'Meiko Shikari',
      slug: 'meiko',
      previewImageUrl: null
    },
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-12T08:00:00.000Z',
    origin: 'OFFICIAL',
    isDefault: true
  })
})
