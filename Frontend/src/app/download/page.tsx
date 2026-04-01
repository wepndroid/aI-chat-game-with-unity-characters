import Link from 'next/link'

type PurchasePathItem = {
  id: string
  title: string
  description: string
  ctaLabel: string
  href: string
}

const DownloadPage = () => {
  const itchIoUrl = process.env.NEXT_PUBLIC_ITCH_IO_URL?.trim() || 'https://itch.io'
  const patreonUrl = process.env.NEXT_PUBLIC_PATREON_URL ?? '/members'
  // Same env as home; default /support here so “Direct Website Purchase” is not a link to this same page when env is unset.
  const directPurchaseUrl = process.env.NEXT_PUBLIC_DIRECT_PURCHASE_URL?.trim() || '/support'

  const purchasePathList: PurchasePathItem[] = [
    {
      id: 'purchase-webgl',
      title: 'Play Free WebGL Demo',
      description: 'Try the game instantly in browser before purchasing.',
      ctaLabel: 'Launch Demo',
      href: '/play-demo'
    },
    {
      id: 'purchase-itch',
      title: 'Buy On itch.io',
      description: 'Recommended path for full game checkout and release builds.',
      ctaLabel: 'Open itch.io',
      href: itchIoUrl
    },
    {
      id: 'purchase-patreon',
      title: 'Patreon Membership',
      description: 'Use your tier to unlock gated content and synced account perks.',
      ctaLabel: 'Open Patreon',
      href: patreonUrl
    },
    {
      id: 'purchase-direct',
      title: 'Direct Website Purchase',
      description: 'Future-ready direct purchase path for first-party checkout flow.',
      ctaLabel: 'Open Direct Purchase',
      href: directPurchaseUrl
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
            Download And Purchase
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Compare available purchase and access paths. Configure external links via environment variables for production.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {purchasePathList.map((pathItem) => (
              <article key={pathItem.id} className="rounded-xl border border-white/10 bg-[#121212]/95 p-5">
                <h2 className="font-[family-name:var(--font-heading)] text-3xl font-semibold italic leading-none text-white">
                  {pathItem.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/70">{pathItem.description}</p>

                {isExternalHref(pathItem.href) ? (
                  <a
                    href={pathItem.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex h-10 min-w-[160px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                    aria-label={pathItem.ctaLabel}
                  >
                    {pathItem.ctaLabel}
                  </a>
                ) : (
                  <Link
                    href={pathItem.href}
                    className="mt-5 inline-flex h-10 min-w-[160px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                    aria-label={pathItem.ctaLabel}
                  >
                    {pathItem.ctaLabel}
                  </Link>
                )}
              </article>
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            <Link
              href="/play-demo"
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label="Play browser demo"
            >
              Play Browser Demo
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default DownloadPage
