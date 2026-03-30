import Link from 'next/link'
import type { ReactNode } from 'react'

type AdminSidebarItemProps = {
  label: string
  href: string
  icon: ReactNode
  isActive?: boolean
  badgeText?: string
  /** Red alert style for unread / attention counts (e.g. new official VRMs). */
  badgeVariant?: 'default' | 'danger'
}

const AdminSidebarItem = ({
  label,
  href,
  icon,
  isActive = false,
  badgeText,
  badgeVariant = 'default'
}: AdminSidebarItemProps) => {
  const baseClassName =
    'group inline-flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition'
  const activeClassName = isActive
    ? 'bg-[#311a10] text-ember-300'
    : 'bg-transparent text-[#7f8aa2] hover:bg-white/5 hover:text-white/90'
  const iconClassName = isActive ? 'text-ember-300' : 'text-[#737e94] group-hover:text-white/90'

  const badgeClassName =
    badgeVariant === 'danger'
      ? isActive
        ? 'border border-rose-400/55 bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.35)]'
        : 'border border-rose-500/50 bg-rose-950/90 text-rose-100 group-hover:border-rose-400/60 group-hover:bg-rose-900/95 group-hover:text-white'
      : isActive
        ? 'bg-ember-400 text-black'
        : 'bg-[#252c3a] text-[#cfd5e3] group-hover:bg-[#2f3748] group-hover:text-white'

  return (
    <Link href={href} aria-label={`Open ${label}`} aria-current={isActive ? 'page' : undefined} className={`${baseClassName} ${activeClassName}`}>
      <span className="inline-flex items-center gap-3">
        <span className={`size-5 ${iconClassName}`} aria-hidden="true">
          {icon}
        </span>
        <span className="text-[20px] font-[family-name:var(--font-heading)] font-normal leading-none">{label}</span>
      </span>

      {badgeText ? (
        <span
          className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-full px-2.5 py-1 text-[12px] font-normal tabular-nums ${badgeClassName}`}
        >
          {badgeText}
        </span>
      ) : null}
    </Link>
  )
}

export default AdminSidebarItem
