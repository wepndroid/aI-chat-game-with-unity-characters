import Link from 'next/link'

type MarketingPlaceholderPageProps = {
  title: string
  description: string
  bulletList?: string[]
  primaryActionLabel: string
  primaryActionHref: string
  secondaryActionLabel?: string
  secondaryActionHref?: string
}

const MarketingPlaceholderPage = ({
  title,
  description,
  bulletList = [],
  primaryActionLabel,
  primaryActionHref,
  secondaryActionLabel,
  secondaryActionHref
}: MarketingPlaceholderPageProps) => {
  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.16),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-5xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">{description}</p>

          {bulletList.length > 0 ? (
            <ul className="mx-auto mt-8 max-w-3xl space-y-2 rounded-xl border border-white/10 bg-[#121212]/95 p-5 text-sm text-white/80">
              {bulletList.map((bulletItem) => (
                <li key={bulletItem}>{bulletItem}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primaryActionHref}
              className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-xs font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
              aria-label={primaryActionLabel}
            >
              {primaryActionLabel}
            </Link>

            {secondaryActionHref && secondaryActionLabel ? (
              <Link
                href={secondaryActionHref}
                className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md border border-white/20 px-6 text-xs font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200"
                aria-label={secondaryActionLabel}
              >
                {secondaryActionLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default MarketingPlaceholderPage
