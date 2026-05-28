type CharacterStoryAuthor = {
  id: string
  username: string
}

type CharacterStoryCatalogApiRecord = {
  id: string
  title: string
  prompt_description: string | null
  personality: string | null
  scenario: string | null
  first_message: string | null
  scenario_type: string | null
  publication_status?: 'DRAFT' | 'PUBLISHED'
  moderation_status?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
  moderation_reject_reason?: string | null
  published_at: string | null
  likes_count: number
  has_liked: boolean
  origin: 'OFFICIAL' | 'COMMUNITY'
  is_default: boolean
  author: CharacterStoryAuthor
}

type CharacterStoryCatalogApiCharacter = {
  id: string
  slug: string
  name: string
  default_story_id: string | null
}

type CharacterStoryCatalogApiResponse = {
  data: {
    character: CharacterStoryCatalogApiCharacter
    stories: CharacterStoryCatalogApiRecord[]
  }
  meta?: {
    page?: {
      nextCursor?: string | null
    }
  }
}

type CharacterStoryCatalogRecord = {
  id: string
  title: string
  promptDescription: string | null
  personality: string | null
  scenario: string | null
  firstMessage: string | null
  exampleDialogs: string | null
  voiceFileUrl: string | null
  voiceFileName: string | null
  scenarioStory: string
  scenarioChat: string
  bodyPreview: string
  publicationStatus: 'DRAFT' | 'PUBLISHED'
  moderationStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
  moderationRejectReason?: string | null
  publishedAt: string | null
  likesCount: number
  hasLiked: boolean
  characterId: string
  scenarioType: string | null
  author: CharacterStoryAuthor
  character: {
    id: string
    name: string
    slug: string
    previewImageUrl: null
  }
  createdAt: string
  updatedAt: string
  origin: 'OFFICIAL' | 'COMMUNITY'
  isDefault: boolean
}

type CharacterStoryCatalogResponse = {
  data: {
    character: CharacterStoryCatalogApiCharacter
    stories: CharacterStoryCatalogRecord[]
  }
  meta?: CharacterStoryCatalogApiResponse['meta']
}

const firstNonEmpty = (...values: Array<string | null>) =>
  values.find((value) => value !== null && value.trim().length > 0) ?? ''

const toCharacterStoryCatalogRecord = (
  character: CharacterStoryCatalogApiCharacter,
  story: CharacterStoryCatalogApiRecord
): CharacterStoryCatalogRecord => {
  const createdAt = story.published_at ?? ''

  return {
    id: story.id,
    title: story.title,
    promptDescription: story.prompt_description,
    personality: story.personality,
    scenario: story.scenario,
    firstMessage: story.first_message,
    exampleDialogs: null,
    voiceFileUrl: null,
    voiceFileName: null,
    scenarioStory: story.prompt_description ?? '',
    scenarioChat: story.scenario ?? '',
    bodyPreview: firstNonEmpty(story.prompt_description, story.scenario, story.first_message),
    publicationStatus: story.publication_status ?? 'PUBLISHED',
    moderationStatus: story.moderation_status ?? 'APPROVED',
    moderationRejectReason: story.moderation_reject_reason ?? null,
    publishedAt: story.published_at,
    likesCount: story.likes_count,
    hasLiked: story.has_liked,
    characterId: character.id,
    scenarioType: story.scenario_type,
    author: story.author,
    character: {
      id: character.id,
      name: character.name,
      slug: character.slug,
      previewImageUrl: null
    },
    createdAt,
    updatedAt: createdAt,
    origin: story.origin,
    isDefault: story.is_default
  }
}

const normalizeCharacterStoryCatalogResponse = (
  response: CharacterStoryCatalogApiResponse
): CharacterStoryCatalogResponse => ({
  data: {
    character: response.data.character,
    stories: response.data.stories.map((story) =>
      toCharacterStoryCatalogRecord(response.data.character, story)
    )
  },
  meta: response.meta
})

export {
  normalizeCharacterStoryCatalogResponse,
  toCharacterStoryCatalogRecord
}
export type {
  CharacterStoryCatalogApiCharacter,
  CharacterStoryCatalogApiRecord,
  CharacterStoryCatalogApiResponse,
  CharacterStoryCatalogRecord,
  CharacterStoryCatalogResponse
}
