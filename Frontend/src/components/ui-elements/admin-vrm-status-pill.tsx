type AdminVrmVisibilityStatus = 'public' | 'private' | 'removed'

type AdminVrmStatusPillProps = {
  status: AdminVrmVisibilityStatus
}

const statusLabelMap: Record<AdminVrmVisibilityStatus, string> = {
  public: 'Public',
  private: 'Private',
  removed: 'Removed'
}

const statusClassNameMap: Record<AdminVrmVisibilityStatus, string> = {
  public: 'border-blue-500/35 bg-blue-500/15 text-blue-300',
  private: 'border-white/15 bg-[#1a202b] text-[#cfd7e6]',
  removed: 'border-rose-500/35 bg-rose-500/15 text-rose-300'
}

const AdminVrmStatusPill = ({ status }: AdminVrmStatusPillProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${statusClassNameMap[status]}`}
      aria-label={`VRM status ${statusLabelMap[status]}`}
    >
      {statusLabelMap[status]}
    </span>
  )
}

export default AdminVrmStatusPill
export type { AdminVrmVisibilityStatus }
