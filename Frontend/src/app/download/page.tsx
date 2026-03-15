import Link from 'next/link'

const purchasePathList = [
  {
    id: 'itch',
    title: 'Buy On itch.io',
    description: 'Recommended for instant checkout and desktop builds.',
    ctaLabel: 'Open itch.io',
    href: 'https://itch.io'
  },
  {
    id: 'patreon',
    title: 'Unlock With Patreon',
    description: 'Link your Patreon tier and unlock gated content on the website and game.',
    ctaLabel: 'Connect Patreon',
    href: '/members'
  },
  {
    id: 'direct',
    title: 'Direct Download (Placeholder)',
    description: 'Reserved for future first-party website paywall and account-based downloads.',
    ctaLabel: 'Coming Soon',
    href: '/support'
  }
]

const DownloadPage = () => {
  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_36%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-6xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            Download And Purchase
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Purchase-path structure. Production checkout and entitlement flows will connect in later versions.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {purchasePathList.map((pathItem) => (
              <article key={pathItem.id} className="rounded-xl border border-white/10 bg-[#121212]/95 p-5">
                <h2 className="font-[family-name:var(--font-heading)] text-3xl font-semibold italic leading-none text-white">
                  {pathItem.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-white/70">{pathItem.description}</p>
                <Link
                  href={pathItem.href}
                  className="mt-5 inline-flex h-10 min-w-[160px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                  aria-label={pathItem.ctaLabel}
                >
                  {pathItem.ctaLabel}
                </Link>
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
