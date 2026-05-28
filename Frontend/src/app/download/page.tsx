import type { Metadata } from 'next'
import Link from 'next/link'
import LatestUpdateCard from '@/components/ui-elements/latest-update-card'
import { getPublicGameReleases } from '@/lib/game-release-api'
import { absoluteUrl } from '@/lib/site'

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Downloads'
  const description =
    'Download SecretWaifu for Windows and play the AI anime girlfriend experience on desktop with the latest build links and update notes.'

  return {
    title,
    description,
    alternates: {
      canonical: '/download'
    },
    openGraph: {
      title: `${title} | SecretWaifu.com`,
      description,
      url: absoluteUrl('/download'),
      images: ['/images/Upload-VRM.png']
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SecretWaifu.com`,
      description,
      images: ['/images/Upload-VRM.png']
    }
  }
}

type DownloadPlatformItem = {
  id: string
  title: string
  description: string
  ctaLabel: string
  href?: string
  versionLabel?: string | null
}

const DownloadPage = async () => {
  const publicReleasePayload = await getPublicGameReleases().catch(() => null)
  const activeWindowsRelease = publicReleasePayload?.data.windows ?? null
  const windowsDownloadUrl = activeWindowsRelease?.downloadUrl || process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL?.trim() || '/support'

  const platformDownloadList: DownloadPlatformItem[] = [
      {
        id: 'download-windows',
        title: 'Windows',
        description: 'Current available build for desktop players.',
        ctaLabel: 'Download for Windows',
        href: windowsDownloadUrl,
        versionLabel: activeWindowsRelease?.versionLabel ?? null
      }
    ]

  const isExternalHref = (href: string) => href.startsWith('http://') || href.startsWith('https://')

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_36%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-6xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            Downloads
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Download by platform. Right now only Windows is available.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {platformDownloadList.map((platformItem) => (
              <article key={platformItem.id} className="rounded-xl border border-white/10 bg-[#121212]/95 p-5">
                <h2 className="font-[family-name:var(--font-heading)] text-3xl font-semibold italic leading-none text-white">
                  {platformItem.title}
                </h2>
                {platformItem.versionLabel ? (
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ember-300/80">
                    Live version: {platformItem.versionLabel}
                  </p>
                ) : null}
                <p className="mt-3 text-sm leading-6 text-white/70">{platformItem.description}</p>

                {platformItem.href ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    {isExternalHref(platformItem.href) ? (
                      <a
                        href={platformItem.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 min-w-[200px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                        aria-label={platformItem.ctaLabel}
                      >
                        {platformItem.ctaLabel}
                      </a>
                    ) : (
                      <Link
                        href={platformItem.href}
                        className="inline-flex h-10 min-w-[200px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                        aria-label={platformItem.ctaLabel}
                      >
                        {platformItem.ctaLabel}
                      </Link>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="mt-5 inline-flex h-10 min-w-[200px] cursor-not-allowed items-center justify-center rounded-md border border-white/15 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/35"
                    aria-label={`${platformItem.title} coming soon`}
                  >
                    {platformItem.ctaLabel}
                  </button>
                )}
              </article>
            ))}
          </div>

          <LatestUpdateCard article={activeWindowsRelease?.newsArticle ?? null} className="mt-10" />

        </div>
      </section>
    </main>
  )
}

export default DownloadPage
