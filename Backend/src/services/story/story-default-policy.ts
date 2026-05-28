import type { StoryModerationStatus, StoryPublicationStatus } from '@prisma/client'

type PlayableStoryState = {
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
}

type DefaultStoryCandidate = PlayableStoryState & {
  id: string
  characterId: string
}

const isPlayableStory = (story: PlayableStoryState) => {
  return story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'
}

const isValidDefaultStoryForCharacter = (
  characterId: string,
  story: DefaultStoryCandidate | null | undefined
) => {
  return Boolean(story && story.characterId === characterId && isPlayableStory(story))
}

export { isPlayableStory, isValidDefaultStoryForCharacter }
export type { DefaultStoryCandidate, PlayableStoryState }
