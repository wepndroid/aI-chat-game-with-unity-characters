import AdminUserRolePill, { type AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import AdminUserStatusPill, { type AdminUserStatus } from '@/components/ui-elements/admin-user-status-pill'
import { formatCompactCount } from '@/lib/format-compact-count'
import Image from 'next/image'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const ROLE_MENU_MIN_WIDTH_PX = 136

type AdminUserTableRecord = {
  id: string
  username: string
  email: string
  /** Profile image URL from API; shown as circle or initial fallback. */
  avatarUrl: string | null
  role: AdminUserRole
  status: AdminUserStatus
  /** Used when toggling ban so status can return to active vs unverified. */
  isEmailVerified: boolean
  uploads: number
  joined: string
  tierCents: number | null
  tierCode: string
  manualTierCode: string | null
  patreonLinked: boolean
  patreonMembershipStatus: string | null
  quota: {
    tierCode: string
    periodEndsAt: string
    message: {
      limit: number | null
      used: number
      reserved: number
      remaining: number | null
      unlimited: boolean
    }
    voice: {
      enabled: boolean
      limit: number | null
      used: number
      reserved: number
      remaining: number | null
      unlimited: boolean
    }
  }
}

type AdminUserTableRowProps = {
  userRecord: AdminUserTableRecord
  isUpdatingRole?: boolean
  isUpdatingBan?: boolean
  currentAdminUserId?: string | null
  onUpdateRole?: (userId: string, role: AdminUserRole) => void
  onToggleBan?: (userId: string, banned: boolean) => void
  onEditDetails?: (userId: string) => void
  onOpenPatreonDebug?: (userId: string) => void
}

const roleOptionList: AdminUserRole[] = ['user', 'creator', 'admin']

const roleMenuLabelMap: Record<AdminUserRole, string> = {
  user: 'User',
  creator: 'Creator',
  admin: 'Admin'
}

const formatQuotaAmount = (value: number | null, unlimited: boolean) => {
  if (unlimited || value === null) {
    return 'Unlimited'
  }

  return formatCompactCount(value)
}

const QuotaLine = ({
  label,
  limit,
  remaining,
  unlimited,
  disabled = false
}: {
  label: string
  limit: number | null
  remaining: number | null
  unlimited: boolean
  disabled?: boolean
}) => {
  if (disabled) {
    return (
      <p className="text-[12px] leading-5 text-white/42">
        <span className="font-semibold text-white/55">{label}:</span> Off
      </p>
    )
  }

  return (
    <p className="text-[12px] leading-5 text-[#9fb0cb]">
      <span className="font-semibold text-white/72">{label}:</span>{' '}
      <span className="text-white">{formatQuotaAmount(remaining, unlimited)}</span> left
      <span className="text-white/45"> / {formatQuotaAmount(limit, unlimited)} limit</span>
    </p>
  )
}

/** Shield-off (slash) — ban / not protected (matches reference outline style). */
const ShieldOffIcon = ({ className = 'size-5' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m3 3 18 18" />
    </svg>
  )
}

/** Circle with check — unban / restore (matches reference outline style). */
const CircleCheckIcon = ({ className = 'size-5' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

const SettingsGearIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const EditPencilIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5Z" />
    </svg>
  )
}

const PatreonDebugIcon = ({ className = 'size-4' }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5v1A2.5 2.5 0 0 1 13.5 9h-3A2.5 2.5 0 0 1 8 6.5z" />
      <path d="M12 9v5" />
      <path d="M12 18.5h.01" />
      <path d="M4 12a8 8 0 1 0 16 0" />
    </svg>
  )
}

