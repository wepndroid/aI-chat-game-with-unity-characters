import { apiGet, apiPatch, apiPost, buildApiUrl } from '@/lib/api-client'

type StaticPageRecord = {
  id: string
  slug: string
  title: string
  summary: string | null
  metaTitle: string | null
  metaDescription: string | null
  contentHtml: string
  sourceUrl: string | null
  revisionDate: string | null
  isPublished: boolean
  showInFooter: boolean
  footerLabel: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

type FooterStaticPageRecord = {
  slug: string
  title: string
  footerLabel: string
  sortOrder: number
}

type UpsertStaticPagePayload = {
  slug: string
  title: string
  summary?: string | null
  metaTitle?: string | null
  metaDescription?: string | null
  contentHtml: string
  sourceUrl?: string | null
  revisionDate?: string | null
  isPublished?: boolean
  showInFooter?: boolean
  footerLabel?: string | null
  sortOrder?: number
}

const getAdminStaticPages = async () => apiGet<{ data: StaticPageRecord[] }>('/admin/static-pages')

const createStaticPage = async (payload: UpsertStaticPagePayload) => apiPost<{ data: StaticPageRecord }>('/admin/static-pages', payload)

const updateStaticPage = async (pageId: string, payload: Partial<UpsertStaticPagePayload>) =>
  apiPatch<{ data: StaticPageRecord }>(`/admin/static-pages/${pageId}`, payload)

const getFooterStaticPages = async () => apiGet<{ data: FooterStaticPageRecord[] }>('/static-pages/footer')

const getPublicStaticPage = async (slug: string) => {
  const response = await fetch(buildApiUrl(`/static-pages/${encodeURIComponent(slug)}`), {
    next: {
      revalidate: 300
    }
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to load static page.')
  }

  return (await response.json()) as { data: StaticPageRecord }
}

export { createStaticPage, getAdminStaticPages, getFooterStaticPages, getPublicStaticPage, updateStaticPage }
export type { FooterStaticPageRecord, StaticPageRecord, UpsertStaticPagePayload }
