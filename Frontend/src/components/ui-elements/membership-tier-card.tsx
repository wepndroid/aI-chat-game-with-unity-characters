import Link from 'next/link'

type MembershipTierCardProps = {
  tierName: string
  monthlyPriceLabel: string
  summary: string
  benefitList: string[]
  isCurrentTier: boolean
  ctaLabel?: string
  ctaHref?: string
  isMostPopular?: boolean
  noteList?: string[]
  footerLabel?: string
}

const MembershipTierCard = ({
  tierName,
  monthlyPriceLabel,
  summary,
  benefitList,
  isCurrentTier,
  ctaLabel,
  ctaHref,
  isMostPopular = false,
  noteList,
  footerLabel
}: MembershipTierCardProps) => {
  const containerClassName = isCurrentTier
    ? 'border-ember-300/45 bg-ember-500/10'
    : 'border-white/10 bg-[#131112]'
  const headingColorClassName = isCurrentTier ? 'text-ember-200' : 'text-white'
  const ctaClassName = isCurrentTier
    ? 'mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-ember-300/35 bg-ember-300/12 px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-ember-100 transition hover:border-ember-200 hover:bg-ember-300/18'
    : 'mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-black transition hover:brightness-110'

  return (
    <article className={`relative rounded-xl border p-4 ${containerClassName}`}>
      {isMostPopular && !isCurrentTier ? (
        <span className="absolute inset-x-0 top-0 inline-flex h-8 items-center justify-center rounded-t-xl bg-[#f46313] text-[11px] font-semibold uppercase tracking-[0.08em] text-black">
          Most Popular
        </span>
      ) : null}

      <div className={isMostPopular ? 'pt-8' : ''}>
        <p className={`font-[family-name:var(--font-heading)] text-[22px] font-normal italic leading-none ${headingColorClassName}`}>{tierName}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">{monthlyPriceLabel}</p>
        <p className="mt-3 text-sm leading-6 text-white/75">{summary}</p>

        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            target={ctaHref.startsWith('http') ? '_blank' : undefined}
            rel={ctaHref.startsWith('http') ? 'noreferrer' : undefined}
            className={ctaClassName}
            aria-label={`${ctaLabel} for ${tierName}`}
          >
            {ctaLabel}
          </Link>
        ) : null}

        {noteList?.length ? (
          <ul className="mt-4 space-y-1 text-[12px] leading-5 text-white/78">
            {noteList.map((noteItem) => (
              <li key={noteItem}>{noteItem}</li>
            ))}
          </ul>
        ) : null}

        <ul className="mt-4 space-y-1.5 text-[12px] text-white/75">
          {benefitList.map((benefitItem) => (
            <li key={benefitItem} className="flex items-start gap-2">
              <span className="mt-1.5 inline-flex size-1.5 rounded-full bg-ember-300/85" aria-hidden="true" />
              <span>{benefitItem}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">
          {footerLabel ?? (isCurrentTier ? 'Current tier' : 'Upgrade available')}
        </p>
      </div>
    </article>
  )
}

export default MembershipTierCard
