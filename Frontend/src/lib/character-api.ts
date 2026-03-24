import { apiGet, apiPost } from '@/lib/api-client'

type CharacterListRecord = {
  id: string
  slug: string
  name: string
  tagline: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
  averageRating: number
  viewsCount: number
  previewImageUrl: string | null
  owner: {
    id: string
    username: string
  }
  createdAt: string
  updatedAt: string
}

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
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
  hasHearted: boolean
  averageRating: number
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
  visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
}

type CreateCharacterResponse = {
  data: {
    id: string
    slug: string
    name: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
    visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
    createdAt: string
  }
}

type ToggleCharacterHeartResponse = {
  data: {
    hasHearted: boolean
    heartsCount: number
  }
}

const listCharacters = async (searchText?: string) => {
  const query = new URLSearchParams()

  if (searchText && searchText.trim().length > 0) {
    query.set('search', searchText.trim())
  }

  query.set('limit', '72')
  const querySuffix = query.toString().length > 0 ? `?${query.toString()}` : ''

  return apiGet<CharacterListResponse>(`/characters${querySuffix}`)
}

const getCharacterDetail = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiGet<CharacterDetailResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}`)
}

const createCharacter = async (payload: CreateCharacterPayload) => {
  return apiPost<CreateCharacterResponse>('/characters', payload)
}

const toggleCharacterHeart = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiPost<ToggleCharacterHeartResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/heart/toggle`, {})
}

export { createCharacter, getCharacterDetail, listCharacters, toggleCharacterHeart }
export type {
  CharacterDetailRecord,
  CharacterListRecord,
  CreateCharacterPayload,
  CreateCharacterResponse,
  ToggleCharacterHeartResponse
}
