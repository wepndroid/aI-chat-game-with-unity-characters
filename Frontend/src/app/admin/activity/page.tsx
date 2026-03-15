import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminActivityItem from '@/components/ui-elements/admin-activity-item'

const activityRecordList = [
  { id: 'activity-1', message: "Server 'Alpha' reached 80% GPU capacity.", timeLabel: '10 mins ago', tone: 'yellow' as const },
  { id: 'activity-2', message: "User 'Weeblord99' flagged a character for NSFW content.", timeLabel: '25 mins ago', tone: 'red' as const },
  { id: 'activity-3', message: 'Successfully deployed interaction patch v1.0.4.', timeLabel: '2 hours ago', tone: 'green' as const },
  { id: 'activity-4', message: "New creator 'reKengator2' reached 1000 likes.", timeLabel: '5 hours ago', tone: 'blue' as const }
]

const AdminActivityPage = () => {
  return (
    <AdminPageShell activeKey="dashboard">
      <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">System Activity</h1>
      <p className="mt-2 text-sm text-[#95a6c1]">Admin activity feed placeholder backed by mock entries.</p>

      <section className="mt-6 rounded-2xl border border-white/10 bg-[#0c0f14]/95 px-5 py-5 sm:px-6">
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
