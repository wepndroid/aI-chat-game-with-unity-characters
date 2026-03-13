type ActivityTone = 'yellow' | 'red' | 'green' | 'blue'

type AdminActivityItemProps = {
  message: string
  timeLabel: string
  tone: ActivityTone
}

const bulletClassNameMap: Record<ActivityTone, string> = {
  yellow: 'bg-amber-300',
  red: 'bg-rose-500',
  green: 'bg-emerald-400',
  blue: 'bg-blue-500'
}

const AdminActivityItem = ({ message, timeLabel, tone }: AdminActivityItemProps) => {
  return (
    <article className="border-b border-white/10 py-5 last:border-b-0">
      <div className="flex items-start gap-4">
        <span className={`mt-2 inline-flex size-2 rounded-full ${bulletClassNameMap[tone]}`} aria-hidden="true" />
        <div>
          <p className="text-sm leading-6 text-white/88">{message}</p>
          <p className="mt-1 text-xs text-[#6f7e99]">{timeLabel}</p>
        </div>
      </div>
    </article>
  )
}

export default AdminActivityItem
