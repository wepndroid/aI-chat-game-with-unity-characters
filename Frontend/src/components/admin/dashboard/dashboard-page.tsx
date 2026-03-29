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
    pendingCharacters: number
    activePatrons: number
    newUsersToday: number
    serverLoad1m: number
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
  helperText?: string
  helperContent?: ReactNode
  tone: 'blue' | 'purple' | 'orange' | 'green'
  icon: ReactNode
  labelClassName?: string
}

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)

const formatTodayUserDelta = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)

/** Green pulse sparkline + “+N today” — single beat: flat → spike up → dip below → level (reference UI). */
const UsersTodayGrowthIndicator = ({ count }: { count: number }) => {
  return (
    <div className="inline-flex items-center gap-1.5">
      <svg viewBox="0 0 26 10" fill="none" className="h-3.5 w-[1.625rem] shrink-0 text-emerald-400" aria-hidden="true">
        <path
          d="M1 6.5 L5 6.5 L9 2 L13 9 L17 6.5 L25 6.5"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[12px] font-semibold tracking-tight text-emerald-400">+{formatTodayUserDelta(count)} today</span>
    </div>
  )
}

/** Total users / accounts — group of people (reads clearly at small sizes). */
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

/** Total VRMs / character models — 3D box outline. */
const VrmModelsIcon = () => {
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
      <path d="m12 2 8 4.5v11L12 22 4 17.5v-11L12 2Z" />
      <path d="M4 6.5 12 11l8-4.5M12 11v11" />
    </svg>
  )
}

/** Pending moderation queue — clipboard. */
const PendingReviewQueueIcon = () => {
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
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  )
}

/** Active chats KPI — speech bubble. */
const ActiveChatsIcon = () => {
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
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
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
        id: 'total-users',
        label: 'Total Users',
        value: formatCompactNumber(overview.totalUsers),
        helperContent: <UsersTodayGrowthIndicator count={overview.newUsersToday} />,
        tone: 'blue',
        icon: <ActiveUsersIcon />
      },
      {
        id: 'total-vrms',
        label: 'Total VRMs',
        value: formatCompactNumber(overview.totalCharacters),
        helperText: 'Across all servers',
        tone: 'purple',
        icon: <VrmModelsIcon />
      },
      {
        id: 'pending-reviews',
        label: 'Pending Reviews',
        value: formatCompactNumber(overview.pendingCharacters),
        helperText: 'Requires attention',
        tone: 'orange',
        labelClassName: 'text-orange-400',
        icon: <PendingReviewQueueIcon />
      },
      {
        id: 'active-chats',
        label: 'Active Chats',
        value: formatCompactNumber(overview.activePatrons),
        helperText: `Server load: ${overview.serverLoad1m.toFixed(2)} (1 min avg)`,
        tone: 'green',
        icon: <ActiveChatsIcon />
      }
    ]
  }, [overview])

  const priorityQueuePreview = reviewQueue.slice(0, 3)
  const activityPreview = overview?.recentActivity.slice(0, 6) ?? []

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
            helperContent={kpiItem.helperContent}
            tone={kpiItem.tone}
            icon={kpiItem.icon}
            labelClassName={kpiItem.labelClassName}
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
    </AdminPageShell>
  )
}

export default DashboardPage
