import { buildApiUrl } from '@/lib/api-client'
import { redirect } from 'next/navigation'

type ShortUrlPageProps = {
  params: Promise<{ key: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type ShortUrlResolution = {
  key: string
  targetPath: string
  landingPageKey?: string | null
  landingPageName?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmContent?: string | null
  utmTerm?: string | null
}

const appendIfMissing = (searchParams: URLSearchParams, key: string, value?: string | null) => {
  const trimmedValue = value?.trim()

  if (trimmedValue && !searchParams.has(key)) {
    searchParams.set(key, trimmedValue)
  }
}

const appendSearchParams = (
  targetPath: string,
  searchParams: Record<string, string | string[] | undefined>,
  resolution: ShortUrlResolution
) => {
  const [pathname, existingQuery = ''] = targetPath.split('?')
  const nextSearchParams = new URLSearchParams(existingQuery)

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'undefined') {
      continue
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        nextSearchParams.append(key, entry)
      }
      continue
    }

    nextSearchParams.set(key, value)
  }

  nextSearchParams.set('sw_short_url', resolution.key)
  appendIfMissing(nextSearchParams, 'utm_source', resolution.utmSource)
  appendIfMissing(nextSearchParams, 'utm_medium', resolution.utmMedium)
  appendIfMissing(nextSearchParams, 'utm_campaign', resolution.utmCampaign)
  appendIfMissing(nextSearchParams, 'utm_content', resolution.utmContent)
  appendIfMissing(nextSearchParams, 'utm_term', resolution.utmTerm)

  if (resolution.landingPageKey) {
    nextSearchParams.set('sw_landing_page', resolution.landingPageKey)
  }
  if (resolution.landingPageName) {
    nextSearchParams.set('sw_landing_page_name', resolution.landingPageName)
  }

  const renderedQuery = nextSearchParams.toString()
  return renderedQuery ? `${pathname}?${renderedQuery}` : pathname
}

const ShortUrlPage = async ({ params, searchParams }: ShortUrlPageProps) => {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  const response = await fetch(buildApiUrl(`/landing-pages/short-urls/${encodeURIComponent(resolvedParams.key)}/resolve`), {
    cache: 'no-store'
  }).catch(() => null)

  if (!response?.ok) {
    redirect('/')
  }

  const payload = (await response.json()) as {
    data?: ShortUrlResolution
  }

  if (!payload.data?.targetPath) {
    redirect('/')
  }

  redirect(appendSearchParams(payload.data.targetPath, resolvedSearchParams, payload.data))
}

export default ShortUrlPage
