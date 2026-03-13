import Link from 'next/link'
import type { ReactNode } from 'react'

type AdminSidebarItemProps = {
  label: string
  href: string
  icon: ReactNode
  isActive?: boolean
  badgeText?: string
}

const AdminSidebarItem = ({ label, href, icon, isActive = false, badgeText }: AdminSidebarItemProps) => {
  const baseClassName =
    'group inline-flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition'
  const activeClassName = isActive
    ? 'bg-[#311a10] text-ember-300'
    : 'bg-transparent text-[#7f8aa2] hover:bg-white/5 hover:text-white/90'
  const iconClassName = isActive ? 'text-ember-300' : 'text-[#737e94] group-hover:text-white/90'
  const badgeClassName = isActive
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
        <span className={`inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-[8px] font-normal ${badgeClassName}`}>
          {badgeText}
        </span>
      ) : null}
    </Link>
  )
}

export default AdminSidebarItem
