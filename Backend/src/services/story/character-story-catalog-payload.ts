import type { Prisma } from '@prisma/client'

const characterStoryCatalogSelectFields = {
  id: true,
  title: true,
  promptDescription: true,
  personality: true,
  scenario: true,
  firstMessage: true,
  scenarioType: true,
  origin: true,
  publicationStatus: true,
  moderationStatus: true,
  moderationRejectReason: true,
  publishedAt: true,
  likesCount: true,
  author: {
    select: {
      id: true,
      username: true
    }
  }
} as const

type CharacterStoryCatalogRow = Prisma.StoryPostGetPayload<{
  select: typeof characterStoryCatalogSelectFields
}>

type CharacterStoryCatalogPayloadOptions = {
  hasLiked: boolean
  isDefault: boolean
}

const toCharacterStoryCatalogPayload = (
  story: CharacterStoryCatalogRow,
  options: CharacterStoryCatalogPayloadOptions
) => ({
  id: story.id,
  title: story.title,
  prompt_description: story.promptDescription,
  personality: story.personality,
  scenario: story.scenario,
  first_message: story.firstMessage,
  scenario_type: story.scenarioType,
  origin: story.origin,
  publication_status: story.publicationStatus,
  moderation_status: story.moderationStatus,
  moderation_reject_reason:
    story.moderationStatus === 'REJECTED' ? story.moderationRejectReason : null,
  published_at: story.publishedAt?.toISOString() ?? null,
  likes_count: story.likesCount,
  has_liked: options.hasLiked,
  is_default: options.isDefault,
  author: {
    id: story.author.id,
    username: story.author.username
  }
})

export {
  characterStoryCatalogSelectFields,
  toCharacterStoryCatalogPayload
}
export type {
  CharacterStoryCatalogPayloadOptions,
  CharacterStoryCatalogRow
}
