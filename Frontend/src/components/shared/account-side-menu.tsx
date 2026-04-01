import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'

type AccountMenuKey = 'profile' | 'upload-vrm' | 'your-characters' | 'membership' | 'sign-out'

type AccountMenuEntry = {
  key: AccountMenuKey
  label: string
  href: string
}

const accountMenuEntries: AccountMenuEntry[] = [
  { key: 'profile', label: 'PROFILE', href: '/profile' },
  { key: 'upload-vrm', label: 'UPLOAD VRM', href: '/upload-vrm' },
  { key: 'your-characters', label: 'YOUR CHARACTERS', href: '/your-characters' },
  { key: 'membership', label: 'MEMBERSHIP', href: '/members' },
  { key: 'sign-out', label: 'SIGN OUT', href: '/sign-out' }
]

type AccountSideMenuProps = {
  activeKey: AccountMenuKey
}

type MenuArrowIconProps = {
  isActive: boolean
}

const MenuArrowIcon = ({ isActive }: MenuArrowIconProps) => {
  if (isActive) {
    return (
      <svg viewBox="0 0 14 14" className="size-[19px]" aria-hidden="true">
        <path d="M3 2.2L10.5 7L3 11.8V2.2Z" fill="#f48a45" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 14 14" className="size-[19px]" aria-hidden="true">
      <path d="M3 2.2L10.5 7L3 11.8V2.2Z" fill="none" stroke="#74829c" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

const AccountSideMenu = ({ activeKey }: AccountSideMenuProps) => {
  const { sessionUser } = useAuth()
  const isAdmin = sessionUser?.role === 'ADMIN'

  const visibleEntries = isAdmin
    ? accountMenuEntries.filter((entry) => entry.key !== 'membership')
    : accountMenuEntries

  return (
    <aside className="min-w-0 self-start pt-2">
      <nav className="flex w-full min-w-0 max-w-[380px] flex-col gap-9">
        {visibleEntries.map((entryItem) => {
          const isActive = entryItem.key === activeKey
          const textColorClassName = isActive ? 'text-ember-300' : 'text-[#747f96] hover:text-white/90'

          return (
            <Link
              key={entryItem.key}
              href={entryItem.href}
              aria-label={`Open ${entryItem.label}`}
              aria-current={isActive ? 'page' : undefined}
              className="group inline-flex items-center justify-between pr-1"
            >
              <span className={`font-[family-name:var(--font-heading)] text-[21px] font-medium italic leading-[0.85] tracking-[0.01em] ${textColorClassName}`}>
                {entryItem.label}
              </span>
              <span className="shrink-0 transition group-hover:brightness-125">
                <MenuArrowIcon isActive={isActive} />
              </span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default AccountSideMenu
export type { AccountMenuKey }
