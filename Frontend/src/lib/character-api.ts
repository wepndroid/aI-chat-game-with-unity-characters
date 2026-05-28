import { apiDelete, apiGet, apiPatch, apiPost, apiPostFormData, apiPostFormDataWithProgress } from '@/lib/api-client'

type CharacterListRecord = {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
  officialListing: boolean
  isPatreonGated: boolean
  heartsCount: number
  messageCount: number
  previewImageUrl: string | null
  thumbnailReferenceImageUrl: string | null
  cardThumbnailDesktopUrl: string | null
  cardThumbnailMobileUrl: string | null
  owner: {
    id: string
    username: string
  }
  createdAt: string
  updatedAt: string
}

type CharacterStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
type CharacterVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
type CharacterPublicationIntent = 'draft' | 'publish'

type CharacterActionAccess = {
  can_start_chat: boolean
  start_chat_requires_auth: boolean
  start_chat_requires_verified_email: boolean
  start_chat_unavailable_reason: 'AUTH_REQUIRED' | 'EMAIL_VERIFICATION_REQUIRED' | 'MEMBERSHIP_REQUIRED' | 'NOT_APPROVED' | 'NO_PLAYABLE_STORY' | null
  can_preview_3d: boolean
  preview_3d_requires_auth: boolean
  preview_3d_requires_verified_email: boolean
  preview_3d_unavailable_reason: 'AUTH_REQUIRED' | 'EMAIL_VERIFICATION_REQUIRED' | 'NOT_APPROVED' | 'NO_MODEL' | null
}

type CharacterDetailRecord = {
  id: string
  slug: string
  name: string
  fullName: string | null
  tagline: string | null
  description: string | null
  vroidFileUrl: string | null
  hasVrmModel: boolean
  defaultStoryId: string | null
  poseFileUrl: string | null
  previewImageUrl: string | null
  voiceFileUrl: string | null
  voiceFileName: string | null
  thumbnailReferenceImageUrl: string | null
  cardThumbnailDesktopUrl: string | null
  cardThumbnailMobileUrl: string | null
  legacyFileHash: string | null
  legacyTier: number | null
  legacyHeyWaifu: number | null
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
  heartsCount: number
  hasHearted: boolean
  officialListing: boolean
  messageCount: number
  owner: {
    id: string
    username: string
  }
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  access: CharacterActionAccess
}

type CharacterListResponse = {
  data: CharacterListRecord[]
  page?: {
    nextCursor: string | null
  }
}

type CharacterDetailResponse = {
  data: CharacterDetailRecord
}

type CharacterVrmSignedUrlResponse = {
  data: {
    character_id: string
    model_url: string
    expires_at: string
    model_hash: string | null
    model_version: string
  }
}

type InitialCharacterStoryPayload = {
  title: string
  promptDescription: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogs?: string
  scenarioStory: string
  scenarioChat?: string
  voiceFileUrl?: string
  voiceFileName?: string
}

type CreateCharacterPayload = {
  name: string
  fullName?: string
  tagline?: string
  description?: string
  initialStory: InitialCharacterStoryPayload
  vroidFileUrl?: string
  poseFileUrl?: string
  previewImageUrl?: string
  voiceFileUrl?: string
  voiceFileName?: string
  thumbnailReferenceImageUrl?: string
  legacyFileHash?: string
  legacyTier?: number
  legacyHeyWaifu?: number
  isPatreonGated?: boolean
  publicationIntent?: CharacterPublicationIntent
  visibility?: CharacterVisibility
}

type UpdateCharacterPayload = {
  name?: string
  fullName?: string | null
  tagline?: string | null
  description?: string | null
  vroidFileUrl?: string | null
  poseFileUrl?: string | null
  previewImageUrl?: string | null
  voiceFileUrl?: string | null
  voiceFileName?: string | null
  thumbnailReferenceImageUrl?: string | null
  legacyFileHash?: string | null
  legacyTier?: number | null
  legacyHeyWaifu?: number | null
  isPatreonGated?: boolean
  publicationIntent?: CharacterPublicationIntent
  visibility?: CharacterVisibility
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
  description: string | null
  status: CharacterStatus
  visibility: CharacterVisibility
  isPatreonGated: boolean
  heartsCount: number
  officialListing: boolean
  messageCount: number
  previewImageUrl: string | null
  cardThumbnailDesktopUrl: string | null
  cardThumbnailMobileUrl: string | null
  moderationRejectReason: string | null
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
  vroidFileUrl: string | null
  poseFileUrl: string | null
  previewImageUrl: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  systemScanSummary: null | {
    overall: string
    issuesCount: number
    summary: string
    createdAt: string
  }
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
    visibility: CharacterVisibility
    publishedAt: string | null
    updatedAt: string
    moderationRejectReason: string | null
  }
}

