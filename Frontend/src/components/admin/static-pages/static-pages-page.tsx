'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { createStaticPage, getAdminStaticPages, updateStaticPage, type StaticPageRecord } from '@/lib/static-page-api'
import { useEffect, useState } from 'react'

type StaticPageFormState = {
  slug: string
  title: string
  summary: string
  metaTitle: string
  metaDescription: string
  contentHtml: string
  sourceUrl: string
  revisionDate: string
  isPublished: boolean
  showInFooter: boolean
  footerLabel: string
  sortOrder: string
}

const toFormState = (page?: StaticPageRecord): StaticPageFormState => ({
  slug: page?.slug ?? '',
  title: page?.title ?? '',
  summary: page?.summary ?? '',
  metaTitle: page?.metaTitle ?? '',
  metaDescription: page?.metaDescription ?? '',
  contentHtml: page?.contentHtml ?? '',
  sourceUrl: page?.sourceUrl ?? '',
  revisionDate: page?.revisionDate ?? '',
  isPublished: page?.isPublished ?? true,
  showInFooter: page?.showInFooter ?? false,
  footerLabel: page?.footerLabel ?? '',
  sortOrder: String(page?.sortOrder ?? 0)
})

const StaticPagesPage = () => {
  const [pages, setPages] = useState<StaticPageRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<StaticPageFormState>(toFormState())
  const [editForms, setEditForms] = useState<Record<string, StaticPageFormState>>({})
  const [openEditorId, setOpenEditorId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [savingPageId, setSavingPageId] = useState<string | null>(null)

  const loadPages = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const response = await getAdminStaticPages()
      setPages(response.data)
      setEditForms(Object.fromEntries(response.data.map((page) => [page.id, toFormState(page)])))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load static pages.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPages()
  }, [])

  const buildPayload = (form: StaticPageFormState) => ({
    slug: form.slug,
    title: form.title,
    summary: form.summary || null,
    metaTitle: form.metaTitle || null,
    metaDescription: form.metaDescription || null,
    contentHtml: form.contentHtml,
    sourceUrl: form.sourceUrl || null,
    revisionDate: form.revisionDate || null,
    isPublished: form.isPublished,
    showInFooter: form.showInFooter,
    footerLabel: form.footerLabel || null,
    sortOrder: Number.parseInt(form.sortOrder || '0', 10) || 0
  })

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await createStaticPage(buildPayload(createForm))
      setCreateForm(toFormState())
      setIsCreateOpen(false)
      setSuccessMessage('Static page created.')
      await loadPages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create static page.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleSave = async (pageId: string) => {
    const form = editForms[pageId]

    if (!form) {
      return
    }

    setSavingPageId(pageId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await updateStaticPage(pageId, buildPayload(form))
      setOpenEditorId(null)
      setSuccessMessage('Static page updated.')
      await loadPages()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update static page.')
    } finally {
      setSavingPageId(null)
    }
  }

  const renderForm = (form: StaticPageFormState, onChange: (nextValue: StaticPageFormState) => void) => (
    <div className="grid gap-3 md:grid-cols-2">
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Slug" value={form.slug} onChange={(event) => onChange({ ...form, slug: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Title" value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2" placeholder="Summary" value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Meta title" value={form.metaTitle} onChange={(event) => onChange({ ...form, metaTitle: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Revision date" value={form.revisionDate} onChange={(event) => onChange({ ...form, revisionDate: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2" placeholder="Meta description" value={form.metaDescription} onChange={(event) => onChange({ ...form, metaDescription: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2" placeholder="Source URL" value={form.sourceUrl} onChange={(event) => onChange({ ...form, sourceUrl: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Footer label" value={form.footerLabel} onChange={(event) => onChange({ ...form, footerLabel: event.target.value })} />
      <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Sort order" type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: event.target.value })} />
      <label className="inline-flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={form.isPublished} onChange={(event) => onChange({ ...form, isPublished: event.target.checked })} />
        Published
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-white/70">
        <input type="checkbox" checked={form.showInFooter} onChange={(event) => onChange({ ...form, showInFooter: event.target.checked })} />
        Show in footer
      </label>
      <textarea className="min-h-[360px] rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 font-mono text-xs text-white md:col-span-2" placeholder="HTML content" value={form.contentHtml} onChange={(event) => onChange({ ...form, contentHtml: event.target.value })} />
    </div>
  )

  return (
    <AdminPageShell activeKey="static-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Static Pages
          </h1>
          <p className="mt-2 max-w-4xl text-sm text-[#95a6c1]">
            Create and maintain public static pages, including legal pages that appear in the site footer.
          </p>
        </div>
        <button type="button" className="rounded-lg bg-ember-400 px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110" onClick={() => setIsCreateOpen((currentValue) => !currentValue)}>
          {isCreateOpen ? 'Close' : 'New Static Page'}
        </button>
      </div>

      {errorMessage ? <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p> : null}

      {isCreateOpen ? (
        <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-5 sm:p-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[20px] text-white">Create Static Page</h2>
          <form className="mt-4 grid gap-4" onSubmit={handleCreate}>
            {renderForm(createForm, setCreateForm)}
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70" disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create Static Page'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-6 grid gap-5">
        {isLoading ? <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-6 text-sm text-white/60">Loading static pages...</div> : null}
        {!isLoading && pages.length === 0 ? <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-6 text-sm text-white/60">No static pages created yet.</div> : null}

        {pages.map((page) => (
          <article key={page.id} className="rounded-3xl border border-white/10 bg-[#0c0f14]/95 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-[family-name:var(--font-heading)] text-[20px] text-white">{page.title}</h3>
                  {!page.isPublished ? <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100">Draft</span> : null}
                  {page.showInFooter ? <span className="rounded-full border border-sky-300/25 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-100">Footer</span> : null}
                </div>
                <p className="mt-1 font-mono text-sm text-sky-200">/legal/{page.slug === 'legal' ? '' : page.slug}</p>
                {page.summary ? <p className="mt-2 max-w-3xl text-sm text-white/60">{page.summary}</p> : null}
              </div>
              <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10" onClick={() => setOpenEditorId((currentValue) => (currentValue === page.id ? null : page.id))}>
                {openEditorId === page.id ? 'Close Editor' : 'Edit'}
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Slug</p>
                <p className="mt-2 text-sm font-semibold text-white">{page.slug}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Footer Label</p>
                <p className="mt-2 text-sm font-semibold text-white">{page.footerLabel ?? '-'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Sort Order</p>
                <p className="mt-2 text-sm font-semibold text-white">{page.sortOrder}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#11161e]/90 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-white/45">Revision</p>
                <p className="mt-2 text-sm font-semibold text-white">{page.revisionDate ?? '-'}</p>
              </div>
            </div>

            {openEditorId === page.id ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
                {renderForm(editForms[page.id] ?? toFormState(page), (nextValue) =>
                  setEditForms((currentValue) => ({
                    ...currentValue,
                    [page.id]: nextValue
                  }))
                )}
                <div className="mt-4 flex gap-2">
                  <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70" disabled={savingPageId === page.id} onClick={() => void handleSave(page.id)}>
                    {savingPageId === page.id ? 'Saving...' : 'Save Static Page'}
                  </button>
                  <button type="button" className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white" onClick={() => setOpenEditorId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </AdminPageShell>
  )
}

export default StaticPagesPage
