import { apiGet } from '@/lib/api-client'

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
  tagline: string | null
  description: string | null
  vroidFileUrl: string | null
  previewImageUrl: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
  isPatreonGated: boolean
  minimumTierCents: number | null
  heartsCount: number
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
}

type CharacterListResponse = {
  data: CharacterListRecord[]
}

type CharacterDetailResponse = {
  data: CharacterDetailRecord
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

export { getCharacterDetail, listCharacters }
export type { CharacterDetailRecord, CharacterListRecord }
