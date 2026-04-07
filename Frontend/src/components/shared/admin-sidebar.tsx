'use client'

import AdminSidebarItem from '@/components/ui-elements/admin-sidebar-item'
import { useAuth } from '@/components/providers/auth-provider'
import { ADMIN_OVERVIEW_REFRESH_EVENT } from '@/lib/admin-overview-events'
import { apiGet } from '@/lib/api-client'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type AdminSidebarKey =
  | 'dashboard'
  | 'activity'
  | 'users'
  | 'community-vrms'
  | 'official-vrms'
  | 'stories'
  | 'review-queue'
  | 'global-settings'

type AdminSidebarEntry = {
  id: AdminSidebarKey
  label: string
  href: string
  icon: ReactNode
  badgeText?: string
  badgeVariant?: 'default' | 'danger'
}

type AdminSidebarGroup = {
  id: string
  title: string
  entryList: AdminSidebarEntry[]
}

type AdminSidebarProps = {
  activeKey: AdminSidebarKey
  className?: string
}

const DashboardGridIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="4.5" width="6.2" height="6.2" rx="1.2" />
      <rect x="4.5" y="13.3" width="6.2" height="6.2" rx="1.2" />
      <rect x="13.3" y="13.3" width="6.2" height="6.2" rx="1.2" />
    </svg>
  )
}

const UserGroupIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9.2" cy="8.4" r="2.6" />
      <path d="M4.9 16.9c0-2.2 1.9-3.8 4.3-3.8s4.2 1.6 4.2 3.8" strokeLinecap="round" />
      <path d="M16.5 10.5c1.5.2 2.6 1.4 2.6 3M16.6 16.9v-.2" strokeLinecap="round" />
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

const StarsIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="m12 4.6 1.8 3.7 4.1.6-3 2.9.7 4.1-3.6-1.9-3.6 1.9.7-4.1-3-2.9 4.1-.6L12 4.6Z" />
    </svg>
  )
}

const ClipboardIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="6.1" y="5.1" width="11.8" height="15.2" rx="2" />
      <path d="M9.1 5.1h5.8V3.8H9.1v1.3ZM9 11.2h6.1M9 14.8h6.1" strokeLinecap="round" />
    </svg>
  )
}

const BookOpenIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 6.9c-1.2-.9-2.8-1.4-4.5-1.4-1.4 0-2.7.3-3.8.9v12.4c1.1-.5 2.4-.8 3.8-.8 1.8 0 3.4.5 4.5 1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 6.9c1.2-.9 2.8-1.4 4.5-1.4 1.4 0 2.7.3 3.8.9v12.4c-1.1-.5-2.4-.8-3.8-.8-1.8 0-3.4.5-4.5 1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 6.9v12.2" strokeLinecap="round" />
    </svg>
  )
}

const CogIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.6" />
      <path d="m19.4 13.3.2-2.6-2.1-.7a5.6 5.6 0 0 0-.7-1.7L18 6.1l-1.8-1.8-2.2 1.2a5.6 5.6 0 0 0-1.7-.7l-.7-2.1h-2.6l-.7 2.1c-.6.1-1.2.4-1.7.7L4.8 4.3 3 6.1l1.2 2.2c-.3.5-.5 1.1-.7 1.7l-2.1.7.2 2.6 2.1.7c.2.6.4 1.2.7 1.7L3 18.9l1.8 1.8 2.2-1.2c.5.3 1.1.5 1.7.7l.7 2.1h2.6l.7-2.1c.6-.2 1.2-.4 1.7-.7l2.2 1.2 1.8-1.8-1.2-2.2c.3-.5.5-1.1.7-1.7l2.1-.7Z" />
    </svg>
  )
}

