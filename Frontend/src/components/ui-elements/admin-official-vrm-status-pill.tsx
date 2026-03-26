type AdminOfficialVrmStatus = 'published' | 'draft' | 'pending' | 'rejected' | 'archived'

type AdminOfficialVrmStatusPillProps = {
  status: AdminOfficialVrmStatus
}

const statusLabelMap: Record<AdminOfficialVrmStatus, string> = {
  published: 'Published',
  draft: 'Draft',
  pending: 'Pending',
  rejected: 'Rejected',
  archived: 'Archived'
}

const statusClassNameMap: Record<AdminOfficialVrmStatus, string> = {
  published: 'border-amber-500/35 bg-amber-500/15 text-amber-300',
  draft: 'border-white/15 bg-[#1a202b] text-[#cfd7e6]',
  pending: 'border-sky-500/35 bg-sky-500/15 text-sky-200',
  rejected: 'border-rose-500/35 bg-rose-500/15 text-rose-200',
  archived: 'border-white/15 bg-[#232833] text-[#b8c4d8]'
}

const AdminOfficialVrmStatusPill = ({ status }: AdminOfficialVrmStatusPillProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-normal leading-none ${statusClassNameMap[status]}`}
      aria-label={`Official VRM status ${statusLabelMap[status]}`}
    >
      {statusLabelMap[status]}
    </span>
  )
}

export default AdminOfficialVrmStatusPill
export type { AdminOfficialVrmStatus }
