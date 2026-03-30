type CharacterModerationStatus = 'draft' | 'pending' | 'approved' | 'rejected'

type ModerationStatusChipProps = {
  status: CharacterModerationStatus
  mode?: 'default' | 'admin'
}

const statusLabelMap: Record<CharacterModerationStatus, string> = {
  draft: 'Draft',
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected'
}

const adminStatusLabelMap: Record<CharacterModerationStatus, string> = {
  draft: 'Draft',
  pending: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected'
}

const statusClassNameMap: Record<CharacterModerationStatus, string> = {
  draft: 'border-white/20 bg-white/5 text-white/80',
  pending: 'border-amber-300/40 bg-amber-200/10 text-amber-100',
  approved: 'border-emerald-300/35 bg-emerald-200/10 text-emerald-100',
  rejected: 'border-rose-300/35 bg-rose-200/10 text-rose-100'
}

const ModerationStatusChip = ({ status, mode = 'default' }: ModerationStatusChipProps) => {
  const labelMap = mode === 'admin' ? adminStatusLabelMap : statusLabelMap

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusClassNameMap[status]}`}
      aria-label={`Status ${labelMap[status]}`}
    >
      {labelMap[status]}
    </span>
  )
}

export default ModerationStatusChip
export type { CharacterModerationStatus }
