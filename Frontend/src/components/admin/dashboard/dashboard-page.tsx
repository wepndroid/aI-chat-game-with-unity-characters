'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminActivityItem from '@/components/ui-elements/admin-activity-item'
import AdminKpiCard from '@/components/ui-elements/admin-kpi-card'
import AdminReviewQueueItem from '@/components/ui-elements/admin-review-queue-item'
import { getDescriptionKeywordFlagCount } from '@/lib/admin-review-description'
import { apiGet } from '@/lib/api-client'
import { listAdminReviewQueue, type AdminReviewQueueRecord } from '@/lib/character-api'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type ActivityTone = 'yellow' | 'red' | 'green' | 'blue'

type DashboardOverviewPayload = {
  data: {
    totalUsers: number
    totalCharacters: number
    approvedCharacters: number
    pendingCharacters: number
    totalReviews: number
    totalHearts: number
    totalViews: number
    patreonLinkedUsers: number
    activePatrons: number
    dau7d: number
    dau30d: number
    topCharacters: Array<{
      id: string
      slug: string
      name: string
      previewImageUrl: string | null
      viewsCount: number
      heartsCount: number
      minimumTierCents: number | null
      isPatreonGated: boolean
    }>
    pledgeTrends: {
      linkedUsers: number
      activePatrons: number
      tierDistribution: Array<{
        tierCents: number
        users: number
      }>
    }
    deployment: {
      checks: Array<{
        id: string
        label: string
        status: 'ready' | 'pending' | 'warning'
        detail: string
      }>
      browserMatrix: Array<{
        browser: string
        status: 'ready' | 'pending' | 'warning'
      }>
    }
    recentActivity: Array<{
      id: string
      message: string
      timeLabel: string
      tone: ActivityTone
    }>
    updatedAt: string
  }
}

type KpiRecord = {
  id: string
  label: string
  value: string
  helperText: string
  tone: 'blue' | 'purple' | 'orange' | 'green'
  icon: ReactNode
}

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)

const deploymentStatusClassNameMap: Record<'ready' | 'pending' | 'warning', string> = {
  ready: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200',
  pending: 'border-amber-500/35 bg-amber-500/15 text-amber-200',
  warning: 'border-rose-500/35 bg-rose-500/15 text-rose-200'
}

/** DAU / active users — group of users (reads clearly at small sizes). */
const ActiveUsersIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-full"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

/** Total views — eye + pupil. */
const ViewsIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-full"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** Written reviews — star (distinct from “views” and “hearts”). */
const ReviewsStarIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-full"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

/** Active patrons / paid supporters — currency in circle (not ambiguous shapes). */
const PatronSupportIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-full"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H6M12 18V6" />
    </svg>
  )
}

const DashboardPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [overview, setOverview] = useState<DashboardOverviewPayload['data'] | null>(null)
  const [reviewQueue, setReviewQueue] = useState<AdminReviewQueueRecord[]>([])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      const [overviewResult, reviewQueueResult] = await Promise.allSettled([
        apiGet<DashboardOverviewPayload>('/stats/overview'),
        listAdminReviewQueue()
      ])

      if (isCancelled) {
        return
      }

      const errorMessageList: string[] = []

      if (overviewResult.status === 'fulfilled') {
        setOverview(overviewResult.value.data)
      } else {
        setOverview(null)
        errorMessageList.push('Overview metrics are temporarily unavailable.')
      }

      if (reviewQueueResult.status === 'fulfilled') {
        setReviewQueue(reviewQueueResult.value.data)
      } else {
        setReviewQueue([])
        errorMessageList.push('Review queue preview failed to load.')
      }

      if (errorMessageList.length > 0) {
        setErrorMessage(errorMessageList.join(' '))
      } else {
        setErrorMessage(null)
      }

      if (!isCancelled) {
        setIsLoading(false)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  const kpiRecordList = useMemo<KpiRecord[]>(() => {
    if (!overview) {
      return []
    }

    return [
      {
        id: 'dau-7d',
        label: 'DAU (7d active)',
        value: formatCompactNumber(overview.dau7d),
        helperText: `30d active: ${formatCompactNumber(overview.dau30d)}`,
        tone: 'blue',
        icon: <ActiveUsersIcon />
      },
      {
        id: 'views',
        label: 'Total Views',
        value: formatCompactNumber(overview.totalViews),
        helperText: `Hearts: ${formatCompactNumber(overview.totalHearts)}`,
        tone: 'purple',
        icon: <ViewsIcon />
      },
      {
        id: 'reviews',
        label: 'Total Reviews',
        value: formatCompactNumber(overview.totalReviews),
        helperText: `${formatCompactNumber(overview.approvedCharacters)} public characters`,
        tone: 'orange',
        icon: <ReviewsStarIcon />
      },
      {
        id: 'patrons',
        label: 'Active Patrons',
        value: formatCompactNumber(overview.activePatrons),
        helperText: `Linked users: ${formatCompactNumber(overview.patreonLinkedUsers)}`,
        tone: 'green',
        icon: <PatronSupportIcon />
      }
    ]
  }, [overview])

  const priorityQueuePreview = reviewQueue.slice(0, 3)
  const activityPreview = overview?.recentActivity.slice(0, 6) ?? []
  const topCharacters = overview?.topCharacters.slice(0, 6) ?? []
  const tierDistribution = overview?.pledgeTrends.tierDistribution ?? []
  const deploymentCheckPreview = overview?.deployment.checks.slice(0, 4) ?? []

  return (
    <AdminPageShell activeKey="dashboard">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Overview</h1>
      <p className="mt-2 text-sm text-[#95a6c1]">Last updated: {overview ? new Date(overview.updatedAt).toLocaleString() : '-'}</p>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {isLoading && kpiRecordList.length === 0 ? (
          <p className="col-span-full text-sm text-white/70">Loading analytics...</p>
        ) : null}
        {kpiRecordList.map((kpiItem) => (
          <AdminKpiCard
            key={kpiItem.id}
            label={kpiItem.label}
            value={kpiItem.value}
            helperText={kpiItem.helperText}
            tone={kpiItem.tone}
            icon={kpiItem.icon}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">System Activity</h2>
            <Link href="/admin/activity" className="text-xs font-normal text-ember-300 transition hover:text-ember-200" aria-label="View all system activity">
              View All
            </Link>
          </div>

          <div className="mt-3">
            {activityPreview.length === 0 ? <p className="text-sm text-white/70">No recent activity yet.</p> : null}
            {activityPreview.map((activityItem) => (
              <AdminActivityItem key={activityItem.id} message={activityItem.message} timeLabel={activityItem.timeLabel} tone={activityItem.tone} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Priority Review Queue</h2>
            <Link href="/admin/review-queue" className="text-xs font-normal text-ember-300 transition hover:text-ember-200" aria-label="Go to review queue">
              Go to Reviews
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {priorityQueuePreview.length === 0 ? <p className="text-sm text-white/70">No pending reviews right now.</p> : null}
            {priorityQueuePreview.map((queueItem) => (
              <AdminReviewQueueItem
                key={queueItem.id}
                characterName={queueItem.name}
                creatorName={queueItem.owner.username}
                previewImageUrl={queueItem.previewImageUrl}
                flagCount={getDescriptionKeywordFlagCount(queueItem.description)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-4 2xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Top Characters</h2>
          <div className="mt-4 space-y-3">
            {topCharacters.length === 0 ? <p className="text-sm text-white/70">No character analytics available yet.</p> : null}
            {topCharacters.map((characterItem) => (
              <Link
                key={characterItem.id}
                href={`/characters/${encodeURIComponent(characterItem.slug)}`}
                className="flex items-center gap-3 rounded-md border border-white/10 bg-black/20 px-3 py-2 transition hover:border-white/20 hover:bg-black/30"
              >
                {characterItem.previewImageUrl ? (
                  <img
                    src={characterItem.previewImageUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-md border border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#1a1f28] text-[10px] text-[#4a5a72]">
                    —
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm text-white">{characterItem.name}</p>
                  <p className="mt-1 text-xs text-white/65">
                    Views {formatCompactNumber(characterItem.viewsCount)} | Hearts {formatCompactNumber(characterItem.heartsCount)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
          <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Pledge Trends</h2>
          <p className="mt-2 text-xs text-white/65">
            Linked users: {overview ? formatCompactNumber(overview.pledgeTrends.linkedUsers) : '0'} | Active patrons:{' '}
            {overview ? formatCompactNumber(overview.pledgeTrends.activePatrons) : '0'}
          </p>
          <p className="mt-1 text-xs text-white/45">Tier amounts use Patreon tier cents; display is in major units (currency follows your campaign).</p>

          <div className="mt-4 space-y-3">
            {tierDistribution.length === 0 ? <p className="text-sm text-white/70">No Patreon tier distribution data yet.</p> : null}
            {tierDistribution.map((tier) => (
              <div key={tier.tierCents} className="rounded-md border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-sm text-white">
                  {(tier.tierCents / 100).toFixed(2)} / month tier
                </p>
                <p className="mt-1 text-xs text-white/65">{tier.users} linked users</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-heading)] text-[21px] font-normal leading-none text-white">Deployment Readiness</h2>
          <Link href="/admin/global-settings" className="text-xs font-normal text-ember-300 transition hover:text-ember-200" aria-label="Open full deployment checks">
            Full Checks
          </Link>
        </div>
        <p className="mt-2 text-xs text-white/45">Showing a subset of checks here; open Global Settings for the full list.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {deploymentCheckPreview.length === 0 ? <p className="text-sm text-white/70">No deployment checks available yet.</p> : null}
          {deploymentCheckPreview.map((checkItem) => (
            <article key={checkItem.id} className="rounded-md border border-white/10 bg-black/20 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-white">{checkItem.label}</p>
                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] ${deploymentStatusClassNameMap[checkItem.status]}`}>
                  {checkItem.status.toUpperCase()}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/60">{checkItem.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </AdminPageShell>
  )
}

export default DashboardPage
