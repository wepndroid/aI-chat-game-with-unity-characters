type MembershipTierCardProps = {
  tierName: string
  monthlyPriceLabel: string
  summary: string
  benefitList: string[]
  isCurrentTier: boolean
}

const MembershipTierCard = ({ tierName, monthlyPriceLabel, summary, benefitList, isCurrentTier }: MembershipTierCardProps) => {
  const containerClassName = isCurrentTier
    ? 'border-ember-300/45 bg-ember-500/10'
    : 'border-white/10 bg-[#131112]'
  const headingColorClassName = isCurrentTier ? 'text-ember-200' : 'text-white'

  return (
    <article className={`rounded-xl border p-4 ${containerClassName}`}>
      <p className={`font-[family-name:var(--font-heading)] text-[22px] font-normal italic leading-none ${headingColorClassName}`}>{tierName}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">{monthlyPriceLabel}</p>
      <p className="mt-3 text-sm leading-6 text-white/75">{summary}</p>

      <ul className="mt-4 space-y-1.5 text-[12px] text-white/75">
        {benefitList.map((benefitItem) => (
          <li key={benefitItem} className="flex items-start gap-2">
            <span className="mt-1.5 inline-flex size-1.5 rounded-full bg-ember-300/85" aria-hidden="true" />
            <span>{benefitItem}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">
        {isCurrentTier ? 'Current tier' : 'Upgrade available'}
      </p>
    </article>
  )
}

export default MembershipTierCard
