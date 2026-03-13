type AdminUserStatus = 'active' | 'banned'

type AdminUserStatusPillProps = {
  status: AdminUserStatus
}

const statusLabelMap: Record<AdminUserStatus, string> = {
  active: 'Active',
  banned: 'Banned'
}

const statusClassNameMap: Record<AdminUserStatus, string> = {
  active: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
  banned: 'border-rose-500/35 bg-rose-500/15 text-rose-300'
}

const AdminUserStatusPill = ({ status }: AdminUserStatusPillProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${statusClassNameMap[status]}`}
      aria-label={`Status ${statusLabelMap[status]}`}
    >
      {statusLabelMap[status]}
    </span>
  )
}

export default AdminUserStatusPill
export type { AdminUserStatus }
