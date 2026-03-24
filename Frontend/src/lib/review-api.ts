import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api-client'

type CharacterReviewRecord = {
  id: string
  rating: number
  body: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    username: string
  }
}

type CharacterReviewListResponse = {
  data: CharacterReviewRecord[]
}

type CreateCharacterReviewPayload = {
  rating: number
  body: string
}

type CreateCharacterReviewResponse = {
  data: {
    review: {
      id: string
      rating: number
      body: string
      characterId: string
      createdAt: string
      updatedAt: string
    }
    averageRating: number
  }
}

type UpdateCharacterReviewPayload = {
  rating?: number
  body?: string
}

type UpdateCharacterReviewResponse = {
  data: {
    review: {
      id: string
      rating: number
      body: string
      characterId: string
      createdAt: string
      updatedAt: string
    }
    averageRating: number
  }
}

type DeleteCharacterReviewResponse = {
  data: {
    deleted: boolean
    characterId: string
    averageRating: number
  }
}

const listCharacterReviews = async (characterIdOrSlug: string) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiGet<CharacterReviewListResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/reviews?limit=50`)
}

const createCharacterReview = async (characterIdOrSlug: string, payload: CreateCharacterReviewPayload) => {
  const normalizedCharacterId = characterIdOrSlug.trim()
  return apiPost<CreateCharacterReviewResponse>(`/characters/${encodeURIComponent(normalizedCharacterId)}/reviews`, payload)
}

const updateCharacterReview = async (reviewId: string, payload: UpdateCharacterReviewPayload) => {
  const normalizedReviewId = reviewId.trim()
  return apiPatch<UpdateCharacterReviewResponse>(`/reviews/${encodeURIComponent(normalizedReviewId)}`, payload)
}

const deleteCharacterReview = async (reviewId: string) => {
  const normalizedReviewId = reviewId.trim()
  return apiDelete<DeleteCharacterReviewResponse>(`/reviews/${encodeURIComponent(normalizedReviewId)}`)
}

export { createCharacterReview, deleteCharacterReview, listCharacterReviews, updateCharacterReview }
export type {
  CharacterReviewRecord,
  CharacterReviewListResponse,
  CreateCharacterReviewPayload,
  CreateCharacterReviewResponse,
  UpdateCharacterReviewPayload,
  UpdateCharacterReviewResponse,
  DeleteCharacterReviewResponse
}
