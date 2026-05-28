import type { Metadata } from 'next'
import Link from 'next/link'
import { getPublicNewsArticles } from '@/lib/news-api'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'News',
  description: 'Latest SecretWaifu updates, release notes, and announcements.',
  alternates: {
    canonical: '/news'
  },
  openGraph: {
    title: 'News | SecretWaifu.com',
    description: 'Latest SecretWaifu updates, release notes, and announcements.',
    url: absoluteUrl('/news')
  }
}

const NewsPage = async () => {
  const payload = await getPublicNewsArticles().catch(() => ({ data: [] }))

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-140px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,99,19,0.14),transparent_34%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:22px_22px] opacity-45" />

        <div className="relative z-10 mx-auto w-full max-w-5xl pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-5xl font-semibold italic leading-none text-white md:text-6xl">
            News
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-7 text-white/75">
            Release notes, updates, and announcements from SecretWaifu.
          </p>

          <div className="mt-10 space-y-4">
            {payload.data.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-5 py-6 text-sm text-white/55">
                No news articles have been published yet.
              </div>
            ) : (
              payload.data.map((article) => (
                <article key={article.id} className="rounded-2xl border border-white/10 bg-[#111111]/95 px-5 py-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-300/80">
                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(article.createdAt))}
                  </p>
                  <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-semibold italic leading-none text-white">
                    {article.title}
                  </h2>
                  {article.summary ? <p className="mt-4 max-w-3xl text-sm leading-7 text-white/70">{article.summary}</p> : null}
                  <div className="mt-5">
                    <Link
                      href={`/news/${article.slug}`}
                      className="inline-flex h-10 min-w-[190px] items-center justify-center rounded-md border border-ember-300/40 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300 hover:text-white"
                    >
                      Read Article
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

export default NewsPage
