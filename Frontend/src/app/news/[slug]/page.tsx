import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicNewsArticleBySlug } from '@/lib/news-api'
import { sanitizeStaticPageHtml } from '@/lib/sanitize-static-page-html'
import { absoluteUrl } from '@/lib/site'

type NewsArticlePageProps = {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: NewsArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const response = await getPublicNewsArticleBySlug(slug)

  if (!response) {
    return {}
  }

  const article = response.data
  return {
    title: article.title,
    description: article.summary || 'SecretWaifu update',
    alternates: {
      canonical: `/news/${article.slug}`
    },
    openGraph: {
      title: article.title,
      description: article.summary || 'SecretWaifu update',
      url: absoluteUrl(`/news/${article.slug}`)
    }
  }
}

const NewsArticlePage = async ({ params }: NewsArticlePageProps) => {
  const { slug } = await params
  const response = await getPublicNewsArticleBySlug(slug)

  if (!response) {
    notFound()
  }

  const article = response.data

  return (
    <main className="bg-[#050505] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <section className="legal-page-shell px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/80">News</p>
            <h1 className="mt-3 font-[family-name:var(--font-heading)] text-[2rem] leading-none text-white sm:text-[2.6rem]">{article.title}</h1>
            {article.summary ? <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-[15px]">{article.summary}</p> : null}
          </div>
          <article className="legal-rich-content mt-8" dangerouslySetInnerHTML={{ __html: sanitizeStaticPageHtml(article.contentHtml) }} />
        </section>
      </div>
    </main>
  )
}

export default NewsArticlePage
