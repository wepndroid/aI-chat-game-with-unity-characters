import type { Prisma, StoryModerationStatus, StoryPublicationStatus, UserRole } from '@prisma/client'
import {
  canReadCharacter,
  type CharacterAccessSubject
} from '../character/character-access-policy'

type StoryVisibilityActor = {
  userId: string
  role: UserRole
} | null

type StoryVisibilityRow = {
  authorId: string
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
}

type StoryWithCharacterVisibilityRow = StoryVisibilityRow & {
  character: CharacterAccessSubject
}

type PublicStoryCatalogWhereInput = {
  actor: StoryVisibilityActor
  characterId?: string
  searchTerm?: string
}

const isPublicApprovedStory = (story: Pick<StoryVisibilityRow, 'publicationStatus' | 'moderationStatus'>) =>
  story.publicationStatus === 'PUBLISHED' && story.moderationStatus === 'APPROVED'

const buildCreatorLinkedStoryCatalogScope = (
  actor: NonNullable<StoryVisibilityActor>
): Prisma.StoryPostWhereInput => ({
  authorId: actor.userId,
  publicationStatus: 'PUBLISHED',
  moderationStatus: { in: ['PENDING', 'REJECTED'] }
})

/**
 * Object-level read policy for story catalogs and direct launch surfaces.
 * Public approved stories are shared; creator-owned stories stay visible to
 * their author while moderation is pending or rejected.
 */
const canReadStoryAsViewer = (story: StoryVisibilityRow, actor: StoryVisibilityActor) => {
  if (isPublicApprovedStory(story)) {
    return true
  }

  if (!actor) {
    return false
  }

  if (story.authorId === actor.userId) {
    return true
  }

  return actor.role === 'ADMIN' && story.publicationStatus === 'PUBLISHED'
}

const buildStoryCatalogCharacterWhere = (actor: StoryVisibilityActor): Prisma.CharacterWhereInput => ({
  status: 'APPROVED',
  visibility: actor ? { in: ['PUBLIC', 'UNLISTED'] } : 'PUBLIC'
})

/**
 * Public story-feed query policy. The legacy global feed still permits stories
 * with moderationStatus NONE, but only when the linked character itself is an
 * approved readable listing for the current viewer class.
 */
const buildPublicStoryCatalogWhere = (input: PublicStoryCatalogWhereInput): Prisma.StoryPostWhereInput => {
  const moderationClause: Prisma.StoryPostWhereInput = input.characterId
    ? { moderationStatus: 'APPROVED' }
    : {
        OR: [{ moderationStatus: 'APPROVED' }, { moderationStatus: 'NONE' }]
      }

  const andParts: Prisma.StoryPostWhereInput[] = [
    { publicationStatus: 'PUBLISHED' },
    moderationClause,
    {
      character: {
        is: buildStoryCatalogCharacterWhere(input.actor)
      }
    }
  ]

  if (input.characterId) {
    andParts.push({ characterId: input.characterId })
  }

  if (input.searchTerm?.trim()) {
    const term = input.searchTerm.trim()
    andParts.push({
      OR: [
        { title: { contains: term } },
        { body: { contains: term } },
        { promptDescription: { contains: term } },
        { personality: { contains: term } },
        { scenario: { contains: term } },
        { firstMessage: { contains: term } },
        { exampleDialogs: { contains: term } },
        { scenarioStory: { contains: term } },
        { scenarioChat: { contains: term } }
      ]
    })
  }

  return { AND: andParts }
}

/**
 * Direct story object policy. A story is readable only when both the story
 * status/ownership rule and the linked character object rule allow access.
 */
const canReadStoryWithCharacterAsViewer = (
  story: StoryWithCharacterVisibilityRow,
  actor: StoryVisibilityActor
) => {
  return canReadStoryAsViewer(story, actor) && canReadCharacter(actor, story.character)
}

/**
 * Character-page story catalog policy. The route mediates character access
 * before calling this helper, so this predicate only scopes readable stories
 * within the already-authorized character page. Drafts are intentionally kept
 * out of this play/discovery surface; owners still manage them through
 * /stories?scope=mine and direct edit routes.
 */
const buildCharacterStoryCatalogWhere = (
  characterId: string,
  actor: StoryVisibilityActor
): Prisma.StoryPostWhereInput => {
  const readScopes: Prisma.StoryPostWhereInput[] = [
    {
      publicationStatus: 'PUBLISHED',
      moderationStatus: 'APPROVED'
    }
  ]

  if (actor) {
    readScopes.push(buildCreatorLinkedStoryCatalogScope(actor))
  }

  return {
    AND: [
      { characterId },
      {
        OR: readScopes
      }
    ]
  }
}

export {
  buildPublicStoryCatalogWhere,
  buildCharacterStoryCatalogWhere,
  canReadStoryWithCharacterAsViewer,
  canReadStoryAsViewer,
  isPublicApprovedStory
}
export type {
  PublicStoryCatalogWhereInput,
  StoryVisibilityActor,
  StoryVisibilityRow,
  StoryWithCharacterVisibilityRow
}
