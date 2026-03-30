'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminActivityItem from '@/components/ui-elements/admin-activity-item'
import { apiGet } from '@/lib/api-client'
import { useEffect, useState } from 'react'

type ActivityTone = 'yellow' | 'red' | 'green' | 'blue'

type ActivityResponse = {
  data: Array<{
    id: string
    message: string
    timeLabel: string
    tone: ActivityTone
  }>
}

const AdminActivityPage = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activityRecordList, setActivityRecordList] = useState<ActivityResponse['data']>([])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await apiGet<ActivityResponse>('/stats/activity')

        if (!isCancelled) {
          setActivityRecordList(payload.data)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load system activity.')
          setActivityRecordList([])
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

  return (
    <AdminPageShell activeKey="activity">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">System Activity</h1>
      <p className="mt-2 text-sm text-[#95a6c1]">
        Recent sign-ups, character updates, reviews, and moderation events (for example bans) from the app database.
      </p>

      {errorMessage ? (
        <p className="mt-4 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
        {isLoading ? <p className="py-4 text-sm text-white/70">Loading activity...</p> : null}
        {!isLoading && activityRecordList.length === 0 ? <p className="py-4 text-sm text-white/70">No recent activity yet.</p> : null}
        {activityRecordList.map((activityItem) => (
          <AdminActivityItem
            key={activityItem.id}
            message={activityItem.message}
            timeLabel={activityItem.timeLabel}
            tone={activityItem.tone}
          />
        ))}
      </section>
    </AdminPageShell>
  )
}

export default AdminActivityPage
