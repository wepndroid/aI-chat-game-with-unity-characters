type AdminUserRole = 'user' | 'creator' | 'admin'

type AdminUserRolePillProps = {
  role: AdminUserRole
}

const roleLabelMap: Record<AdminUserRole, string> = {
  user: 'User',
  creator: 'Creator',
  admin: 'Admin'
}

const roleClassNameMap: Record<AdminUserRole, string> = {
  user: 'border-white/15 bg-[#1a202b] text-[#d7dce8]',
  creator: 'border-ember-500/35 bg-ember-500/15 text-ember-200',
  admin: 'border-purple-500/35 bg-purple-500/15 text-purple-300'
}

const AdminUserRolePill = ({ role }: AdminUserRolePillProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${roleClassNameMap[role]}`}
      aria-label={`Role ${roleLabelMap[role]}`}
    >
      {roleLabelMap[role]}
    </span>
  )
}

export default AdminUserRolePill
export type { AdminUserRole }
