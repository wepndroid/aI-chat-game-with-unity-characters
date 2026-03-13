import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminActivityItem from '@/components/ui-elements/admin-activity-item'
import AdminKpiCard from '@/components/ui-elements/admin-kpi-card'
import AdminReviewQueueItem from '@/components/ui-elements/admin-review-queue-item'
import Link from 'next/link'
import type { ReactNode } from 'react'

type KpiRecord = {
  id: string
  label: string
  value: string
  helperText: string
  tone: 'blue' | 'purple' | 'orange' | 'green'
  icon: ReactNode
}

const UserIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M16.8 19.4v-1.3c0-2-1.9-3.7-4.3-3.7h-3c-2.4 0-4.3 1.7-4.3 3.7v1.3" strokeLinecap="round" />
      <circle cx="11" cy="8" r="3.3" />
      <path d="M18.3 8.8c1.6.3 2.8 1.6 2.8 3.2M20.4 16.8v1" strokeLinecap="round" />
    </svg>
  )
}

const ServerIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="5.8" rx="5.8" ry="2.5" />
      <path d="M6.2 5.8v4.8c0 1.4 2.6 2.5 5.8 2.5s5.8-1.1 5.8-2.5V5.8M6.2 10.6v4.8c0 1.4 2.6 2.5 5.8 2.5s5.8-1.1 5.8-2.5v-4.8" />
    </svg>
  )
}

const ReviewIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M8.7 3.7H6.3c-1.1 0-2 .9-2 2v12.7c0 1.1.9 2 2 2h9.8c1.1 0 2-.9 2-2v-2.2" />
      <path d="M9 8.2h5.7M9 12h5.2" strokeLinecap="round" />
      <path d="M14.7 5.7l3.7 3.7-3.9 3.9-3.5.3.3-3.5 3.4-4.4Z" strokeLinejoin="round" />
    </svg>
  )
}

const ChartIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4.5 19.1h15" strokeLinecap="round" />
      <path d="M7.6 16.2V9.7M12 16.2V6.4M16.4 16.2v-4.6" strokeLinecap="round" />
    </svg>
  )
}

const kpiRecordList: KpiRecord[] = [
  {
    id: 'users',
    label: 'Total Users',
    value: '14,205',
    helperText: '+342 today',
    tone: 'blue',
    icon: <UserIcon />
  },
  {
    id: 'vrms',
    label: 'Total VRMs',
    value: '4,892',
    helperText: 'Across all servers',
    tone: 'purple',
    icon: <ServerIcon />
  },
  {
    id: 'pending-reviews',
    label: 'Pending Reviews',
    value: '124',
    helperText: 'Requires attention',
    tone: 'orange',
    icon: <ReviewIcon />
  },
  {
    id: 'active-chats',
    label: 'Active Chats',
    value: '8,903',
    helperText: 'Server load: 42%',
    tone: 'green',
    icon: <ChartIcon />
  }
]

const DashboardPage = () => {
  return (
    <AdminPageShell activeKey="dashboard">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Overview</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
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
            <AdminActivityItem message="Server 'Alpha' reached 80% GPU capacity." timeLabel="10 mins ago" tone="yellow" />
            <AdminActivityItem message="User 'Weeblord99' flagged a character for NSFW content." timeLabel="25 mins ago" tone="red" />
            <AdminActivityItem message="Successfully deployed interaction patch v1.0.4." timeLabel="2 hours ago" tone="green" />
            <AdminActivityItem message="New Creator 'reKengator2' achieved 1000 likes." timeLabel="5 hours ago" tone="blue" />
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
            <AdminReviewQueueItem characterName="Shy Maid Cafe Girl" creatorName="reKengator2" />
            <AdminReviewQueueItem characterName="Dark Elf Queen" creatorName="FantasyLover" flagCount={2} />
            <AdminReviewQueueItem characterName="NSFW_Test_Do_Not_Approve" creatorName="AnonUser123" flagCount={5} />
          </div>
        </section>
      </div>
    </AdminPageShell>
  )
}

export default DashboardPage
