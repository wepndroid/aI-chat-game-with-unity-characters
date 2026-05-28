import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicStaticPage } from '@/lib/static-page-api'
import { sanitizeStaticPageHtml } from '@/lib/sanitize-static-page-html'
import { absoluteUrl } from '@/lib/site'

export const revalidate = 300
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const response = await getPublicStaticPage('legal')

  if (!response) {
    return {}
  }

  const page = response.data
  const title = page.metaTitle || page.title
  const description = page.metaDescription || page.summary || 'Legal information'

  return {
    title,
    description,
    alternates: {
      canonical: '/legal'
    },
    openGraph: {
      title,
      description,
      url: absoluteUrl('/legal')
    }
  }
}

const LegalIndexPage = async () => {
  const response = await getPublicStaticPage('legal')

  if (!response) {
    notFound()
  }

  const page = response.data

  return (
    <main className="bg-[#050505] px-4 py-10 text-white sm:px-6 sm:py-14 lg:px-10 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <section className="legal-page-shell px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300/80">Legal Hub</p>
            <h1 className="mt-3 font-[family-name:var(--font-heading)] text-[2rem] leading-none text-white sm:text-[2.6rem]">{page.title}</h1>
            {page.summary ? <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-[15px]">{page.summary}</p> : null}
          </div>
          <article className="legal-rich-content mt-8" dangerouslySetInnerHTML={{ __html: sanitizeStaticPageHtml(page.contentHtml) }} />
        </section>
      </div>
    </main>
  )
}

export default LegalIndexPage