type DeleteCharacterResponse = {
  data: {
    deleted: boolean
    id: string
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
    poseFileUrl?: string
    previewImageUrl?: string
    voiceFileUrl?: string
    voiceFileName?: string
  }
}

type CharacterAssetUploadProgress = {
  loaded: number
  total: number | null
  percent: number | null
}

type GenerateCharacterPreviewResponse = {
  data: {
    previewImageUrl: string
    referenceImageUrl: string
    cooldownSecondsRemaining: number
    successfulGenerationsInWindow: number
    instantGenerationsRemaining: number
    debug?: {
      isCooldownExempt: boolean
      requestParameters: Record<string, unknown>
      upstreamStatus: number
      upstreamResponse: Record<string, unknown>
    } | null
  }
}

type AdminThumbnailCandidateRecord = {
  id: string
  slug: string
  name: string
  status: CharacterStatus
  previewImageUrl: string | null
  updatedAt: string
}

type AdminThumbnailCandidatesResponse = {
  data: AdminThumbnailCandidateRecord[]
}

type GenerateCharacterThumbnailsPayload = {
  sourceImageUrl?: string
  targets: Array<{
    key: 'desktop' | 'mobile'
    width: number
    height: number
    fit?: 'cover' | 'contain'
  }>
}

type GenerateCharacterThumbnailsResponse = {
  data: {
    id: string
    name: string
    previewImageUrl: string | null
    cardThumbnailDesktopUrl: string | null
    cardThumbnailMobileUrl: string | null
    sourceImageUrl: string
    sourceImage: {
      width: number | null
      height: number | null
    }
  }
}

type GenerateBulkCharacterThumbnailsPayload = {
  search?: string
  targets: Array<{
    key: 'desktop' | 'mobile'
    width: number
    height: number
    fit?: 'cover' | 'contain'
  }>
}

type GenerateBulkCharacterThumbnailsResponse = {
  data: {
    totalMatched: number
    generatedCount: number
    skippedCount: number
    failureCount: number
    results: Array<{
      id: string
      name: string
      status: 'generated' | 'skipped' | 'failed'
      message?: string
      cardThumbnailDesktopUrl?: string | null
      cardThumbnailMobileUrl?: string | null
    }>
  }
}

type GalleryScope = 'all' | 'curated' | 'community' | 'mine'
type GallerySort = 'name' | 'hearts' | 'messages' | 'popular' | 'newest'
type ThumbnailSource = 'card' | 'reference'

const listCharacters = async (options?: {
  search?: string
  galleryScope?: GalleryScope
  /** Restrict to characters owned by this user (API: you may only pass your own id unless admin). */
  ownerId?: string
  cursor?: string | null
  sort?: GallerySort
  limit?: number
  thumbnailSource?: ThumbnailSource
  /** Admin only: list every admin-owned curated row (Official VRMs admin table). Omit for public gallery parity. */
  adminCuratedAll?: boolean
  /** Admin only: list every community-owned row (Community VRMs admin table). Omit for public Community tab parity. */
  adminCommunityAll?: boolean
}) => {
  const query = new URLSearchParams()

  if (options?.search && options.search.trim().length > 0) {
    query.set('search', options.search.trim())
  }

  if (options?.ownerId && options.ownerId.trim().length > 0) {
    query.set('ownerId', options.ownerId.trim())
  }

  if (options?.cursor && options.cursor.trim().length > 0) {
    query.set('cursor', options.cursor.trim())
  }

  if (options?.galleryScope) {
    query.set('galleryScope', options.galleryScope)
  }

  if (options?.sort) {
    query.set('sort', options.sort)
  }

  if (options?.thumbnailSource) {
    query.set('thumbnailSource', options.thumbnailSource)
  }

  if (options?.adminCuratedAll) {
    query.set('adminCuratedAll', 'true')
  }

  if (options?.adminCommunityAll) {
    query.set('adminCommunityAll', 'true')
  }

  query.set('limit', String(options?.limit ?? 72))

  return apiGet<CharacterListResponse>(`/characters?${query.toString()}`, { cache: 'no-store' })
}

