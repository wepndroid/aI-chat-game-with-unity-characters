import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPrimaryCharacterStoryCardDisplay,
  collectViewerLinkedCharacterPageStories,
  isLiveApprovedCharacterPageStory,
  isViewerLinkedCharacterPageStory
} from './character-story-catalog-display-policy'

const story = (
  id: string,
  authorId: string,
  publicationStatus: 'DRAFT' | 'PUBLISHED',
  moderationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
) => ({
  id,
  author: {
    id: authorId,
    username: authorId
  },
  publicationStatus,
  moderationStatus
})

test('isViewerLinkedCharacterPageStory keeps drafts off character pages', () => {
  assert.equal(isViewerLinkedCharacterPageStory(story('draft-story', 'author-1', 'DRAFT', 'NONE')), false)
})

test('isViewerLinkedCharacterPageStory allows only submitted creator-visible statuses', () => {
  assert.equal(isViewerLinkedCharacterPageStory(story('pending-story', 'author-1', 'PUBLISHED', 'PENDING')), true)
  assert.equal(isViewerLinkedCharacterPageStory(story('rejected-story', 'author-1', 'PUBLISHED', 'REJECTED')), true)
  assert.equal(isViewerLinkedCharacterPageStory(story('approved-story', 'author-1', 'PUBLISHED', 'APPROVED')), false)
})

test('isLiveApprovedCharacterPageStory identifies public community stories', () => {
  assert.equal(isLiveApprovedCharacterPageStory(story('approved-story', 'author-1', 'PUBLISHED', 'APPROVED')), true)
  assert.equal(isLiveApprovedCharacterPageStory(story('pending-story', 'author-1', 'PUBLISHED', 'PENDING')), false)
})

test('collectViewerLinkedCharacterPageStories excludes drafts, public stories, official story, and other authors', () => {
  const approvedStory = story('approved-story', 'author-1', 'PUBLISHED', 'APPROVED')
  const officialPendingStory = story('official-pending-story', 'author-1', 'PUBLISHED', 'PENDING')
  const pendingStory = story('pending-story', 'author-1', 'PUBLISHED', 'PENDING')
  const rejectedStory = story('rejected-story', 'author-1', 'PUBLISHED', 'REJECTED')
  const draftStory = story('draft-story', 'author-1', 'DRAFT', 'NONE')
  const otherAuthorPendingStory = story('other-pending-story', 'author-2', 'PUBLISHED', 'PENDING')

  assert.deepEqual(
    collectViewerLinkedCharacterPageStories({
      catalogStories: [approvedStory, officialPendingStory, pendingStory, draftStory, otherAuthorPendingStory],
      ownerStories: [approvedStory, rejectedStory, draftStory],
      viewerUserId: 'author-1',
      officialStoryId: 'official-pending-story'
    }).map((record) => record.id),
    ['pending-story', 'rejected-story']
  )
})

test('buildPrimaryCharacterStoryCardDisplay exposes the selected story title for the primary scenario card', () => {
  const result = buildPrimaryCharacterStoryCardDisplay({
    character: {
      name: 'Ahri',
      description: 'Character fallback description.',
      officialListing: true,
      owner: {
        username: 'Creator'
      }
    },
    story: {
      title: 'Ahri KD/A',
      scenarioStory: 'Story scenario text.',
      scenario: 'Legacy scenario text.',
      bodyPreview: 'Preview scenario text...',
      firstMessage: 'First message.',
      scenarioChat: 'Legacy first message.',
      author: {
        id: 'admin-1',
        username: 'Admin'
      }
    }
  })

  assert.equal(result.title, 'Ahri KD/A')
  assert.equal(result.creatorName, 'Admin')
  assert.equal(result.scenarioText, 'Story scenario text.')
  assert.equal(result.firstMessage, 'First message.')
})
