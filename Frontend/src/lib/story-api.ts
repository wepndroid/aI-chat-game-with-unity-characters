import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'

type StoryAuthor = {
  id: string
  username: string
}

type StoryCharacterRef = {
  id: string
  name: string
  slug: string
  previewImageUrl: string | null
} | null

/** List API returns bodyPreview only (no full body) to avoid leaking long posts in feed JSON. */
type StoryPublicationStatus = 'DRAFT' | 'PUBLISHED'

type StoryListRecord = {
  id: string
  title: string
  bodyPreview: string
  visibility: 'PUBLIC' | 'PRIVATE'
  publicationStatus: StoryPublicationStatus
  publishedAt: string | null
  likesCount: number
  characterId: string | null
  author: StoryAuthor
  character: StoryCharacterRef
  createdAt: string
  updatedAt: string
}

type StoryDetailRecord = {
  id: string
  title: string
  body: string
  visibility: 'PUBLIC' | 'PRIVATE'
  publicationStatus: StoryPublicationStatus
  publishedAt: string | null
  likesCount: number
  characterId: string | null
  author: StoryAuthor
  character: StoryCharacterRef
  hasLiked: boolean
  createdAt: string
  updatedAt: string
}

type ListStoriesParams = {
  scope?: 'all' | 'mine'
  characterId?: string
  search?: string
  sort?: 'newest' | 'likes'
  /** When scope is mine: all | draft | published */
  publication?: 'all' | 'draft' | 'published'
  limit?: number
}

const listStories = async (params: ListStoriesParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.scope) searchParams.set('scope', params.scope)
  if (params.characterId) searchParams.set('characterId', params.characterId)
  if (params.search) searchParams.set('search', params.search)
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.publication) searchParams.set('publication', params.publication)
  if (params.limit) searchParams.set('limit', String(params.limit))

  const query = searchParams.toString()
  const path = query ? `/stories?${query}` : '/stories'

  return apiGet<{ data: StoryListRecord[] }>(path)
}

const getStory = async (storyId: string) => {
  return apiGet<{ data: StoryDetailRecord }>(`/stories/${storyId}`)
}

type CreateStoryPayload = {
  title: string
  body: string
  characterId?: string
  visibility?: 'PUBLIC' | 'PRIVATE'
  publicationStatus?: StoryPublicationStatus
}

const createStory = async (payload: CreateStoryPayload) => {
  const publicationStatus = payload.publicationStatus ?? 'PUBLISHED'
  return apiPost<{ data: StoryDetailRecord }>('/stories', {
    title: payload.title,
    body: payload.body,
    ...(payload.characterId ? { characterId: payload.characterId } : {}),
    ...(payload.visibility ? { visibility: payload.visibility } : {}),
    publicationStatus
  })
}

type UpdateStoryPayload = {
  title?: string
  body?: string
  characterId?: string | null
  visibility?: 'PUBLIC' | 'PRIVATE'
  publicationStatus?: StoryPublicationStatus
}

const updateStory = async (storyId: string, payload: UpdateStoryPayload) => {
  return apiPatch<{ data: StoryDetailRecord }>(`/stories/${storyId}`, payload)
}

const deleteStory = async (storyId: string) => {
  return apiDelete<{ message: string }>(`/stories/${storyId}`)
}

const toggleStoryLike = async (storyId: string) => {
  return apiPost<{ data: { liked: boolean; likesCount: number } }>(`/stories/${storyId}/like/toggle`)
}

export {
  createStory,
  deleteStory,
  getStory,
  listStories,
  toggleStoryLike,
  updateStory
}

export type {
  StoryAuthor,
  StoryCharacterRef,
  StoryDetailRecord,
  StoryListRecord,
  StoryPublicationStatus
}
