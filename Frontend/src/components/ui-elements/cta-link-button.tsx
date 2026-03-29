import Link from 'next/link'

type CtaLinkButtonProps = {
  href: string
  label: string
  variant: 'light' | 'accent'
  ariaLabel: string
}

const DownloadTrayIcon = ({ className }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 3.5v9.4" strokeLinecap="round" />
      <path d="m8.8 9.9 3.2 3.2 3.2-3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15.3v2.1c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1" strokeLinecap="round" />
      <circle cx="8.5" cy="16.6" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="16.6" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

const CtaLinkButton = ({ href, label, variant, ariaLabel }: CtaLinkButtonProps) => {
  const baseClassName =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-bold uppercase tracking-[0.07em] transition sm:w-1/2'

  const variantClassName =
    variant === 'light'
      ? 'border border-white/60 bg-white text-[#1f1f1f] hover:bg-white/90'
      : 'bg-gradient-to-r from-ember-400 to-ember-500 text-white hover:brightness-110'

  const iconColorClassName = variant === 'light' ? 'text-[#1f1f1f]' : 'text-white'

  const isExternal = href.startsWith('http://') || href.startsWith('https://')

  const content = (
    <>
      {label}
      <span className={`inline-flex size-5 items-center justify-center ${iconColorClassName}`}>
        <DownloadTrayIcon className="size-[18px]" />
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
