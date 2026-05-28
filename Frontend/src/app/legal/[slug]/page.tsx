import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicStaticPage } from '@/lib/static-page-api'
import { sanitizeStaticPageHtml } from '@/lib/sanitize-static-page-html'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 300
export const dynamic = 'force-dynamic'

type LegalStaticPageProps = {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: LegalStaticPageProps): Promise<Metadata> {
  const { slug } = await params
  const response = await getPublicStaticPage(slug)

  if (!response) {
    return {}
  }

  const page = response.data
  const title = page.metaTitle || page.title
  const description = page.metaDescription || page.summary || page.title

  return {
    title,
    description,
    alternates: {
      canonical: `/legal/${page.slug}`
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl(`/legal/${page.slug}`)
    }
  }
}

const LegalStaticPage = async ({ params }: LegalStaticPageProps) => {
  const { slug } = await params
  const response = await getPublicStaticPage(slug)

  if (!response) {
    notFound()
  }

  const page = response.data

  return (
    <main className="bg-[#050505] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <section className="legal-page-shell px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/8 pb-6">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/80">Legal</p>
              <h1 className="mt-3 font-[family-name:var(--font-heading)] text-[2rem] leading-none text-white sm:text-[2.6rem]">{page.title}</h1>
              {page.summary ? <p className="mt-4 text-sm leading-7 text-white/62 sm:text-[15px]">{page.summary}</p> : null}
            </div>
            {page.revisionDate ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Revision</p>
                <p className="mt-1 text-sm text-white/75">{page.revisionDate}</p>
              </div>
            ) : null}
          </div>
          <article className="legal-rich-content mt-8" dangerouslySetInnerHTML={{ __html: sanitizeStaticPageHtml(page.contentHtml) }} />
        </section>
      </div>
    </main>
  )
}

export default LegalStaticPage
