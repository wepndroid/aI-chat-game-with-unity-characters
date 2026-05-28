import test from 'node:test'
import assert from 'node:assert/strict'
import type { CharacterVisibility, StoryModerationStatus, StoryPublicationStatus, UserRole } from '@prisma/client'
import {
  buildPublicStoryCatalogWhere,
  buildCharacterStoryCatalogWhere,
  canReadStoryAsViewer,
  canReadStoryWithCharacterAsViewer
} from './story-visibility-policy'

const userActor = {
  userId: 'author-1',
  role: 'USER' as UserRole
}

const story = (
  authorId: string,
  publicationStatus: StoryPublicationStatus,
  moderationStatus: StoryModerationStatus
) => ({
  authorId,
  publicationStatus,
  moderationStatus
})

const visibleStory = {
  authorId: 'story-author-1',
  publicationStatus: 'PUBLISHED' as StoryPublicationStatus,
  moderationStatus: 'APPROVED' as StoryModerationStatus
}

const approvedPublicCharacter = {
  id: 'character-1',
  ownerId: 'character-owner-1',
  status: 'APPROVED' as const,
  visibility: 'PUBLIC' as const
}

const characterWithVisibility = (visibility: CharacterVisibility) => ({
  ...approvedPublicCharacter,
  visibility
})

test('canReadStoryAsViewer allows public approved stories to anonymous viewers', () => {
  assert.equal(canReadStoryAsViewer(story('author-1', 'PUBLISHED', 'APPROVED'), null), true)
})

test('canReadStoryAsViewer keeps pending stories creator-only', () => {
  assert.equal(canReadStoryAsViewer(story('author-1', 'PUBLISHED', 'PENDING'), userActor), true)
  assert.equal(canReadStoryAsViewer(story('author-2', 'PUBLISHED', 'PENDING'), userActor), false)
  assert.equal(canReadStoryAsViewer(story('author-1', 'PUBLISHED', 'PENDING'), null), false)
})

test('canReadStoryAsViewer keeps rejected stories creator-only outside admin moderation', () => {
  assert.equal(canReadStoryAsViewer(story('author-1', 'PUBLISHED', 'REJECTED'), userActor), true)
  assert.equal(canReadStoryAsViewer(story('author-2', 'PUBLISHED', 'REJECTED'), userActor), false)
  assert.equal(canReadStoryAsViewer(story('author-1', 'PUBLISHED', 'REJECTED'), null), false)
})

test('buildCharacterStoryCatalogWhere includes public approved and creator published pending or rejected stories only', () => {
  assert.deepEqual(buildCharacterStoryCatalogWhere('character-1', userActor), {
    AND: [
      { characterId: 'character-1' },
      {
        OR: [
          {
            publicationStatus: 'PUBLISHED',
            moderationStatus: 'APPROVED'
          },
          {
            authorId: 'author-1',
            publicationStatus: 'PUBLISHED',
            moderationStatus: { in: ['PENDING', 'REJECTED'] }
          }
        ]
      }
    ]
  })
})

test('buildCharacterStoryCatalogWhere excludes creator-owned drafts from character pages', () => {
  const serializedWhere = JSON.stringify(buildCharacterStoryCatalogWhere('character-1', userActor))

  assert.doesNotMatch(serializedWhere, /"publicationStatus":"DRAFT"/)
  assert.doesNotMatch(serializedWhere, /"authorId":"author-1"\}/)
})

test('buildPublicStoryCatalogWhere requires anonymous catalog stories to belong to approved public characters', () => {
  assert.deepEqual(buildPublicStoryCatalogWhere({ actor: null }), {
    AND: [
      { publicationStatus: 'PUBLISHED' },
      {
        OR: [{ moderationStatus: 'APPROVED' }, { moderationStatus: 'NONE' }]
      },
      {
        character: {
          is: {
            status: 'APPROVED',
            visibility: 'PUBLIC'
          }
        }
      }
    ]
  })
})

test('buildPublicStoryCatalogWhere allows signed-in catalog stories for approved public or unlisted characters', () => {
  assert.deepEqual(buildPublicStoryCatalogWhere({ actor: userActor }), {
    AND: [
      { publicationStatus: 'PUBLISHED' },
      {
        OR: [{ moderationStatus: 'APPROVED' }, { moderationStatus: 'NONE' }]
      },
      {
        character: {
          is: {
            status: 'APPROVED',
            visibility: { in: ['PUBLIC', 'UNLISTED'] }
          }
        }
      }
    ]
  })
})

test('canReadStoryWithCharacterAsViewer denies direct reads for private characters to non-owners', () => {
  assert.equal(
    canReadStoryWithCharacterAsViewer(
      {
        ...visibleStory,
        character: characterWithVisibility('PRIVATE')
      },
      userActor
    ),
    false
  )
})

test('canReadStoryWithCharacterAsViewer denies anonymous direct reads for unlisted characters', () => {
  assert.equal(
    canReadStoryWithCharacterAsViewer(
      {
        ...visibleStory,
        character: characterWithVisibility('UNLISTED')
      },
      null
    ),
    false
  )
})

test('canReadStoryWithCharacterAsViewer allows signed-in direct reads for approved unlisted characters', () => {
  assert.equal(
    canReadStoryWithCharacterAsViewer(
      {
        ...visibleStory,
        character: characterWithVisibility('UNLISTED')
      },
      userActor
    ),
    true
  )
})

test('canReadStoryWithCharacterAsViewer allows private character direct reads to character owners and admins', () => {
  const privateCharacterStory = {
    ...visibleStory,
    character: characterWithVisibility('PRIVATE')
  }

  assert.equal(
    canReadStoryWithCharacterAsViewer(privateCharacterStory, {
      userId: 'character-owner-1',
      role: 'USER' as UserRole
    }),
    true
  )
  assert.equal(
    canReadStoryWithCharacterAsViewer(privateCharacterStory, {
      userId: 'admin-1',
      role: 'ADMIN' as UserRole
    }),
    true
  )
})
