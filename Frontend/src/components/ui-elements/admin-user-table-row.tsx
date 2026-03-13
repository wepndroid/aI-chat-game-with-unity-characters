import AdminUserRolePill, { type AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import AdminUserStatusPill, { type AdminUserStatus } from '@/components/ui-elements/admin-user-status-pill'

type AdminUserTableRecord = {
  id: string
  username: string
  email: string
  role: AdminUserRole
  status: AdminUserStatus
  uploads: number
  joined: string
}

type AdminUserTableRowProps = {
  userRecord: AdminUserTableRecord
}

const SettingsIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="2.4" />
      <path d="m19 12.7.1-1.4-1.9-.7c-.1-.4-.3-.8-.5-1.2l1.1-1.8-1-1-1.8 1a4.8 4.8 0 0 0-1.2-.5l-.7-1.9h-1.4l-.7 1.9c-.4.1-.8.3-1.2.5l-1.8-1-1 1 1.1 1.8c-.2.4-.4.8-.5 1.2l-1.9.7.1 1.4 1.9.7c.1.4.3.8.5 1.2l-1.1 1.8 1 1 1.8-1.1c.4.3.8.4 1.2.5l.7 2h1.4l.7-2c.4-.1.8-.2 1.2-.5l1.8 1.1 1-1-1.1-1.8c.3-.4.4-.8.5-1.2l1.9-.7Z" />
    </svg>
  )
}

const ShieldIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3.6 6.2 6v5.2c0 3.8 2.5 6.5 5.8 8.2 3.3-1.7 5.8-4.4 5.8-8.2V6L12 3.6Z" />
    </svg>
  )
}

const AdminUserTableRow = ({ userRecord }: AdminUserTableRowProps) => {
  return (
    <tr className="border-t border-white/10">
      <td className="px-4 py-4 align-middle">
        <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-none text-white">{userRecord.username}</p>
        <p className="mt-1 text-sm text-[#6f809d]">{userRecord.email}</p>
      </td>
      <td className="px-4 py-4 align-middle">
        <AdminUserRolePill role={userRecord.role} />
      </td>
      <td className="px-4 py-4 align-middle">
        <AdminUserStatusPill status={userRecord.status} />
      </td>
      <td className="px-4 py-4 align-middle text-base font-normal text-white/85">{userRecord.uploads}</td>
      <td className="px-4 py-4 align-middle text-base text-[#7c8aa3]">{userRecord.joined}</td>
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-3">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-[#8c99b0] transition hover:border-white/15 hover:bg-white/5 hover:text-white"
            aria-label={`Open settings for ${userRecord.username}`}
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-[#8c99b0] transition hover:border-white/15 hover:bg-white/5 hover:text-white"
            aria-label={`Open moderation action for ${userRecord.username}`}
          >
            <ShieldIcon />
          </button>
        </div>
      </td>
    </tr>
  )
}

export default AdminUserTableRow
export type { AdminUserTableRecord }
