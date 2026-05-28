import { apiDelete, apiGet, apiPatch, apiPost, apiPostFormDataWithProgress, buildApiUrl } from '@/lib/api-client'
import type { WebglReleasePreloadManifest } from '@/lib/webgl-preload'

type GameReleasePlatform = 'WINDOWS' | 'WEBGL'

type ReleaseNewsArticleSummary = {
  id: string
  slug: string
  title: string
  summary: string | null
  isPublished: boolean
}

type GameReleaseRecord = {
  id: string
  platform: GameReleasePlatform
  versionLabel: string
  artifactUrl: string
  runtimeUrl: string
  downloadUrl: string
  artifactFileName: string | null
  storagePath: string | null
  totalBytes: number | null
  fileCount: number | null
  isActive: boolean
  newsArticleId: string | null
  newsArticle: ReleaseNewsArticleSummary | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  preloadManifest?: WebglReleasePreloadManifest | null
}

type PublicGameReleasesResponse = {
  data: {
    windows: GameReleaseRecord | null
    webgl: GameReleaseRecord | null
  }
}

type UploadProgress = {
  loaded: number
  total: number | null
  percent: number | null
}

const getAdminGameReleases = async () => apiGet<{ data: GameReleaseRecord[] }>('/admin/game-releases')

const createWindowsGameRelease = async (
  formData: FormData,
  options?: {
    onProgress?: (progress: UploadProgress) => void
  }
) => apiPostFormDataWithProgress<{ data: GameReleaseRecord }>('/admin/game-releases/windows', formData, { timeoutMs: 15 * 60 * 1000, onProgress: options?.onProgress })

const createWebglGameRelease = async (
  formData: FormData,
  options?: {
    onProgress?: (progress: UploadProgress) => void
  }
) => apiPostFormDataWithProgress<{ data: GameReleaseRecord }>('/admin/game-releases/webgl', formData, { timeoutMs: 15 * 60 * 1000, onProgress: options?.onProgress })

const updateGameRelease = async (releaseId: string, payload: { versionLabel: string; newsArticleId: string | null }) =>
  apiPatch<{ data: GameReleaseRecord }>(`/admin/game-releases/${releaseId}`, payload)

const activateGameRelease = async (releaseId: string) =>
  apiPost<{ data: GameReleaseRecord }>(`/admin/game-releases/${releaseId}/activate`)

const deleteGameReleaseById = async (releaseId: string) =>
  apiDelete<{ data: { deleted: boolean } }>(`/admin/game-releases/${releaseId}`)

const getPublicGameReleases = async () => {
  const response = await fetch(buildApiUrl('/game-releases/public'), {
    next: {
      revalidate: 60
    }
  })

  if (!response.ok) {
    throw new Error('Unable to load game releases.')
  }

  return (await response.json()) as PublicGameReleasesResponse
}

export {
  activateGameRelease,
  createWebglGameRelease,
  createWindowsGameRelease,
  deleteGameReleaseById,
  getAdminGameReleases,
  getPublicGameReleases,
  updateGameRelease
}
export type { GameReleasePlatform, GameReleaseRecord, PublicGameReleasesResponse, ReleaseNewsArticleSummary, UploadProgress, WebglReleasePreloadManifest }
