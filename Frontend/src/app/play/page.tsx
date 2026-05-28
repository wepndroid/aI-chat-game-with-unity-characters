import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getPublicGameReleases } from '@/lib/game-release-api'
import PlayClient from './play-client'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  alternates: {
    canonical: '/play'
  }
}

const PlayFallback = () => (
  <main className="relative min-h-[calc(100vh-140px)] bg-[#030303] text-white">
    <div className="mx-auto max-w-6xl px-5 pt-24 text-center text-sm text-white/70">Loading game...</div>
  </main>
)

const PlayPage = async () => {
  const publicReleasePayload = await getPublicGameReleases().catch(() => null)
  const activeWebglRelease = publicReleasePayload?.data.webgl ?? null
  const developmentWebglEmbedUrl =
    process.env.NODE_ENV === 'production' ? '' : process.env.NEXT_PUBLIC_WEBGL_EMBED_URL?.trim() ?? ''

  return (
    <Suspense fallback={<PlayFallback />}>
      <PlayClient
        webglEmbedUrl={activeWebglRelease?.runtimeUrl ?? developmentWebglEmbedUrl}
        webglPreloadManifest={activeWebglRelease?.preloadManifest ?? null}
        localCoreDownloadTotalBytes={activeWebglRelease?.totalBytes ?? null}
        releaseVersionLabel={activeWebglRelease?.versionLabel ?? null}
        releaseNewsArticle={
          activeWebglRelease?.newsArticle
            ? {
                slug: activeWebglRelease.newsArticle.slug,
                title: activeWebglRelease.newsArticle.title,
                summary: activeWebglRelease.newsArticle.summary
              }
            : null
        }
      />
    </Suspense>
  )
}

export default PlayPage
