type EntitlementSourceProvider = 'patreon' | 'manual'
type EntitlementStatus = 'active' | 'inactive'

type MembershipEntitlementRecord = {
  id: string
  featureKey: string
  sourceProvider: EntitlementSourceProvider
  validUntilLabel: string
  status: EntitlementStatus
}

type MembershipEntitlementRowProps = {
  entitlementRecord: MembershipEntitlementRecord
}

const sourceLabelMap: Record<EntitlementSourceProvider, string> = {
  patreon: 'Patreon',
  manual: 'Manual'
}

const statusTextClassNameMap: Record<EntitlementStatus, string> = {
  active: 'text-emerald-200',
  inactive: 'text-rose-200'
}

const MembershipEntitlementRow = ({ entitlementRecord }: MembershipEntitlementRowProps) => {
  const statusLabel = entitlementRecord.status === 'active' ? 'Active' : 'Inactive'
  const rowClassName = entitlementRecord.status === 'active' ? 'border-white/10 bg-[#141214]/80' : 'border-white/10 bg-[#1a1213]/70'

  return (
    <article className={`grid gap-3 rounded-lg border px-3 py-3 sm:grid-cols-[1.4fr_0.8fr_0.9fr_0.7fr] sm:items-center ${rowClassName}`}>
      <p className="text-sm text-white/90">{entitlementRecord.featureKey}</p>
      <p className="text-xs uppercase tracking-[0.09em] text-white/65">{sourceLabelMap[entitlementRecord.sourceProvider]}</p>
      <p className="text-xs uppercase tracking-[0.09em] text-white/65">{entitlementRecord.validUntilLabel}</p>
      <p className={`text-xs font-semibold uppercase tracking-[0.09em] ${statusTextClassNameMap[entitlementRecord.status]}`}>{statusLabel}</p>
    </article>
  )
}

export default MembershipEntitlementRow
export type { MembershipEntitlementRecord, EntitlementStatus, EntitlementSourceProvider }