const ShieldIcon = () => {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.4 5.6 6v5.6c0 4.2 2.7 7.2 6.4 8.9 3.7-1.7 6.4-4.7 6.4-8.9V6L12 3.4Z" />
      <path d="m9.7 10.3 2 2 2.7-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const AdminSidebar = ({ activeKey, className }: AdminSidebarProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const { sessionUser, logoutUser } = useAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null)
  const [newOfficialVrmsCount, setNewOfficialVrmsCount] = useState<number | null>(null)
  const [newCommunityVrmsCount, setNewCommunityVrmsCount] = useState<number | null>(null)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const syncOverviewBadges = useCallback(async () => {
    try {
      const payload = await apiGet<{
        data: { pendingCharacters: number; newOfficialVrmsCount: number; newCommunityVrmsCount: number }
      }>('/stats/overview')
      setPendingReviewCount(payload.data.pendingCharacters)
      setNewOfficialVrmsCount(payload.data.newOfficialVrmsCount)
      setNewCommunityVrmsCount(payload.data.newCommunityVrmsCount)
    } catch {
      setPendingReviewCount(null)
      setNewOfficialVrmsCount(null)
      setNewCommunityVrmsCount(null)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    const runSync = async () => {
      if (isCancelled) {
        return
      }

      await syncOverviewBadges()
    }

    Promise.resolve().then(runSync)

    const refreshTimerId = window.setInterval(() => {
      Promise.resolve().then(runSync)
    }, 45000)

    const handleOverviewRefresh = () => {
      Promise.resolve().then(runSync)
    }

    window.addEventListener(ADMIN_OVERVIEW_REFRESH_EVENT, handleOverviewRefresh)

    return () => {
      isCancelled = true
      window.clearInterval(refreshTimerId)
      window.removeEventListener(ADMIN_OVERVIEW_REFRESH_EVENT, handleOverviewRefresh)
    }
  }, [syncOverviewBadges, pathname])

  const sidebarGroupList = useMemo<AdminSidebarGroup[]>(
    () => [
      {
        id: 'management',
        title: 'Management',
        entryList: [
          { id: 'dashboard', label: 'Dashboard', href: '/admin/dashboard', icon: <DashboardGridIcon /> },
          { id: 'users', label: 'Users', href: '/admin/users', icon: <UserGroupIcon /> },
          {
            id: 'community-vrms',
            label: 'Community VRMs',
            href: '/admin/community-vrms',
            icon: <ServerIcon />,
            ...(newCommunityVrmsCount !== null && newCommunityVrmsCount > 0
              ? { badgeText: String(newCommunityVrmsCount), badgeVariant: 'danger' as const }
              : {})
          }
        ]
      },
      {
        id: 'content',
        title: 'Content',
        entryList: [
          {
            id: 'official-vrms',
            label: 'Official VRMs',
            href: '/admin/official-vrms',
            icon: <StarsIcon />,
            ...(newOfficialVrmsCount !== null && newOfficialVrmsCount > 0
              ? { badgeText: String(newOfficialVrmsCount), badgeVariant: 'danger' as const }
              : {})
          },
          {
            id: 'stories',
            label: 'Stories',
            href: '/admin/stories',
            icon: <BookOpenIcon />
          }
        ]
      },
      {
        id: 'moderation',
        title: 'Moderation',
        entryList: [
          {
            id: 'review-queue',
            label: 'Review Queue',
            href: '/admin/review-queue',
            icon: <ClipboardIcon />,
            badgeText: pendingReviewCount !== null ? String(pendingReviewCount) : undefined
          }
        ]
      },
      {
        id: 'system',
        title: 'System',
        entryList: [{ id: 'global-settings', label: 'Global Settings', href: '/admin/global-settings', icon: <CogIcon /> }]
      }
    ],
    [pendingReviewCount, newOfficialVrmsCount, newCommunityVrmsCount]
  )

  const handleSignOut = async () => {
    if (isSigningOut) {
      return
    }

    setSignOutError(null)
    setIsSigningOut(true)

    try {
      await logoutUser()
      router.push('/')
    } catch {
      setSignOutError('Sign out failed. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  const displayName = sessionUser?.username ?? 'Admin'
  const displayRole = sessionUser?.role ?? 'ADMIN'
  const initials = displayName.trim().slice(0, 1).toUpperCase() || 'A'

  return (
    <aside className={`flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-[#070a10]/90 ${className ?? ''}`}>
      <div className="border-b border-white/10 p-6">
        <div className="inline-flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-full border border-ember-500 text-ember-400" aria-hidden="true">
            <span className="size-4">
              <ShieldIcon />
            </span>
          </span>
          <div>
            <p className="font-[family-name:var(--font-heading)] text-[24px] font-normal leading-none text-white">
              Admin<span className="text-[#667a9c]">Panel</span>
            </p>
            <p className="mt-1 text-[8px] font-normal uppercase tracking-[0.11em] text-ember-400">SecretWaifu</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6 p-4">
        {sidebarGroupList.map((groupItem) => (
          <section key={groupItem.id}>
            <p className="px-3 text-[8px] font-normal uppercase tracking-[0.12em] text-[#4f607f]">{groupItem.title}</p>
            <div className="mt-2 space-y-1">
              {groupItem.entryList.map((entryItem) => (
                <AdminSidebarItem
                  key={entryItem.id}
                  label={entryItem.label}
                  href={entryItem.href}
                  icon={entryItem.icon}
                  isActive={entryItem.id === activeKey}
                  badgeText={entryItem.badgeText}
                  badgeVariant={entryItem.badgeVariant}
                />
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-xl border border-white/15 bg-[#0f1218] p-3">
          <div className="inline-flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-purple-500/25 text-[12px] font-normal text-purple-300">
              {initials}
            </span>
            <div>
              <p className="text-xs font-normal text-white">{displayName}</p>
              <p className="text-[10px] font-normal text-purple-300">{displayRole.toLowerCase()}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-normal text-[#8a98b3] transition hover:bg-white/5 hover:text-white"
          aria-label="Sign out admin account"
          onClick={handleSignOut}
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
        {signOutError ? <p className="mt-2 text-xs text-rose-300">{signOutError}</p> : null}
      </div>
    </aside>
  )
}

export default AdminSidebar
export type { AdminSidebarKey }
