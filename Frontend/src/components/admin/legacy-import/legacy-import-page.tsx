'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import { ADMIN_OVERVIEW_REFRESH_EVENT } from '@/lib/admin-overview-events'
import {
  getLegacyImportOverview,
  runLegacyImport,
  runLegacyTaglineBackfill,
  type LegacyImportOverviewResponse,
  type LegacyImportRunResponse,
  type LegacyTaglineBackfillResponse
} from '@/lib/legacy-import-api'
import { useCallback, useEffect, useMemo, useState } from 'react'

type ResultState =
  | {
      kind: 'import'
      payload: LegacyImportRunResponse['data']
    }
  | {
      kind: 'taglines'
      payload: LegacyTaglineBackfillResponse['data']
    }
  | null

const formatCount = (value: number | null) => {
  if (value === null) {
    return '—'
  }

  return new Intl.NumberFormat('en-US').format(value)
}

const StatCard = ({ label, value, helper }: { label: string; value: string; helper: string }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#11161f]/80 px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[#7f92b2]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#8ea0bf]">{helper}</p>
    </div>
  )
}

const LegacyImportPage = () => {
  const [overview, setOverview] = useState<LegacyImportOverviewResponse['data'] | null>(null)
  const [isLoadingOverview, setIsLoadingOverview] = useState(true)
  const [overviewErrorMessage, setOverviewErrorMessage] = useState<string | null>(null)
  const [ownerEmail, setOwnerEmail] = useState('')
  const [sourceBaseUrl, setSourceBaseUrl] = useState('')
  const [publicAssetBaseUrl, setPublicAssetBaseUrl] = useState('')
  const [limitValue, setLimitValue] = useState('')
  const [skipDownloads, setSkipDownloads] = useState(false)
  const [forceTaglineOverwrite, setForceTaglineOverwrite] = useState(false)
  const [isImportRunning, setIsImportRunning] = useState(false)
  const [isBackfillRunning, setIsBackfillRunning] = useState(false)
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null)
  const [resultState, setResultState] = useState<ResultState>(null)
  const [didPrefillDefaults, setDidPrefillDefaults] = useState(false)

  const refreshOverview = useCallback(async () => {
    setIsLoadingOverview(true)
    setOverviewErrorMessage(null)

    try {
      const payload = await getLegacyImportOverview()
      setOverview(payload.data)

      if (!didPrefillDefaults) {
        setOwnerEmail(payload.data.defaults.ownerEmail)
        setSourceBaseUrl(payload.data.defaults.sourceBaseUrl)
        setPublicAssetBaseUrl(payload.data.defaults.publicAssetBaseUrl)
        setDidPrefillDefaults(true)
      }
    } catch (error) {
      setOverview(null)
      setOverviewErrorMessage(error instanceof Error ? error.message : 'Failed to load legacy import overview.')
    } finally {
      setIsLoadingOverview(false)
    }
  }, [didPrefillDefaults])

  useEffect(() => {
    void refreshOverview()
  }, [refreshOverview])

  const parsedLimit = useMemo(() => {
    const trimmed = limitValue.trim()

    if (trimmed.length === 0) {
      return null
    }

    const parsed = Number.parseInt(trimmed, 10)
    return Number.isNaN(parsed) ? Number.NaN : parsed
  }, [limitValue])

  const importButtonDisabled = isImportRunning || isBackfillRunning || ownerEmail.trim().length === 0

  const handleRunImport = async (dryRun: boolean) => {
    if (Number.isNaN(parsedLimit) || (parsedLimit !== null && parsedLimit <= 0)) {
      setActionErrorMessage('Limit must be a positive whole number when provided.')
      return
    }

    setIsImportRunning(true)
    setActionErrorMessage(null)

    try {
      const response = await runLegacyImport({
        ownerEmail: ownerEmail.trim(),
        sourceBaseUrl: sourceBaseUrl.trim(),
        publicAssetBaseUrl: publicAssetBaseUrl.trim(),
        dryRun,
        skipDownloads,
        limit: parsedLimit
      })

      setResultState({
        kind: 'import',
        payload: response.data
      })

      if (!dryRun) {
        await refreshOverview()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(ADMIN_OVERVIEW_REFRESH_EVENT))
        }
      }
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : 'Legacy import failed.')
    } finally {
      setIsImportRunning(false)
    }
  }

  const handleBackfillTaglines = async () => {
    setIsBackfillRunning(true)
    setActionErrorMessage(null)

    try {
      const response = await runLegacyTaglineBackfill(forceTaglineOverwrite)
      setResultState({
        kind: 'taglines',
        payload: response.data
      })
      await refreshOverview()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(ADMIN_OVERVIEW_REFRESH_EVENT))
      }
    } catch (error) {
      setActionErrorMessage(error instanceof Error ? error.message : 'Legacy tagline backfill failed.')
    } finally {
      setIsBackfillRunning(false)
    }
  }

  const importResultItems = resultState?.kind === 'import' ? resultState.payload.items.slice(0, 24) : []
  const taglineResultItems = resultState?.kind === 'taglines' ? resultState.payload.items.slice(0, 24) : []

  return (
    <AdminPageShell activeKey="legacy-import">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Legacy Transfer
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#94a9c9]">
            Import the old Squircle models into the new site, keep the persona info where available, and fill the new
            origin taglines automatically. Thumbnails stay untouched so you can generate them afterward.
          </p>
        </div>

        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100 lg:max-w-[320px]">
          Use <span className="font-semibold">Dry Run</span> first. A real import can take a few minutes because it may
          download every `.vrm`.
        </div>
      </div>

      {overviewErrorMessage ? (
        <section className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {overviewErrorMessage}
        </section>
      ) : null}

      {actionErrorMessage ? (
        <section className="mt-5 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          {actionErrorMessage}
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0b0f14]/95 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white sm:text-[21px]">
            Legacy Source Overview
          </h2>
          <button
            type="button"
            onClick={() => void refreshOverview()}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/15 px-4 text-xs uppercase tracking-[0.08em] text-[#c9d4e8] transition hover:border-ember-300 hover:text-white"
          >
            {isLoadingOverview ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Legacy Models"
            value={isLoadingOverview ? '…' : formatCount(overview?.legacySource.modelCount ?? null)}
            helper={overview?.legacySource.reachable ? 'Old source is reachable' : 'Old source did not respond'}
          />
          <StatCard
            label="Mapped Taglines"
            value={isLoadingOverview ? '…' : formatCount(overview?.coverage.mappedTaglines ?? null)}
            helper="Characters from the old list with known origin labels"
          />
          <StatCard
            label="Imported Legacy"
            value={isLoadingOverview ? '…' : formatCount(overview?.imported.characters ?? null)}
            helper="Characters in the new database with a legacy file hash"
          />
          <StatCard
            label="Missing Thumbnails"
            value={isLoadingOverview ? '…' : formatCount(overview?.imported.missingPreviewImage ?? null)}
            helper="Imported legacy characters still missing preview images"
          />
        </div>

        {overview?.legacySource.errorMessage ? (
          <p className="mt-4 text-xs text-amber-200/90">{overview.legacySource.errorMessage}</p>
        ) : null}
      </section>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14]/95 px-4 py-5 sm:px-6">
        <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white sm:text-[21px]">
          Import Settings
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Owner Email</span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#11161f] px-4 text-sm text-white outline-none transition focus:border-ember-300"
              placeholder="ghostlady0613@gmail.com"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Model Limit</span>
            <input
              type="text"
              inputMode="numeric"
              value={limitValue}
              onChange={(event) => setLimitValue(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#11161f] px-4 text-sm text-white outline-none transition focus:border-ember-300"
              placeholder="Leave blank for all models"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Legacy Source Base URL</span>
            <input
              type="url"
              value={sourceBaseUrl}
              onChange={(event) => setSourceBaseUrl(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#11161f] px-4 text-sm text-white outline-none transition focus:border-ember-300"
              placeholder="https://squircle.games"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-[0.08em] text-[#7f92b2]">New Upload Base URL</span>
            <input
              type="url"
              value={publicAssetBaseUrl}
              onChange={(event) => setPublicAssetBaseUrl(event.target.value)}
              className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#11161f] px-4 text-sm text-white outline-none transition focus:border-ember-300"
              placeholder="http://127.0.0.1:4000"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#11161f]/70 px-4 py-3">
            <input
              type="checkbox"
              checked={skipDownloads}
              onChange={(event) => setSkipDownloads(event.target.checked)}
              className="mt-1 size-4 rounded border-white/20 bg-transparent text-ember-400 focus:ring-ember-300"
            />
            <span>
              <span className="block text-sm text-white">Skip VRM downloads</span>
              <span className="mt-1 block text-xs text-[#8ea0bf]">
                Keep pointing at the old remote `.vrm` files instead of copying them into `Backend/uploads`.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-[#11161f]/70 px-4 py-3">
            <input
              type="checkbox"
              checked={forceTaglineOverwrite}
              onChange={(event) => setForceTaglineOverwrite(event.target.checked)}
              className="mt-1 size-4 rounded border-white/20 bg-transparent text-ember-400 focus:ring-ember-300"
            />
            <span>
              <span className="block text-sm text-white">Force tagline overwrite</span>
              <span className="mt-1 block text-xs text-[#8ea0bf]">
                Used only for tagline backfill. Replaces existing taglines on imported legacy entries.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={importButtonDisabled}
            onClick={() => void handleRunImport(true)}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-5 text-sm font-medium text-white transition hover:border-ember-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImportRunning ? 'Running…' : 'Dry Run'}
          </button>

          <button
            type="button"
            disabled={importButtonDisabled}
            onClick={() => void handleRunImport(false)}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-ember-300 to-ember-400 px-5 text-sm font-semibold text-[#1f130d] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isImportRunning ? 'Importing…' : 'Run Real Import'}
          </button>

          <button
            type="button"
            disabled={isImportRunning || isBackfillRunning}
            onClick={() => void handleBackfillTaglines()}
            className="inline-flex h-12 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-400/10 px-5 text-sm font-medium text-sky-100 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBackfillRunning ? 'Backfilling…' : 'Backfill Taglines'}
          </button>
        </div>
      </section>

      {resultState?.kind === 'import' ? (
        <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14]/95 px-4 py-5 sm:px-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white sm:text-[21px]">
            Import Result
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Scanned" value={formatCount(resultState.payload.stats.scanned)} helper="Models checked from the legacy list" />
            <StatCard label="Created" value={formatCount(resultState.payload.stats.created)} helper="New characters added to the database" />
            <StatCard label="Updated" value={formatCount(resultState.payload.stats.updated)} helper="Existing characters matched and refreshed" />
            <StatCard label="VRMs Downloaded" value={formatCount(resultState.payload.stats.downloaded)} helper="Files copied into the new uploads folder" />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#10151d]">
            <div className="-mx-px overflow-x-auto sm:mx-0">
              <table className="min-w-[860px] w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-[#181d26]">
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Character</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Action</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Tagline</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Persona</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Downloaded</th>
                  </tr>
                </thead>
                <tbody>
                  {importResultItems.map((item) => (
                    <tr key={item.slug} className="border-t border-white/10">
                      <td className="px-4 py-3 align-top">
                        <p className="text-sm text-white">{item.name}</p>
                        <p className="mt-1 text-xs text-[#7f92b2]">{item.slug}</p>
                      </td>
                      <td className="px-4 py-3 align-top text-sm capitalize text-[#c7d3e6]">{item.action}</td>
                      <td className="px-4 py-3 align-top text-sm text-[#c7d3e6]">{item.tagline ?? '—'}</td>
                      <td className="px-4 py-3 align-top text-sm text-[#c7d3e6]">{item.personaStatus}</td>
                      <td className="px-4 py-3 align-top text-sm text-[#c7d3e6]">{item.downloadedFile ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {resultState.payload.items.length > importResultItems.length ? (
            <p className="mt-3 text-xs text-[#8ea0bf]">
              Showing the first {importResultItems.length} rows of {resultState.payload.items.length}.
            </p>
          ) : null}
        </section>
      ) : null}

      {resultState?.kind === 'taglines' ? (
        <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b0f14]/95 px-4 py-5 sm:px-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white sm:text-[21px]">
            Tagline Backfill Result
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Updated" value={formatCount(resultState.payload.updated)} helper="Imported legacy characters changed" />
            <StatCard label="Skipped" value={formatCount(resultState.payload.skipped)} helper="Already had a matching or protected tagline" />
            <StatCard label="Unresolved" value={formatCount(resultState.payload.unresolved)} helper="Imported characters still missing a mapped origin" />
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-[#10151d]">
            <div className="-mx-px overflow-x-auto sm:mx-0">
              <table className="min-w-[860px] w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-[#181d26]">
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Character</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Status</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Previous</th>
                    <th className="px-4 py-3 text-left text-xs uppercase tracking-[0.08em] text-[#7f92b2]">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {taglineResultItems.map((item) => (
                    <tr key={`${item.name}-${item.status}`} className="border-t border-white/10">
                      <td className="px-4 py-3 align-top text-sm text-white">{item.name}</td>
                      <td className="px-4 py-3 align-top text-sm capitalize text-[#c7d3e6]">{item.status}</td>
                      <td className="px-4 py-3 align-top text-sm text-[#c7d3e6]">{item.previousTagline ?? '—'}</td>
                      <td className="px-4 py-3 align-top text-sm text-[#c7d3e6]">{item.resolvedTagline ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {resultState.payload.items.length > taglineResultItems.length ? (
            <p className="mt-3 text-xs text-[#8ea0bf]">
              Showing the first {taglineResultItems.length} rows of {resultState.payload.items.length}.
            </p>
          ) : null}
        </section>
      ) : null}
    </AdminPageShell>
  )
}

export default LegacyImportPage
