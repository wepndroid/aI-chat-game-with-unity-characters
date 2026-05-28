'use client'

import Link from 'next/link'

type LatestUpdateArticle = {
  slug: string
  title: string
  summary: string | null
}

type LatestUpdateCardProps = {
  article: LatestUpdateArticle | null
  buttonLabel?: string
  className?: string
  sectionLabel?: string
}

const LatestUpdateCard = ({
  article,
  buttonLabel = 'Read More',
  className = '',
  sectionLabel = 'Latest Update'
}: LatestUpdateCardProps) => {
  if (!article) {
    return null
  }

  return (
    <section className={className}>
      <div className="rounded-2xl border border-white/10 bg-[#111111]/95 px-5 py-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300/80">{sectionLabel}</p>
        <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-semibold italic leading-none text-white">
          {article.title}
        </h2>
        {article.summary ? (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/70">{article.summary}</p>
        ) : (
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">Open the full post for the complete update notes.</p>
        )}
        <div className="mt-5">
          <Link
            href={`/news/${article.slug}`}
            className="inline-flex h-10 min-w-[190px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
          >
            {buttonLabel}
          </Link>
        </div>
      </div>
    </section>
  )
}

export default LatestUpdateCard