const getCharacterDetail = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiGet<CharacterDetailResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}`, { cache: 'no-store' })
}

const getCharacterVrmSignedUrl = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiGet<CharacterVrmSignedUrlResponse>(
    `/characters/${encodeURIComponent(normalizedCharacterId)}/vrm-signed-url`,
    { cache: 'no-store' }
  )
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

const uploadCharacterAssets = async (
  formData: FormData,
  onProgress?: (progress: CharacterAssetUploadProgress) => void
) => {
  if (onProgress) {
    return apiPostFormDataWithProgress<CharacterAssetUploadResponse>('/characters/assets/upload', formData, {
      onProgress
    })
  }

  return apiPostFormData<CharacterAssetUploadResponse>('/characters/assets/upload', formData)
}

const generateCharacterPreview = async (formData: FormData) => {
  return apiPostFormData<GenerateCharacterPreviewResponse>('/characters/preview/generate', formData, 300000)
}

const listAdminReviewQueue = async () => {
  return apiGet<AdminReviewQueueResponse>('/admin/characters/review-queue?limit=100')
}

const listAdminThumbnailCandidates = async (options?: { search?: string; limit?: number }) => {
  const query = new URLSearchParams()

  if (options?.search && options.search.trim().length > 0) {
    query.set('search', options.search.trim())
  }

  query.set('limit', String(options?.limit ?? 500))

  return apiGet<AdminThumbnailCandidatesResponse>(`/admin/characters/thumbnail-candidates?${query.toString()}`)
}

const generateCharacterThumbnails = async (
  characterId: string,
  payload: GenerateCharacterThumbnailsPayload
) => {
  const normalizedCharacterId = characterId.trim()
  return apiPost<GenerateCharacterThumbnailsResponse>(
    `/admin/characters/${encodeURIComponent(normalizedCharacterId)}/thumbnails/generate`,
    payload,
    120000
  )
}

const generateBulkCharacterThumbnails = async (payload: GenerateBulkCharacterThumbnailsPayload) => {
  return apiPost<GenerateBulkCharacterThumbnailsResponse>(
    '/admin/characters/thumbnails/generate-bulk',
    payload,
    300000
  )
}

const moderateCharacterStatus = async (characterId: string, status: CharacterStatus, rejectReason?: string) => {
  const normalizedCharacterId = characterId.trim()
  return apiPatch<UpdateCharacterStatusResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/status`, {
    status,
    ...(status === 'REJECTED' && rejectReason !== undefined ? { rejectReason } : {})
  })
}

const deleteCharacter = async (characterId: string) => {
  const normalizedCharacterId = characterId.trim()
  return apiDelete<DeleteCharacterResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}`)
}

export {
  createCharacter,
  deleteCharacter,
  generateCharacterPreview,
  generateBulkCharacterThumbnails,
  generateCharacterThumbnails,
  getCharacterDetail,
  getCharacterVrmSignedUrl,
  listAdminThumbnailCandidates,
  listAdminReviewQueue,
  listCharacters,
  listMyCharacters,
  moderateCharacterStatus,
  submitCharacterForReview,
  toggleCharacterHeart,
  updateCharacter,
  uploadCharacterAssets
}
export type {
  CharacterAssetUploadResponse,
  CharacterAssetUploadProgress,
  CharacterActionAccess,
  DeleteCharacterResponse,
  AdminReviewQueueRecord,
  AdminThumbnailCandidateRecord,
  CharacterDetailRecord,
  CharacterPublicationIntent,
  CharacterVrmSignedUrlResponse,
  GenerateCharacterPreviewResponse,
  GenerateBulkCharacterThumbnailsPayload,
  GenerateBulkCharacterThumbnailsResponse,
  GenerateCharacterThumbnailsPayload,
  GenerateCharacterThumbnailsResponse,
  CharacterListRecord,
  CharacterMineRecord,
  CharacterStatus,
  CharacterVisibility,
  CreateCharacterPayload,
  CreateCharacterResponse,
  InitialCharacterStoryPayload,
  GalleryScope,
  GallerySort,
  ThumbnailSource,
  UpdateCharacterPayload,
  UpdateCharacterResponse,
  UpdateCharacterStatusResponse,
  SubmitCharacterForReviewResponse,
  CharacterMineListResponse,
  ToggleCharacterHeartResponse
}
