/** Heart + views icons for admin VRM tables. Size is 4/3 of the former size-3.5 (14px → ~18.67px). */
const metricIconSizeClass = 'size-[calc(0.875rem*4/3)]'

export function AdminVrmMetricHeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? metricIconSizeClass} fill="currentColor" aria-hidden>
      <path d="M12 20s-6.7-4.2-8.8-7.7a5.1 5.1 0 0 1 8.1-6 5.1 5.1 0 0 1 8.2 6C18.7 15.8 12 20 12 20Z" />
    </svg>
  )
}

export function AdminVrmMetricViewsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? metricIconSizeClass} fill="currentColor" aria-hidden>
      <path d="M5.5 5.7h13a2.8 2.8 0 0 1 2.8 2.8v6.4a2.8 2.8 0 0 1-2.8 2.8h-7l-3.6 3.1v-3.1H5.5a2.8 2.8 0 0 1-2.8-2.8V8.5a2.8 2.8 0 0 1 2.8-2.8Z" />
    </svg>
  )
}
