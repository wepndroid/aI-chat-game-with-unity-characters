import type { StoryListRecord } from '@/lib/story-api'

type CharacterStoryCatalogStatusRecord = Pick<StoryListRecord, 'publicationStatus' | 'moderationStatus'>

type CharacterStoryCatalogDisplayRecord = CharacterStoryCatalogStatusRecord &
  Pick<StoryListRecord, 'id' | 'author'>

type PrimaryCharacterStoryCardCharacter = {
  name: string
  description: string | null
  officialListing: boolean
  owner: {
    username: string
  }
}

type PrimaryCharacterStoryCardStory = Pick<
  StoryListRecord,
  'title' | 'scenarioStory' | 'scenario' | 'bodyPreview' | 'firstMessage' | 'scenarioChat' | 'author'
>

type PrimaryCharacterStoryCardDisplayInput = {
  character: PrimaryCharacterStoryCardCharacter
  story: PrimaryCharacterStoryCardStory | null
}

type CollectViewerLinkedCharacterPageStoriesInput<TStory extends CharacterStoryCatalogDisplayRecord> = {
  catalogStories: TStory[]
  ownerStories: TStory[]
  viewerUserId: string | null | undefined
  officialStoryId: string | null | undefined
}

const isLiveApprovedCharacterPageStory = (story: CharacterStoryCatalogStatusRecord) => {
  return story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'
}

const isViewerLinkedCharacterPageStory = (story: CharacterStoryCatalogStatusRecord) => {
  return (
    story.publicationStatus === 'PUBLISHED' &&
    (story.moderationStatus === 'PENDING' || story.moderationStatus === 'REJECTED')
  )
}

const trimText = (value: string | null | undefined) => value?.trim() ?? ''

const buildPrimaryCharacterStoryCardDisplay = ({
  character,
  story
}: PrimaryCharacterStoryCardDisplayInput) => {
  return {
    title: trimText(story?.title) || `${character.name} Scenario`,
    creatorName: trimText(story?.author.username) || (character.officialListing ? 'Admin' : character.owner.username),
    scenarioText:
      trimText(story?.scenarioStory) ||
      trimText(story?.scenario) ||
      trimText(story?.bodyPreview).replace(/\.\.\.$/, '').trim() ||
      trimText(character.description) ||
      'No scenario text yet.',
    firstMessage: trimText(story?.firstMessage) || trimText(story?.scenarioChat)
  }
}

/**
 * Character pages are discovery/play surfaces. Drafts stay in owner management
 * views; only submitted stories may appear as creator-visible linked stories.
 */
const collectViewerLinkedCharacterPageStories = <TStory extends CharacterStoryCatalogDisplayRecord>({
  catalogStories,
  ownerStories,
  viewerUserId,
  officialStoryId
}: CollectViewerLinkedCharacterPageStoriesInput<TStory>) => {
  if (!viewerUserId) {
    return []
  }

  const publicStoryIds = new Set(
    catalogStories.filter(isLiveApprovedCharacterPageStory).map((story) => story.id)
  )
  const viewerLinkedStoriesById = new Map<string, TStory>()
  const collectStory = (story: TStory) => {
    if (
      story.author.id === viewerUserId &&
      story.id !== officialStoryId &&
      !publicStoryIds.has(story.id) &&
      isViewerLinkedCharacterPageStory(story)
    ) {
      viewerLinkedStoriesById.set(story.id, story)
    }
  }

  catalogStories.forEach(collectStory)
  ownerStories.forEach(collectStory)

  return [...viewerLinkedStoriesById.values()]
}

export {
  buildPrimaryCharacterStoryCardDisplay,
  collectViewerLinkedCharacterPageStories,
  isLiveApprovedCharacterPageStory,
  isViewerLinkedCharacterPageStory
}

export type {
  CharacterStoryCatalogDisplayRecord,
  CharacterStoryCatalogStatusRecord,
  CollectViewerLinkedCharacterPageStoriesInput,
  PrimaryCharacterStoryCardDisplayInput
}
