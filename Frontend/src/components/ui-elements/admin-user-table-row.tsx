import AdminUserRolePill, { type AdminUserRole } from '@/components/ui-elements/admin-user-role-pill'
import AdminUserStatusPill, { type AdminUserStatus } from '@/components/ui-elements/admin-user-status-pill'
import { useState } from 'react'

type AdminUserTableRecord = {
  id: string
  username: string
  email: string
  role: AdminUserRole
  status: AdminUserStatus
  uploads: number
  joined: string
  lastSeenLabel: string
}

type AdminUserTableRowProps = {
  userRecord: AdminUserTableRecord
  isUpdatingRole?: boolean
  onUpdateRole?: (userId: string, role: AdminUserRole) => void
}

const roleOptionList: AdminUserRole[] = ['user', 'creator', 'admin']

const AdminUserTableRow = ({ userRecord, isUpdatingRole = false, onUpdateRole }: AdminUserTableRowProps) => {
  const [nextRole, setNextRole] = useState<AdminUserRole>(userRecord.role)

  const hasRoleChange = nextRole !== userRecord.role

  const handleApplyRole = () => {
    if (!hasRoleChange || !onUpdateRole || isUpdatingRole) {
      return
    }

    onUpdateRole(userRecord.id, nextRole)
  }

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
      <td className="px-4 py-4 align-middle">
        <p className="text-base text-[#7c8aa3]">{userRecord.joined}</p>
        <p className="mt-1 text-xs text-[#63748f]">{userRecord.lastSeenLabel}</p>
      </td>
      <td className="px-4 py-4 align-middle">
        <div className="inline-flex items-center gap-2">
          <select
            value={nextRole}
            onChange={(event) => setNextRole(event.target.value as AdminUserRole)}
            className="h-8 rounded-md border border-white/15 bg-[#0f1218] px-2 text-xs text-white outline-none transition focus:border-ember-400"
            aria-label={`Choose role for ${userRecord.username}`}
            disabled={isUpdatingRole}
          >
            {roleOptionList.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleOption.toUpperCase()}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleApplyRole}
            disabled={!hasRoleChange || isUpdatingRole || !onUpdateRole}
            className="inline-flex h-8 items-center justify-center rounded-md border border-ember-500/35 bg-ember-500/20 px-3 text-xs text-ember-200 transition hover:border-ember-400 hover:text-ember-100 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={`Apply role update for ${userRecord.username}`}
          >
            {isUpdatingRole ? 'Saving...' : 'Apply'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default AdminUserTableRow
export type { AdminUserTableRecord }
