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

type StoryModerationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'

type StoryListRecord = {
  id: string
  title: string
  bodyPreview: string
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
  /** Present for `scope=mine` when rejected; omitted on public lists. */
  moderationRejectReason?: string | null
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
  publicationStatus: StoryPublicationStatus
  moderationStatus: StoryModerationStatus
  moderationRejectReason: string | null
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
  /** When scope is mine: all | draft | published | rejected */
  publication?: 'all' | 'draft' | 'published' | 'rejected'
  limit?: number
}

type ListAdminStoriesParams = {
  search?: string
  sort?: 'newest' | 'likes'
  moderation?: 'all' | 'pending' | 'approved' | 'rejected'
  page?: number
  limit?: number
}

type AdminStoriesListMeta = {
  page: number
  limit: number
  total: number
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

const listAdminStories = async (params: ListAdminStoriesParams = {}) => {
  const searchParams = new URLSearchParams()

  if (params.search) searchParams.set('search', params.search)
  if (params.sort) searchParams.set('sort', params.sort)
  if (params.moderation) searchParams.set('moderation', params.moderation)
  if (params.page) searchParams.set('page', String(params.page))
  if (params.limit) searchParams.set('limit', String(params.limit))

  const query = searchParams.toString()
  const path = query ? `/admin/stories?${query}` : '/admin/stories'

  return apiGet<{ data: StoryListRecord[]; meta: AdminStoriesListMeta }>(path)
}

const getStory = async (storyId: string) => {
  return apiGet<{ data: StoryDetailRecord }>(`/stories/${storyId}`)
}

type CreateStoryPayload = {
  title: string
  body: string
  characterId?: string
  publicationStatus?: StoryPublicationStatus
}

const createStory = async (payload: CreateStoryPayload) => {
  const publicationStatus = payload.publicationStatus ?? 'PUBLISHED'
  return apiPost<{ data: StoryDetailRecord }>('/stories', {
    title: payload.title,
    body: payload.body,
    ...(payload.characterId ? { characterId: payload.characterId } : {}),
    publicationStatus
  })
}

type UpdateStoryPayload = {
  title?: string
  body?: string
  characterId?: string | null
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

type ModerateStoryPayload =
  | { decision: 'approve' }
  | { decision: 'reject'; rejectReason: string }

const moderateStory = async (storyId: string, payload: ModerateStoryPayload) => {
  return apiPost<{ data: StoryDetailRecord }>(`/admin/stories/${encodeURIComponent(storyId)}/moderate`, payload)
}

export {
  createStory,
  deleteStory,
  getStory,
  listAdminStories,
  listStories,
  moderateStory,
  toggleStoryLike,
  updateStory
}

export type {
  AdminStoriesListMeta,
  StoryAuthor,
  StoryCharacterRef,
  StoryDetailRecord,
  StoryListRecord,
  StoryModerationStatus,
  StoryPublicationStatus
}
