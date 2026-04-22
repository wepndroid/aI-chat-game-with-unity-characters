'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminKpiCard from '@/components/ui-elements/admin-kpi-card'
import {
  createLandingPage,
  createLandingPageVariant,
  getLandingPageOptions,
  getLandingPagesAnalytics,
  type LandingPageOptionsResponse,
  type LandingPagesAnalyticsResponse,
  updateLandingPage,
  updateLandingPageVariant
} from '@/lib/landing-page-api'
import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(value)

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <path d="M4 19.2h16" strokeLinecap="round" />
    <path d="M7 16V9.5M12 16V5M17 16v-3.5" strokeLinecap="round" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.4-2.4a4 4 0 0 0-5.7-5.7l-1 1" strokeLinecap="round" />
    <path d="M13.4 10.6a4 4 0 0 0-5.7 0l-2.4 2.4a4 4 0 0 0 5.7 5.7l1-1" strokeLinecap="round" />
  </svg>
)

const UserPlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <circle cx="10" cy="8" r="3" />
    <path d="M4.5 18c.6-2.5 2.7-4 5.5-4s4.9 1.5 5.5 4" strokeLinecap="round" />
    <path d="M18 8v6M15 11h6" strokeLinecap="round" />
  </svg>
)

const CoinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-full" aria-hidden="true">
    <circle cx="12" cy="12" r="7" />
    <path d="M9.5 10.5c0-1.1 1-2 2.5-2s2.5.7 2.5 1.8-1 1.6-2.2 1.9l-.9.2c-1.2.3-2.1.8-2.1 1.9 0 1.1 1 1.9 2.6 1.9 1.5 0 2.6-.8 2.6-2" strokeLinecap="round" />
  </svg>
)

