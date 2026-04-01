import Link from 'next/link'

type PlatformIconType = 'browser' | 'windows' | 'pcvr' | 'exe'

type PlatformItemProps = {
  label: string
  iconType: PlatformIconType
  href: string
  ariaLabel: string
}

type PlatformIconProps = {
  iconType: PlatformIconType
}

const PlatformIcon = ({ iconType }: PlatformIconProps) => {
  if (iconType === 'browser') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M19.6 8.5H12" strokeLinecap="round" />
        <path d="m5.2 7.1 4.1 7.1" strokeLinecap="round" />
        <path d="m10.6 19.9 4.2-7.3" strokeLinecap="round" />
      </svg>
    )
  }

  if (iconType === 'windows') {
    /** Windows 2x2 panes matching provided reference shape. */
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/90" fill="currentColor" aria-hidden="true">
        <rect x="4.2" y="4.4" width="6.9" height="6.4" />
        <rect x="12.9" y="4.4" width="6.9" height="6.4" />
        <rect x="4.2" y="12.8" width="6.9" height="6.4" />
        <rect x="12.9" y="12.8" width="6.9" height="6.4" />
      </svg>
    )
  }

  if (iconType === 'pcvr') {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/88" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path
          d="M6.2 6.6h11.6c1.2 0 2.1.9 2.2 2.1l.2 2.6M4 11.3l.2-2.6c.1-1.2 1-2.1 2.2-2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 12.1c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v4c0 1.1-.9 2-2 2h-3.1l-1.6-2.3h-2.6L9.1 18H6c-1.1 0-2-.9-2-2v-3.9Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8.1 13.8h2.2M13.7 13.8h2.2" strokeLinecap="round" />
      </svg>
    )
  }

  if (iconType === 'exe') {
    /**
     * Meta-style infinity (two loops, center crossover). Uses arc segments so it reads
     * as a continuous ∞ — not a single wavy stroke.
     */
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/88" fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden="true">
        <path
          d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 1 0 0-8c-2 0-4 1.33-6 4Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white/85" aria-hidden="true">
      <path
        d="M5.2 13.2C5.2 10.9 6.8 9.2 8.8 9.2C10.4 9.2 11.6 10.2 12 11.7C12.4 10.2 13.6 9.2 15.2 9.2C17.2 9.2 18.8 10.9 18.8 13.2C18.8 15.4 17.2 17.1 15.2 17.1C13.6 17.1 12.4 16.1 12 14.7C11.6 16.1 10.4 17.1 8.8 17.1C6.8 17.1 5.2 15.4 5.2 13.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const PlatformItem = ({ label, iconType, href, ariaLabel }: PlatformItemProps) => {
  const isExternal = href.startsWith('http://') || href.startsWith('https://')
  const tileClassName =
    'group relative flex h-[50px] w-[56px] items-center justify-center overflow-hidden rounded-[13px] border-[2px] border-white/80 bg-black/12 transition group-hover:border-ember-300/90 group-hover:bg-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-300'

  const inner = (
    <>
      <div className="absolute inset-0 bg-white/40 transition group-hover:bg-white/50" aria-hidden="true" />
      <div className="relative z-10">
        <PlatformIcon iconType={iconType} />
      </div>
    </>
  )

  const wrapperClassName =
    'group flex flex-col items-center rounded-md p-0.5 transition hover:text-ember-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-300'

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={wrapperClassName} aria-label={ariaLabel}>
        <span className={tileClassName}>{inner}</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.07em] text-white/95 group-hover:underline">{label}</span>
      </a>
    )
  }

  return (
    <Link href={href} className={wrapperClassName} aria-label={ariaLabel}>
      <span className={tileClassName}>{inner}</span>
      <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.07em] text-white/95 group-hover:underline">{label}</span>
    </Link>
  )
}

export default PlatformItem
export type { PlatformIconType }
