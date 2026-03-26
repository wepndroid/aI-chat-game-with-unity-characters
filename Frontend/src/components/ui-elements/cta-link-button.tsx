import Link from 'next/link'

type CtaLinkButtonProps = {
  href: string
  label: string
  variant: 'light' | 'accent'
  ariaLabel: string
}

const CtaLinkButton = ({ href, label, variant, ariaLabel }: CtaLinkButtonProps) => {
  const baseClassName =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-bold uppercase tracking-[0.07em] transition sm:w-1/2'

  const variantClassName =
    variant === 'light'
      ? 'border border-white/60 bg-white text-[#1f1f1f] hover:bg-white/90'
      : 'bg-gradient-to-r from-ember-400 to-ember-500 text-white hover:brightness-110'

  const iconBorderClassName = variant === 'light' ? 'border-[#1f1f1f]/30' : 'border-white/45'

  const isExternal = href.startsWith('http://') || href.startsWith('https://')

  const content = (
    <>
      {label}
      <span className={`inline-flex size-5 items-center justify-center rounded-full border text-[11px] leading-none ${iconBorderClassName}`}>
        o
      </span>
    </>
  )

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`${baseClassName} ${variantClassName}`}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    )
  }

  return (
    <Link href={href} className={`${baseClassName} ${variantClassName}`} aria-label={ariaLabel}>
      {content}
    </Link>
  )
}

export default CtaLinkButton
