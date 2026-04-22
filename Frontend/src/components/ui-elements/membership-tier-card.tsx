import Link from 'next/link'

type MembershipTierCardProps = {
  tierName: string
  monthlyPriceLabel: string
  summary: string
  benefitList: string[]
  isCurrentTier: boolean
  accentTone?: 'slate' | 'amber' | 'rose'
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
  accentTone = 'slate',
  ctaLabel,
  ctaHref,
  isMostPopular = false,
  noteList,
  footerLabel
}: MembershipTierCardProps) => {
  const accentMap = {
    slate: {
      container: isCurrentTier
        ? 'border-sky-200/35 bg-[linear-gradient(180deg,rgba(100,181,246,0.18),rgba(18,18,24,0.98))] shadow-[0_24px_70px_rgba(100,181,246,0.12)]'
        : 'border-white/10 bg-[linear-gradient(180deg,rgba(125,143,179,0.10),rgba(19,17,18,0.94))] shadow-[0_20px_50px_rgba(0,0,0,0.22)]',
      heading: isCurrentTier ? 'text-sky-100' : 'text-white',
      badge: 'border-sky-200/35 bg-sky-200/12 text-sky-100',
      glow: 'bg-sky-200/10',
      bullet: 'bg-sky-200',
      benefitItem: 'bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] text-white/76'
    },
    amber: {
      container: isCurrentTier
        ? 'border-amber-200/40 bg-[linear-gradient(180deg,rgba(244,99,19,0.22),rgba(22,16,18,0.98))] shadow-[0_24px_70px_rgba(244,99,19,0.14)]'
        : 'border-amber-300/18 bg-[linear-gradient(180deg,rgba(244,99,19,0.10),rgba(19,17,18,0.94))] shadow-[0_20px_50px_rgba(0,0,0,0.22)]',
      heading: isCurrentTier ? 'text-amber-100' : 'text-white',
      badge: 'border-amber-200/35 bg-amber-200/12 text-amber-100',
      glow: 'bg-amber-200/10',
      bullet: 'bg-amber-200',
      benefitItem: 'bg-[linear-gradient(180deg,rgba(244,99,19,0.08),rgba(255,255,255,0.015))] text-white/80'
    },
    rose: {
      container: isCurrentTier
        ? 'border-fuchsia-200/40 bg-[linear-gradient(180deg,rgba(217,70,239,0.22),rgba(22,14,22,0.98))] shadow-[0_24px_70px_rgba(217,70,239,0.14)]'
        : 'border-fuchsia-300/18 bg-[linear-gradient(180deg,rgba(217,70,239,0.10),rgba(19,17,18,0.94))] shadow-[0_20px_50px_rgba(0,0,0,0.22)]',
      heading: isCurrentTier ? 'text-fuchsia-100' : 'text-white',
      badge: 'border-fuchsia-200/35 bg-fuchsia-200/12 text-fuchsia-100',
      glow: 'bg-fuchsia-200/10',
      bullet: 'bg-gradient-to-r from-fuchsia-200 via-pink-200 to-amber-100',
      benefitItem: 'bg-[linear-gradient(135deg,rgba(217,70,239,0.14),rgba(255,153,102,0.08))] text-white/90'
    }
  } as const
  const accent = accentMap[accentTone]
  const containerClassName = accent.container
  const headingColorClassName = accent.heading
  const ctaClassName = isCurrentTier
    ? 'mt-5 inline-flex h-11 w-full items-center justify-center rounded-full border border-ember-300/35 bg-ember-300/12 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ember-100 transition hover:border-ember-200 hover:bg-ember-300/18'
    : 'mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-110'

  return (
    <article className={`relative overflow-hidden rounded-[28px] border p-6 ${containerClassName}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%)]" />
      <div className={`absolute -right-10 top-6 h-28 w-28 rounded-full blur-2xl ${accent.glow}`} />
      {isMostPopular && !isCurrentTier ? (
        <span className="absolute inset-x-0 top-0 inline-flex h-9 items-center justify-center rounded-t-[28px] bg-[#f46313] text-[11px] font-semibold uppercase tracking-[0.16em] text-black">
          Most Popular
        </span>
      ) : null}

      <div className={`relative ${isMostPopular ? 'pt-8' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{isCurrentTier ? 'Active Plan' : 'Membership Tier'}</p>
            <p className={`mt-3 font-[family-name:var(--font-heading)] text-[30px] font-normal italic leading-none ${headingColorClassName}`}>{tierName}</p>
          </div>
          {isCurrentTier ? (
            <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accent.badge}`}>
              Current
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">{monthlyPriceLabel}</p>
        <p className="mt-4 min-h-[72px] text-sm leading-6 text-white/75">{summary}</p>

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

        <ul className="mt-6 space-y-2.5 text-[12px]">
          {benefitList.map((benefitItem, index) => (
            <li
              key={benefitItem}
              className={`flex items-start gap-3 rounded-[18px] px-3 py-3 ${accent.benefitItem} ${accentTone === 'rose' && index < 3 ? 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]' : ''}`}
            >
              <span className={`mt-[6px] inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${accent.bullet}`} aria-hidden="true" />
              <span className={accentTone === 'rose' && index < 3 ? 'font-semibold text-white' : ''}>{benefitItem}</span>
            </li>
          ))}
        </ul>

        <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
          {footerLabel ?? (isCurrentTier ? 'Current tier' : 'Upgrade available')}
        </p>
      </div>
    </article>
  )
}

export default MembershipTierCard