const LandingPagesPage = () => {
  const [analytics, setAnalytics] = useState<LandingPagesAnalyticsResponse['data'] | null>(null)
  const [landingOptions, setLandingOptions] = useState<LandingPageOptionsResponse['data']>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isCreatingLandingPage, setIsCreatingLandingPage] = useState(false)
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const [savingLandingPageId, setSavingLandingPageId] = useState<string | null>(null)
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null)
  const [openLandingPageEditorId, setOpenLandingPageEditorId] = useState<string | null>(null)
  const [openVariantEditorId, setOpenVariantEditorId] = useState<string | null>(null)
  const [showCreateLandingPageForm, setShowCreateLandingPageForm] = useState(false)
  const [showCreateVariantForm, setShowCreateVariantForm] = useState(false)

  const [landingPageForm, setLandingPageForm] = useState({
    key: 'lp-1',
    name: 'Landing Page 1',
    description: '',
    basePath: '/lp-1',
    variantKey: 'control',
    variantName: 'Control',
    variantRoutePath: '/lp-1',
    variantNotes: ''
  })

  const [variantForm, setVariantForm] = useState({
    landingPageId: '',
    key: '',
    name: '',
    routePath: '',
    notes: ''
  })

  const [landingPageEditForms, setLandingPageEditForms] = useState<Record<string, {
    name: string
    key: string
    description: string
    basePath: string
    isActive: boolean
  }>>({})

  const [variantEditForms, setVariantEditForms] = useState<Record<string, {
    name: string
    key: string
    routePath: string
    notes: string
    isActive: boolean
  }>>({})

  const loadPageData = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const [analyticsPayload, optionsPayload] = await Promise.all([getLandingPagesAnalytics(), getLandingPageOptions()])
      setAnalytics(analyticsPayload.data)
      setLandingOptions(optionsPayload.data)
      setLandingPageEditForms(
        Object.fromEntries(
          analyticsPayload.data.landingPages.map((landingPage) => [
            landingPage.id,
            {
              name: landingPage.name,
              key: landingPage.key,
              description: landingPage.description ?? '',
              basePath: landingPage.basePath ?? '',
              isActive: landingPage.isActive
            }
          ])
        )
      )
      setVariantEditForms(
        Object.fromEntries(
          analyticsPayload.data.landingPages.flatMap((landingPage) =>
            landingPage.variants.map((variant) => [
              variant.id,
              {
                name: variant.name,
                key: variant.key,
                routePath: variant.routePath,
                notes: variant.notes ?? '',
                isActive: variant.isActive
              }
            ])
          )
        )
      )
      setVariantForm((currentValue) => ({
        ...currentValue,
        landingPageId: currentValue.landingPageId || optionsPayload.data[0]?.id || ''
      }))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load landing page analytics.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadPageData()
  }, [])

  const summaryCards = useMemo(() => {
    if (!analytics) {
      return []
    }

    return [
      {
        id: 'visitors',
        label: 'Unique Visitors',
        value: formatNumber(analytics.summary.uniqueVisitors),
        helperText: `${formatNumber(analytics.summary.totalVisits)} tracked visits`,
        tone: 'blue' as const,
        icon: <ChartIcon />
      },
      {
        id: 'clicks',
        label: 'Clicks',
        value: formatNumber(analytics.summary.signupClicks),
        helperText: `${formatPercent(analytics.summary.clickThroughRate)} visitor-to-click`,
        tone: 'orange' as const,
        icon: <LinkIcon />
      },
      {
        id: 'signups',
        label: 'Signups',
        value: formatNumber(analytics.summary.signups),
        helperText: `${formatPercent(analytics.summary.signupConversionRate)} visitor-to-signup`,
        tone: 'purple' as const,
        icon: <UserPlusIcon />
      },
      {
        id: 'sales',
        label: 'Patreon Sales',
        value: formatNumber(analytics.summary.patreonSales),
        helperText: `${formatPercent(analytics.summary.patreonSaleRate)} visitor-to-sale`,
        tone: 'green' as const,
        icon: <CoinIcon />
      }
    ]
  }, [analytics])

  const handleCreateLandingPage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingLandingPage(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await createLandingPage({
        key: landingPageForm.key,
        name: landingPageForm.name,
        description: landingPageForm.description || undefined,
        basePath: landingPageForm.basePath,
        initialVariant: {
          key: landingPageForm.variantKey,
          name: landingPageForm.variantName,
          routePath: landingPageForm.variantRoutePath,
          notes: landingPageForm.variantNotes || undefined,
          isControl: true
        }
      })

      setSuccessMessage('Landing page registered successfully.')
      setLandingPageForm({
        key: '',
        name: '',
        description: '',
        basePath: '',
        variantKey: 'control',
        variantName: 'Control',
        variantRoutePath: '',
        variantNotes: ''
      })
      setShowCreateLandingPageForm(false)
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create landing page.')
    } finally {
      setIsCreatingLandingPage(false)
    }
  }

  const handleCreateVariant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreatingVariant(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await createLandingPageVariant({
        landingPageId: variantForm.landingPageId,
        key: variantForm.key,
        name: variantForm.name,
        routePath: variantForm.routePath,
        notes: variantForm.notes || undefined
      })

      setSuccessMessage('Variant URL added successfully.')
      setVariantForm((currentValue) => ({
        ...currentValue,
        key: '',
        name: '',
        routePath: '',
        notes: ''
      }))
      setShowCreateVariantForm(false)
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add landing page variant.')
    } finally {
      setIsCreatingVariant(false)
    }
  }

  const handleSaveLandingPage = async (landingPageId: string) => {
    const formValue = landingPageEditForms[landingPageId]
    if (!formValue) {
      return
    }

    setSavingLandingPageId(landingPageId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await updateLandingPage(landingPageId, {
        name: formValue.name,
        key: formValue.key,
        description: formValue.description,
        basePath: formValue.basePath,
        isActive: formValue.isActive
      })
      setSuccessMessage('Landing page updated.')
      setOpenLandingPageEditorId(null)
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update landing page.')
    } finally {
      setSavingLandingPageId(null)
    }
  }

  const handleSaveVariant = async (variantId: string) => {
    const formValue = variantEditForms[variantId]
    if (!formValue) {
      return
    }

    setSavingVariantId(variantId)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await updateLandingPageVariant(variantId, {
        name: formValue.name,
        key: formValue.key,
        routePath: formValue.routePath,
        notes: formValue.notes,
        isActive: formValue.isActive
      })
      setSuccessMessage('Variant updated.')
      setOpenVariantEditorId(null)
      await loadPageData()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update variant.')
    } finally {
      setSavingVariantId(null)
    }
  }

  return (
    <AdminPageShell activeKey="landing-pages">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Landing Pages
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#95a6c1]">
            Track which landing URLs bring visitors in, which ones convert to signups, and which ones actually reach paid Patreon access.
          </p>
        </div>
        <Link
          href="/admin/landing-pages/report"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
        >
          Open Report
        </Link>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading && summaryCards.length === 0 ? <p className="col-span-full text-sm text-white/70">Loading landing analytics...</p> : null}
        {summaryCards.map((summaryCard) => (
          <AdminKpiCard
            key={summaryCard.id}
            label={summaryCard.label}
            value={summaryCard.value}
            helperText={summaryCard.helperText}
            tone={summaryCard.tone}
            icon={summaryCard.icon}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Add Landing Page</h2>
            <button
              type="button"
              className="rounded-lg bg-ember-400 px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
              onClick={() => setShowCreateLandingPageForm((currentValue) => !currentValue)}
            >
              {showCreateLandingPageForm ? 'Close' : 'New Landing Page'}
            </button>
          </div>
          {showCreateLandingPageForm ? (
            <form className="mt-4 grid gap-3" onSubmit={handleCreateLandingPage}>
              <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Key (e.g. lp-2)" value={landingPageForm.key} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, key: event.target.value }))} />
              <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Display name" value={landingPageForm.name} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, name: event.target.value }))} />
              <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Primary URL path" value={landingPageForm.basePath} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, basePath: event.target.value }))} />
              <textarea className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="What makes this landing page different?" value={landingPageForm.description} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, description: event.target.value }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Initial variant key" value={landingPageForm.variantKey} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, variantKey: event.target.value }))} />
                <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Initial variant name" value={landingPageForm.variantName} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, variantName: event.target.value }))} />
              </div>
              <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Initial variant URL path" value={landingPageForm.variantRoutePath} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, variantRoutePath: event.target.value }))} />
              <textarea className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Notes for the control variant" value={landingPageForm.variantNotes} onChange={(event) => setLandingPageForm((currentValue) => ({ ...currentValue, variantNotes: event.target.value }))} />
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-ember-400 px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70" disabled={isCreatingLandingPage}>
                  {isCreatingLandingPage ? 'Saving...' : 'Create Landing Page'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                  onClick={() => setShowCreateLandingPageForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">Add Variant URL</h2>
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={() => setShowCreateVariantForm((currentValue) => !currentValue)}
            >
              {showCreateVariantForm ? 'Close' : 'New Variant URL'}
            </button>
          </div>
          {showCreateVariantForm ? (
            <form className="mt-4 grid gap-3" onSubmit={handleCreateVariant}>
              <select className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" value={variantForm.landingPageId} onChange={(event) => setVariantForm((currentValue) => ({ ...currentValue, landingPageId: event.target.value }))}>
                <option value="">Select landing page</option>
                {landingOptions.map((landingPage) => (
                  <option key={landingPage.id} value={landingPage.id}>
                    {landingPage.name} ({landingPage.basePath || 'no base path'})
                  </option>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Variant key" value={variantForm.key} onChange={(event) => setVariantForm((currentValue) => ({ ...currentValue, key: event.target.value }))} />
                <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Variant name" value={variantForm.name} onChange={(event) => setVariantForm((currentValue) => ({ ...currentValue, name: event.target.value }))} />
              </div>
              <input className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Variant route path" value={variantForm.routePath} onChange={(event) => setVariantForm((currentValue) => ({ ...currentValue, routePath: event.target.value }))} />
              <textarea className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white" placeholder="Notes about what changes in this variant" value={variantForm.notes} onChange={(event) => setVariantForm((currentValue) => ({ ...currentValue, notes: event.target.value }))} />
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70" disabled={isCreatingVariant || !variantForm.landingPageId}>
                  {isCreatingVariant ? 'Saving...' : 'Add Variant URL'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-transparent px-4 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                  onClick={() => setShowCreateVariantForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>
      </div>

      <section className="mt-5 space-y-4">
        {analytics?.landingPages.length ? null : (
          <div className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 text-sm text-white/70 sm:px-6">
            No landing-page analytics recorded yet. Visit a tracked landing page or add one above to get started.
          </div>
        )}

        {analytics?.landingPages.map((landingPage) => (
          <article key={landingPage.id} className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-heading)] text-[18px] text-white sm:text-[21px]">{landingPage.name}</h2>
                <p className="mt-1 text-sm text-white/65">
                  `{landingPage.key}` {landingPage.basePath ? `• base path ${landingPage.basePath}` : ''} {landingPage.description ? `• ${landingPage.description}` : ''}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-[#121721]/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Visitors</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.uniqueVisitors)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#121721]/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Clicks</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.signupClicks)}</p>
                  <p className="mt-1 text-xs text-sky-300">{formatPercent(landingPage.kpis.clickThroughRate)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#121721]/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Signups</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.signups)}</p>
                  <p className="mt-1 text-xs text-emerald-300">{formatPercent(landingPage.kpis.signupConversionRate)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#121721]/80 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.08em] text-white/60">Patreon Sales</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{formatNumber(landingPage.kpis.patreonSales)}</p>
                  <p className="mt-1 text-xs text-amber-300">{formatPercent(landingPage.kpis.patreonSaleRate)}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 min-[1600px]:grid-cols-[1.35fr_0.95fr]">
              <div className="w-full overflow-auto rounded-xl border border-white/10 bg-[#11161e]/85 p-4 xl:overflow-visible">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="min-w-0 text-sm font-semibold uppercase tracking-[0.12em] text-white/85">A/B Variant Breakdown</h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/admin/landing-pages/report?landingPageId=${landingPage.id}`}
                      className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
                    >
                      Report
                    </Link>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
                      onClick={() =>
                        setOpenLandingPageEditorId((currentValue) => (currentValue === landingPage.id ? null : landingPage.id))
                      }
                      aria-label={openLandingPageEditorId === landingPage.id ? 'Close landing page editor' : 'Open landing page editor'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden="true">
                        <path d="m4 20 4.5-1 9.4-9.4a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m13.5 6.5 4 4" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
                {openLandingPageEditorId === landingPage.id ? (
                  <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85">Edit Landing Page</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                      value={landingPageEditForms[landingPage.id]?.name ?? landingPage.name}
                      onChange={(event) =>
                        setLandingPageEditForms((currentValue) => ({
                          ...currentValue,
                          [landingPage.id]: {
                            ...(currentValue[landingPage.id] ?? {
                              name: landingPage.name,
                              key: landingPage.key,
                              description: landingPage.description ?? '',
                              basePath: landingPage.basePath ?? '',
                              isActive: landingPage.isActive
                            }),
                            name: event.target.value
                          }
                        }))
                      }
                    />
                    <input
                      className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white"
                      value={landingPageEditForms[landingPage.id]?.key ?? landingPage.key}
                      onChange={(event) =>
                        setLandingPageEditForms((currentValue) => ({
                          ...currentValue,
                          [landingPage.id]: {
                            ...(currentValue[landingPage.id] ?? {
                              name: landingPage.name,
                              key: landingPage.key,
                              description: landingPage.description ?? '',
                              basePath: landingPage.basePath ?? '',
                              isActive: landingPage.isActive
                            }),
                            key: event.target.value
                          }
                        }))
                      }
                    />
                    <input
                      className="rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2"
                      value={landingPageEditForms[landingPage.id]?.basePath ?? landingPage.basePath ?? ''}
                      onChange={(event) =>
                        setLandingPageEditForms((currentValue) => ({
                          ...currentValue,
                          [landingPage.id]: {
                            ...(currentValue[landingPage.id] ?? {
                              name: landingPage.name,
                              key: landingPage.key,
                              description: landingPage.description ?? '',
                              basePath: landingPage.basePath ?? '',
                              isActive: landingPage.isActive
                            }),
                            basePath: event.target.value
                          }
                        }))
                      }
                    />
                    <textarea
                      className="min-h-20 rounded-lg border border-white/10 bg-[#11161e] px-3 py-2 text-sm text-white md:col-span-2"
                      value={landingPageEditForms[landingPage.id]?.description ?? landingPage.description ?? ''}
                      onChange={(event) =>
                        setLandingPageEditForms((currentValue) => ({
                          ...currentValue,
                          [landingPage.id]: {
                            ...(currentValue[landingPage.id] ?? {
                              name: landingPage.name,
                              key: landingPage.key,
                              description: landingPage.description ?? '',
                              basePath: landingPage.basePath ?? '',
                              isActive: landingPage.isActive
                            }),
                            description: event.target.value
                          }
                        }))
                      }
                    />
                    <label className="inline-flex items-center gap-2 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={landingPageEditForms[landingPage.id]?.isActive ?? landingPage.isActive}
                        onChange={(event) =>
                          setLandingPageEditForms((currentValue) => ({
                            ...currentValue,
                            [landingPage.id]: {
                              ...(currentValue[landingPage.id] ?? {
                                name: landingPage.name,
                                key: landingPage.key,
                                description: landingPage.description ?? '',
                                basePath: landingPage.basePath ?? '',
                                isActive: landingPage.isActive
                              }),
                              isActive: event.target.checked
                            }
                          }))
                        }
                      />
                      Active
                    </label>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                        disabled={savingLandingPageId === landingPage.id}
                        onClick={() => void handleSaveLandingPage(landingPage.id)}
                      >
                        {savingLandingPageId === landingPage.id ? 'Saving...' : 'Save Landing Page'}
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                        onClick={() => setOpenLandingPageEditorId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-[860px] text-left text-sm text-white/80">
                    <thead className="text-[11px] uppercase tracking-[0.08em] text-white/45">
                      <tr>
                        <th className="pb-2 pr-4 whitespace-nowrap">Variant</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">URL</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">Visitors</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">Clicks</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">Signups</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">Signup CVR</th>
                        <th className="pb-2 pr-4 whitespace-nowrap">Sales</th>
                        <th className="pb-2 whitespace-nowrap">Sale CVR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {landingPage.variants.map((variant) => (
                        <Fragment key={variant.id}>
                        <tr className="border-t border-white/5">
                          <td className="py-2 pr-4 align-top">
                            {openVariantEditorId === variant.id ? (
                              <div className="grid gap-2">
                                <input
                                  className="rounded-lg border border-white/10 bg-[#11161e] px-2 py-1.5 text-sm text-white"
                                  value={variantEditForms[variant.id]?.name ?? variant.name}
                                  onChange={(event) =>
                                    setVariantEditForms((currentValue) => ({
                                      ...currentValue,
                                      [variant.id]: {
                                        ...(currentValue[variant.id] ?? {
                                          name: variant.name,
                                          key: variant.key,
                                          routePath: variant.routePath,
                                          notes: variant.notes ?? '',
                                          isActive: variant.isActive
                                        }),
                                        name: event.target.value
                                      }
                                    }))
                                  }
                                />
                                <input
                                  className="rounded-lg border border-white/10 bg-[#11161e] px-2 py-1.5 font-mono text-xs text-white"
                                  value={variantEditForms[variant.id]?.key ?? variant.key}
                                  onChange={(event) =>
                                    setVariantEditForms((currentValue) => ({
                                      ...currentValue,
                                      [variant.id]: {
                                        ...(currentValue[variant.id] ?? {
                                          name: variant.name,
                                          key: variant.key,
                                          routePath: variant.routePath,
                                          notes: variant.notes ?? '',
                                          isActive: variant.isActive
                                        }),
                                        key: event.target.value
                                      }
                                    }))
                                  }
                                />
                                <textarea
                                  className="min-h-16 rounded-lg border border-white/10 bg-[#11161e] px-2 py-1.5 text-xs text-white"
                                  value={variantEditForms[variant.id]?.notes ?? variant.notes ?? ''}
                                  onChange={(event) =>
                                    setVariantEditForms((currentValue) => ({
                                      ...currentValue,
                                      [variant.id]: {
                                        ...(currentValue[variant.id] ?? {
                                          name: variant.name,
                                          key: variant.key,
                                          routePath: variant.routePath,
                                          notes: variant.notes ?? '',
                                          isActive: variant.isActive
                                        }),
                                        notes: event.target.value
                                      }
                                    }))
                                  }
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <label className="inline-flex items-center gap-2 text-xs text-white/60">
                                    <input
                                      type="checkbox"
                                      checked={variantEditForms[variant.id]?.isActive ?? variant.isActive}
                                      onChange={(event) =>
                                        setVariantEditForms((currentValue) => ({
                                          ...currentValue,
                                          [variant.id]: {
                                            ...(currentValue[variant.id] ?? {
                                              name: variant.name,
                                              key: variant.key,
                                              routePath: variant.routePath,
                                              notes: variant.notes ?? '',
                                              isActive: variant.isActive
                                            }),
                                            isActive: event.target.checked
                                          }
                                        }))
                                      }
                                    />
                                    Active
                                  </label>
                                  <span className="text-xs text-ember-300">{variant.isControl ? 'Control' : 'Variant'}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="font-medium text-white">
                                  {variant.name} {variant.isControl ? <span className="text-xs text-ember-300">(Control)</span> : null}
                                </div>
                                <div className="font-mono text-xs text-white/50">{variant.key}</div>
                                {variant.notes ? <div className="text-xs text-white/50">{variant.notes}</div> : null}
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-4 align-top">
                            {openVariantEditorId === variant.id ? (
                              <div className="grid gap-2">
                                <input
                                  className="rounded-lg border border-white/10 bg-[#11161e] px-2 py-1.5 font-mono text-xs text-white"
                                  value={variantEditForms[variant.id]?.routePath ?? variant.routePath}
                                  onChange={(event) =>
                                    setVariantEditForms((currentValue) => ({
                                      ...currentValue,
                                      [variant.id]: {
                                        ...(currentValue[variant.id] ?? {
                                          name: variant.name,
                                          key: variant.key,
                                          routePath: variant.routePath,
                                          notes: variant.notes ?? '',
                                          isActive: variant.isActive
                                        }),
                                        routePath: event.target.value
                                      }
                                    }))
                                  }
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-70"
                                    disabled={savingVariantId === variant.id}
                                    onClick={() => void handleSaveVariant(variant.id)}
                                  >
                                    {savingVariantId === variant.id ? 'Saving...' : 'Save Variant'}
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-white/10 bg-transparent px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/5 hover:text-white"
                                    onClick={() => setOpenVariantEditorId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-mono text-xs text-white/60">{variant.routePath}</div>
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/admin/landing-pages/report?landingPageId=${landingPage.id}&variantId=${variant.id}`}
                                    className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-100 transition hover:border-sky-300/40 hover:bg-sky-500/15 hover:text-white"
                                  >
                                    Report
                                  </Link>
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 p-2 text-white transition hover:bg-white/10"
                                    onClick={() =>
                                      setOpenVariantEditorId((currentValue) => (currentValue === variant.id ? null : variant.id))
                                    }
                                    aria-label={openVariantEditorId === variant.id ? 'Close variant editor' : 'Open variant editor'}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-3.5" aria-hidden="true">
                                      <path d="m4 20 4.5-1 9.4-9.4a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" strokeLinecap="round" strokeLinejoin="round" />
                                      <path d="m13.5 6.5 4 4" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2 pr-4 align-top">{formatNumber(variant.uniqueVisitors)}</td>
                          <td className="py-2 pr-4 align-top">{formatNumber(variant.signupClicks)}</td>
                          <td className="py-2 pr-4 align-top">{formatNumber(variant.signups)}</td>
                          <td className="py-2 pr-4 align-top text-emerald-300">{formatPercent(variant.signupConversionRate)}</td>
                          <td className="py-2 pr-4 align-top">{formatNumber(variant.patreonSales)}</td>
                          <td className="py-2 align-top text-amber-300">{formatPercent(variant.patreonSaleRate)}</td>
                        </tr>
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="w-full overflow-auto rounded-xl border border-white/10 bg-[#11161e]/85 p-4 xl:overflow-visible">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85">Top Sources</h3>
                <div className="mt-3 space-y-3">
                  {landingPage.sources.length === 0 ? <p className="text-sm text-white/60">No source data captured yet.</p> : null}
                  {landingPage.sources.map((source) => (
                    <div key={source.source} className="rounded-lg border border-white/10 bg-black/15 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{source.source}</p>
                        <p className="text-xs text-white/45">{formatNumber(source.uniqueVisitors)} visitors</p>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/60">
                        <span>{formatNumber(source.signupClicks)} clicks</span>
                        <span>{formatPercent(source.clickThroughRate)} click rate</span>
                        <span>{formatNumber(source.signups)} signups</span>
                        <span>{formatPercent(source.signupConversionRate)} signup CVR</span>
                        <span>{formatNumber(source.patreonSales)} sales</span>
                        <span>{formatPercent(source.patreonSaleRate)} sale CVR</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </AdminPageShell>
  )
}

export default LandingPagesPage