const AdminUserTableRow = ({
  userRecord,
  isUpdatingRole = false,
  isUpdatingBan = false,
  currentAdminUserId = null,
  onUpdateRole,
  onToggleBan,
  onEditDetails,
  onOpenPatreonDebug
}: AdminUserTableRowProps) => {
  const [roleMenuOpen, setRoleMenuOpen] = useState(false)
  const [roleMenuPosition, setRoleMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const roleMenuAnchorRef = useRef<HTMLDivElement>(null)
  const roleMenuPortalRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!roleMenuOpen) {
      const timeout = window.setTimeout(() => {
        setRoleMenuPosition(null)
      }, 0)
      return () => window.clearTimeout(timeout)
    }

    const updatePosition = () => {
      const anchor = roleMenuAnchorRef.current
      if (!anchor) {
        return
      }

      const rect = anchor.getBoundingClientRect()
      const left = Math.min(
        Math.max(8, rect.right - ROLE_MENU_MIN_WIDTH_PX),
        window.innerWidth - ROLE_MENU_MIN_WIDTH_PX - 8
      )

      setRoleMenuPosition({
        top: rect.bottom + 4,
        left
      })
    }

    const frameId = window.requestAnimationFrame(updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [roleMenuOpen])

  useEffect(() => {
    if (!roleMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (roleMenuAnchorRef.current?.contains(target)) {
        return
      }

      if (roleMenuPortalRef.current?.contains(target)) {
        return
      }

      setRoleMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRoleMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [roleMenuOpen])

  const handlePickRole = (pickedRole: AdminUserRole) => {
    setRoleMenuOpen(false)
    if (pickedRole === userRecord.role || !onUpdateRole || isUpdatingRole) {
      return
    }

    onUpdateRole(userRecord.id, pickedRole)
  }

  const isBanned = userRecord.status === 'banned'
  const rowBusy = isUpdatingRole || isUpdatingBan
  const isSelfRow = currentAdminUserId !== null && currentAdminUserId === userRecord.id

  const handleBanButtonClick = () => {
    if (!onToggleBan || rowBusy) {
      return
    }

    if (isSelfRow && !isBanned) {
      return
    }

    onToggleBan(userRecord.id, !isBanned)
  }

  return (
    <tr className="border-t border-white/10">
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-ember-500/35 to-[#1a1414] text-sm font-bold uppercase text-white">
            {userRecord.avatarUrl ? (
              <Image
                src={userRecord.avatarUrl}
                alt=""
                width={44}
                height={44}
                unoptimized
                className="size-11 object-cover"
              />
            ) : (
              <span aria-hidden>{userRecord.username.slice(0, 1)}</span>
            )}
          </span>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{userRecord.username}</p>
            <p className="mt-1 break-words text-sm text-[#6f809d]">{userRecord.email}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-white/40">
              {userRecord.patreonLinked
                ? `Patreon: ${userRecord.patreonMembershipStatus ?? 'linked'}`
                : 'Patreon: not linked'}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <AdminUserRolePill role={userRecord.role} />
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <AdminUserStatusPill status={userRecord.status} />
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4 text-base font-normal text-white/85">
        {userRecord.role === 'admin'
          ? 'Premium (Admin)'
          : userRecord.tierCode === 'premium'
            ? 'Premium'
            : userRecord.tierCode === 'basic'
              ? 'Basic'
              : 'Free'}
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4 text-base font-normal text-white/85">{userRecord.uploads}</td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <div className="min-w-[160px]">
          <QuotaLine
            label="Text"
            limit={userRecord.quota.message.limit}
            remaining={userRecord.quota.message.remaining}
            unlimited={userRecord.quota.message.unlimited}
          />
          <QuotaLine
            label="Voice"
            limit={userRecord.quota.voice.limit}
            remaining={userRecord.quota.voice.remaining}
            unlimited={userRecord.quota.voice.unlimited}
            disabled={!userRecord.quota.voice.enabled}
          />
        </div>
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <p className="text-base text-[#7c8aa3]">{userRecord.joined}</p>
      </td>
      <td className="px-3 py-3 align-middle sm:px-4 sm:py-4">
        <div className="inline-flex items-center gap-2">
          <div className="inline-flex" ref={roleMenuAnchorRef}>
            <button
              type="button"
              onClick={() => setRoleMenuOpen((open) => !open)}
              disabled={isUpdatingRole || !onUpdateRole}
              className="inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-45"
              aria-expanded={roleMenuOpen}
              aria-haspopup="menu"
              aria-label={`Role options for ${userRecord.username}`}
            >
              {isUpdatingRole ? (
                <span className="text-[10px] text-ember-300">…</span>
              ) : (
                <SettingsGearIcon className="size-[18px]" />
              )}
            </button>
          </div>

          {roleMenuOpen && roleMenuPosition && typeof document !== 'undefined'
            ? createPortal(
                <div
                  ref={roleMenuPortalRef}
                  role="menu"
                  style={{
                    position: 'fixed',
                    top: roleMenuPosition.top,
                    left: roleMenuPosition.left,
                    zIndex: 100,
                    minWidth: ROLE_MENU_MIN_WIDTH_PX
                  }}
                  className="rounded-lg border border-white/15 bg-[#12161c] py-1 shadow-lg shadow-black/40"
                >
                  {roleOptionList.map((roleOption) => {
                    const isCurrent = roleOption === userRecord.role
                    const isDemoteFromAdminDisabled =
                      isSelfRow &&
                      userRecord.role === 'admin' &&
                      (roleOption === 'user' || roleOption === 'creator')
                    return (
                      <button
                        key={roleOption}
                        type="button"
                        role="menuitem"
                        disabled={isDemoteFromAdminDisabled}
                        onClick={() => handlePickRole(roleOption)}
                        className={`flex w-full items-center px-3 py-2 text-left text-sm transition ${
                          isDemoteFromAdminDisabled
                            ? 'cursor-not-allowed opacity-40'
                            : 'hover:bg-white/5 ' + (isCurrent ? 'text-ember-300' : 'text-white/90')
                        }`}
                      >
                        {roleMenuLabelMap[roleOption]}
                        {isCurrent ? <span className="ml-auto pl-2 text-[10px] uppercase text-white/40">current</span> : null}
                      </button>
                    )
                  })}
                </div>,
                document.body
              )
            : null}

          <button
            type="button"
            onClick={handleBanButtonClick}
            disabled={rowBusy || !onToggleBan || (isSelfRow && !isBanned)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-[#9ca3af] transition hover:bg-white/5 hover:text-[#d4d4d8] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={
              isBanned ? `Unban ${userRecord.username}` : `Ban ${userRecord.username}`
            }
            title={isBanned ? 'Unban user' : 'Ban user'}
          >
            {isUpdatingBan ? (
              <span className="text-[10px] text-ember-300">…</span>
            ) : isBanned ? (
              <CircleCheckIcon />
            ) : (
              <ShieldOffIcon />
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenPatreonDebug?.(userRecord.id)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/5 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Open Patreon debug for ${userRecord.username}`}
            title={`Patreon debug for ${userRecord.username}`}
            disabled={rowBusy || !onOpenPatreonDebug}
          >
            <PatreonDebugIcon className="size-[16px]" />
          </button>
          <button
            type="button"
            onClick={() => onEditDetails?.(userRecord.id)}
            className="inline-flex size-9 items-center justify-center rounded-lg text-white/85 transition hover:bg-white/5 hover:text-ember-200 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Edit account details for ${userRecord.username}`}
            title={`Edit ${userRecord.username}`}
            disabled={rowBusy || !onEditDetails}
          >
            <EditPencilIcon className="size-[16px]" />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default AdminUserTableRow
export type { AdminUserTableRecord }
