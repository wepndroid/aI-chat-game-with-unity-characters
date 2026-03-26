import { apiGet, apiPatch, apiPost, apiPostFormData } from '@/lib/api-client'

type CharacterListRecord = {
  id: string
  slug: string
  name: string
  tagline: string | null
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
  officialListing: boolean
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
  viewsCount: number
  previewImageUrl: string | null
  owner: {
    id: string
    username: string
  }
  createdAt: string
  updatedAt: string
}

type CharacterStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
type CharacterVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED'

type CharacterDetailRecord = {
  id: string
  slug: string
  name: string
  fullName: string | null
  tagline: string | null
  description: string | null
  personality: string | null
  scenario: string | null
  firstMessage: string | null
  exampleDialogs: string | null
  vroidFileUrl: string | null
  previewImageUrl: string | null
  legacyFileHash: string | null
  legacyTier: number | null
  legacyHeyWaifu: number | null
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
  hasHearted: boolean
  officialListing: boolean
  viewsCount: number
  owner: {
    id: string
    username: string
  }
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  gatedAccess: {
    hasAccess: boolean
    requiredTierCents: number | null
  }
  screenshots: Array<{
    imageUrl: string
    sortOrder: number
  }>
}

type CharacterListResponse = {
  data: CharacterListRecord[]
}

type CharacterDetailResponse = {
  data: CharacterDetailRecord
}

type CreateCharacterPayload = {
  name: string
  fullName?: string
  tagline?: string
  description?: string
  personality?: string
  scenario?: string
  firstMessage?: string
  exampleDialogs?: string
  vroidFileUrl?: string
  previewImageUrl?: string
  screenshotUrls?: string[]
  legacyFileHash?: string
  legacyTier?: number
  legacyHeyWaifu?: number
  isPatreonGated?: boolean
  minimumTierCents?: number
  visibility?: CharacterVisibility
  officialListing?: boolean
}

type UpdateCharacterPayload = {
  name?: string
  fullName?: string | null
  tagline?: string | null
  description?: string | null
  personality?: string | null
  scenario?: string | null
  firstMessage?: string | null
  exampleDialogs?: string | null
  vroidFileUrl?: string | null
  previewImageUrl?: string | null
  screenshotUrls?: string[]
  legacyFileHash?: string | null
  legacyTier?: number | null
  legacyHeyWaifu?: number | null
  isPatreonGated?: boolean
  minimumTierCents?: number | null
  visibility?: CharacterVisibility
  officialListing?: boolean
}

type CreateCharacterResponse = {
  data: {
    id: string
    slug: string
    name: string
    status: CharacterStatus
    visibility: CharacterVisibility
    createdAt: string
  }
}

type UpdateCharacterResponse = {
  data: {
    id: string
    slug: string
    name: string
    status: CharacterStatus
    visibility: CharacterVisibility
    updatedAt: string
  }
}

type SubmitCharacterForReviewResponse = {
  data: {
    submitted: boolean
    id: string
    status: CharacterStatus
    updatedAt: string
  }
}

type CharacterMineRecord = {
  id: string
  slug: string
  name: string
  tagline: string | null
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
  officialListing: boolean
  viewsCount: number
  previewImageUrl: string | null
  createdAt: string
  updatedAt: string
}

type CharacterMineListResponse = {
  data: CharacterMineRecord[]
}

type AdminReviewQueueRecord = {
  id: string
  slug: string
  name: string
  previewImageUrl: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  owner: {
    id: string
    username: string
  }
}

type AdminReviewQueueResponse = {
  data: AdminReviewQueueRecord[]
}

type UpdateCharacterStatusResponse = {
  data: {
    id: string
    name: string
    status: CharacterStatus
    publishedAt: string | null
    updatedAt: string
  }
}

type UpdateCharacterVisibilityResponse = {
  data: {
    id: string
    name: string
    status: CharacterStatus
    visibility: CharacterVisibility
    publishedAt: string | null
    updatedAt: string
  }
}

type ToggleCharacterHeartResponse = {
  data: {
    hasHearted: boolean
    heartsCount: number
  }
}

type CharacterAssetUploadResponse = {
  data: {
    vroidFileUrl?: string
    previewImageUrl?: string
  }
}

type GalleryScope = 'all' | 'curated' | 'community' | 'mine'
type GallerySort = 'name' | 'hearts' | 'views' | 'newest'

const listCharacters = async (options?: { search?: string; galleryScope?: GalleryScope; sort?: GallerySort; limit?: number }) => {
  const query = new URLSearchParams()

  if (options?.search && options.search.trim().length > 0) {
    query.set('search', options.search.trim())
  }

  if (options?.galleryScope) {
    query.set('galleryScope', options.galleryScope)
  }

  if (options?.sort) {
    query.set('sort', options.sort)
  }

  query.set('limit', String(options?.limit ?? 72))

  return apiGet<CharacterListResponse>(`/characters?${query.toString()}`)
}

const getCharacterDetail = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiGet<CharacterDetailResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}`)
}

const createCharacter = async (payload: CreateCharacterPayload) => {
  return apiPost<CreateCharacterResponse>('/characters', payload)
}

const updateCharacter = async (characterIdOrSlug: string, payload: UpdateCharacterPayload) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiPatch<UpdateCharacterResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}`, payload)
}

const submitCharacterForReview = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiPost<SubmitCharacterForReviewResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/submit`, {})
}

const listMyCharacters = async (searchText?: string) => {
  const query = new URLSearchParams()

  if (searchText && searchText.trim().length > 0) {
    query.set('search', searchText.trim())
  }

  query.set('limit', '100')
  const querySuffix = query.toString().length > 0 ? `?${query.toString()}` : ''

  return apiGet<CharacterMineListResponse>(`/characters/mine${querySuffix}`)
}

const toggleCharacterHeart = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiPost<ToggleCharacterHeartResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/heart/toggle`, {})
}

const uploadCharacterAssets = async (formData: FormData) => {
  return apiPostFormData<CharacterAssetUploadResponse>('/characters/assets/upload', formData)
}

const listAdminReviewQueue = async () => {
  return apiGet<AdminReviewQueueResponse>('/admin/characters/review-queue?limit=100')
}

const updateCharacterStatus = async (characterId: string, status: CharacterStatus) => {
  const normalizedCharacterId = characterId.trim()
  return apiPatch<UpdateCharacterStatusResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/status`, {
    status
  })
}

const updateCharacterVisibility = async (characterId: string, visibility: CharacterVisibility) => {
  const normalizedCharacterId = characterId.trim()
  return apiPatch<UpdateCharacterVisibilityResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/visibility`, {
    visibility
  })
}

export {
  createCharacter,
  getCharacterDetail,
  listAdminReviewQueue,
  listCharacters,
  listMyCharacters,
  submitCharacterForReview,
  toggleCharacterHeart,
  updateCharacter,
  updateCharacterStatus,
  updateCharacterVisibility,
  uploadCharacterAssets
}
export type {
  CharacterAssetUploadResponse,
  AdminReviewQueueRecord,
  CharacterDetailRecord,
  CharacterListRecord,
  CharacterMineRecord,
  CharacterStatus,
  CharacterVisibility,
  CreateCharacterPayload,
  CreateCharacterResponse,
  GalleryScope,
  GallerySort,
  UpdateCharacterPayload,
  UpdateCharacterResponse,
  UpdateCharacterStatusResponse,
  UpdateCharacterVisibilityResponse,
  SubmitCharacterForReviewResponse,
  CharacterMineListResponse,
  ToggleCharacterHeartResponse
}
