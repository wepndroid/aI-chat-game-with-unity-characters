type MembershipConnectionStatus = 'not-connected' | 'syncing' | 'active' | 'expired' | 'canceled'

type MembershipStatusPillProps = {
  status: MembershipConnectionStatus
}

const statusLabelMap: Record<MembershipConnectionStatus, string> = {
  'not-connected': 'Not Connected',
  syncing: 'Syncing',
  active: 'Active',
  expired: 'Expired',
  canceled: 'Canceled'
}

const statusClassNameMap: Record<MembershipConnectionStatus, string> = {
  'not-connected': 'border-white/20 bg-white/5 text-white/75',
  syncing: 'border-amber-300/45 bg-amber-300/10 text-amber-100',
  active: 'border-emerald-300/45 bg-emerald-300/10 text-emerald-100',
  expired: 'border-rose-300/45 bg-rose-300/10 text-rose-100',
  canceled: 'border-[#7e889e] bg-[#7e889e]/10 text-[#b4bfd7]'
}

const MembershipStatusPill = ({ status }: MembershipStatusPillProps) => {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${statusClassNameMap[status]}`}
      aria-label={`Membership status ${statusLabelMap[status]}`}
    >
      {statusLabelMap[status]}
    </span>
  )
}

export default MembershipStatusPill
export type { MembershipConnectionStatus }
