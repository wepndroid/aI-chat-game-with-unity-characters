import { apiDelete, apiGet, apiPatch, apiPost, apiPostFormData, buildApiUrl } from '@/lib/api-client'

type NewsArticleRecord = {
  id: string
  slug: string
  title: string
  summary: string | null
  contentHtml: string
  isPublished: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

type UpsertNewsArticlePayload = {
  slug: string
  title: string
  summary?: string | null
  contentHtml: string
  isPublished: boolean
}

const getAdminNewsArticles = async () => apiGet<{ data: NewsArticleRecord[] }>('/admin/news')

const createNewsArticle = async (payload: UpsertNewsArticlePayload) =>
  apiPost<{ data: NewsArticleRecord }>('/admin/news', payload)

const updateNewsArticle = async (articleId: string, payload: UpsertNewsArticlePayload) =>
  apiPatch<{ data: NewsArticleRecord }>(`/admin/news/${articleId}`, payload)

const deleteNewsArticleById = async (articleId: string) =>
  apiDelete<{ data: { deleted: boolean } }>(`/admin/news/${articleId}`)

const uploadNewsImage = async (formData: FormData) =>
  apiPostFormData<{ data: { url: string } }>('/admin/news/images', formData, 2 * 60 * 1000)

const getPublicNewsArticles = async () => {
  const response = await fetch(buildApiUrl('/news/public'), {
    next: {
      revalidate: 60
    }
  })

  if (!response.ok) {
    throw new Error('Unable to load news articles.')
  }

  return (await response.json()) as { data: NewsArticleRecord[] }
}

const getPublicNewsArticleBySlug = async (slug: string) => {
  const response = await fetch(buildApiUrl(`/news/public/${encodeURIComponent(slug)}`), {
    next: {
      revalidate: 60
    }
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to load news article.')
  }

  return (await response.json()) as { data: NewsArticleRecord }
}

export {
  createNewsArticle,
  deleteNewsArticleById,
  getAdminNewsArticles,
  getPublicNewsArticleBySlug,
  getPublicNewsArticles,
  updateNewsArticle,
  uploadNewsImage
}
export type { NewsArticleRecord, UpsertNewsArticlePayload }
