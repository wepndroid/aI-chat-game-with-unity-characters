'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import ChangelogRichEditor from '@/components/ui-elements/changelog-rich-editor'
import {
  createNewsArticle,
  deleteNewsArticleById,
  getAdminNewsArticles,
  updateNewsArticle,
  uploadNewsImage,
  type NewsArticleRecord
} from '@/lib/news-api'
import { useEffect, useState } from 'react'

const sectionClassName = 'mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6'
const labelClassName = 'text-xs font-semibold uppercase tracking-[0.08em] text-white/65'
const inputClassName =
  'mt-1 w-full rounded-md border border-white/20 bg-[#0f1116]/90 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/45 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35'

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

const NewsPage = () => {
  const [articleList, setArticleList] = useState<NewsArticleRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [summary, setSummary] = useState('')
  const [contentHtml, setContentHtml] = useState('<h2>Update headline</h2><p>Write the article here.</p>')
  const [isPublished, setIsPublished] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const loadArticles = async () => {
    const payload = await getAdminNewsArticles()
    setArticleList(payload.data)
  }

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)
      try {
        const payload = await getAdminNewsArticles()
        if (!isCancelled) {
          setArticleList(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load news articles.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  const resetForm = () => {
    setEditingArticleId(null)
    setTitle('')
    setSlug('')
    setSummary('')
    setContentHtml('<h2>Update headline</h2><p>Write the article here.</p>')
    setIsPublished(true)
  }

  const handleUploadImage = async (file: File) => {
    setErrorMessage(null)
    const formData = new FormData()
    formData.append('image', file)
    const payload = await uploadNewsImage(formData)
    return payload.data.url
  }

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const payload = {
        slug,
        title,
        summary: summary.trim() || null,
        contentHtml,
        isPublished
      }

      if (editingArticleId) {
        await updateNewsArticle(editingArticleId, payload)
        setSuccessMessage('News article updated.')
      } else {
        await createNewsArticle(payload)
        setSuccessMessage('News article created.')
      }

      await loadArticles()
      resetForm()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save the news article.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AdminPageShell activeKey="news">
      <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
        News
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-[#95a6c1]">
        Write update articles once, publish them when they are ready, and attach the same article to any platform release.
      </p>
      {isLoading ? <p className="mt-4 text-sm text-white/70">Loading articles...</p> : null}
      {errorMessage ? <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p> : null}
      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <section className={sectionClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">
              {editingArticleId ? 'Edit Article' : 'Create Article'}
            </h2>
            <p className="mt-2 text-sm text-white/55">This editor supports screenshots and rich formatting for patch notes and announcements.</p>
          </div>
          {editingArticleId ? (
            <button
              type="button"
              className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/35 hover:text-white"
              onClick={resetForm}
              disabled={isSaving}
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className={labelClassName}>Title</span>
            <input
              className={inputClassName}
              value={title}
              onChange={(event) => {
                const nextTitle = event.target.value
                setTitle(nextTitle)
                if (!editingArticleId || slug.length === 0 || slug === slugify(title)) {
                  setSlug(slugify(nextTitle))
                }
              }}
              disabled={isSaving}
            />
          </label>
          <label className="block">
            <span className={labelClassName}>Slug</span>
            <input className={inputClassName} value={slug} onChange={(event) => setSlug(slugify(event.target.value))} disabled={isSaving} />
          </label>
        </div>

        <label className="mt-4 block">
          <span className={labelClassName}>Summary</span>
          <textarea className={inputClassName} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} disabled={isSaving} />
        </label>

        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm font-medium text-white/70">
          <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} disabled={isSaving} />
          Published and visible on the public site
        </label>

        <div className="mt-5">
          <p className={labelClassName}>Article body</p>
          <div className="mt-3">
            <ChangelogRichEditor value={contentHtml} onChange={setContentHtml} onUploadImage={handleUploadImage} disabled={isSaving} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={() => {
              void handleSave()
            }}
            disabled={isSaving || isLoading}
          >
            {isSaving ? 'Saving...' : editingArticleId ? 'Save Article' : 'Create Article'}
          </button>
          {!editingArticleId ? (
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/75 transition hover:border-white/35 hover:text-white"
              onClick={resetForm}
              disabled={isSaving}
            >
              Clear Form
            </button>
          ) : null}
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Articles</h2>
        <div className="mt-5 space-y-4">
          {articleList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-5 text-sm text-white/55">
              No news articles yet.
            </div>
          ) : (
            articleList.map((article) => (
              <article key={article.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{article.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          article.isPublished
                            ? 'bg-emerald-400/15 text-emerald-200'
                            : 'bg-amber-400/15 text-amber-100'
                        }`}
                      >
                        {article.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-white/50">
                      `/news/{article.slug}` • {formatDateTime(article.createdAt)}
                    </p>
                    {article.summary ? <p className="mt-2 max-w-3xl text-sm text-white/65">{article.summary}</p> : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75 transition hover:border-white/35 hover:text-white"
                      disabled={isSaving}
                      onClick={() => {
                        setEditingArticleId(article.id)
                        setTitle(article.title)
                        setSlug(article.slug)
                        setSummary(article.summary ?? '')
                        setContentHtml(article.contentHtml)
                        setIsPublished(article.isPublished)
                        setErrorMessage(null)
                        setSuccessMessage(null)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-rose-300/30 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-rose-100 transition hover:border-rose-300/60"
                      disabled={isSaving}
                      onClick={() => {
                        void (async () => {
                          setIsSaving(true)
                          setErrorMessage(null)
                          setSuccessMessage(null)
                          try {
                            await deleteNewsArticleById(article.id)
                            await loadArticles()
                            setSuccessMessage(`${article.title} was deleted.`)
                            if (editingArticleId === article.id) {
                              resetForm()
                            }
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : 'Failed to delete the article.')
                          } finally {
                            setIsSaving(false)
                          }
                        })()
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </AdminPageShell>
  )
}

export default NewsPage
