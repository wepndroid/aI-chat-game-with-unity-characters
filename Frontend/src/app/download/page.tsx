import Link from 'next/link'

type DownloadPlatformItem = {
  id: string
  title: string
  description: string
  ctaLabel: string
  href?: string
}

const DownloadPage = () => {
  // Download target for current Windows build.
  const windowsDownloadUrl = process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL?.trim() || '/support'

  const platformDownloadList: DownloadPlatformItem[] = [
    {
      id: 'download-windows',
      title: 'Windows',
      description: 'Current available build for desktop players.',
      ctaLabel: 'Download for Windows',
      href: windowsDownloadUrl
    },
    
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
                <p className="mt-3 text-sm leading-6 text-white/70">{platformItem.description}</p>

                {platformItem.href ? (
                  isExternalHref(platformItem.href) ? (
                    <a
                      href={platformItem.href}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-5 inline-flex h-10 min-w-[200px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                      aria-label={platformItem.ctaLabel}
                    >
                      {platformItem.ctaLabel}
                    </a>
                  ) : (
                    <Link
                      href={platformItem.href}
                      className="mt-5 inline-flex h-10 min-w-[200px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                      aria-label={platformItem.ctaLabel}
                    >
                      {platformItem.ctaLabel}
                    </Link>
                  )
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

          <div className="mt-8 flex justify-center">
            <Link
              href={windowsDownloadUrl}
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Download Windows build"
            >
              Download Windows Build
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default DownloadPage
