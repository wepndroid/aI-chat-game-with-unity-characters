import Link from 'next/link'
import type { FocusEvent, MouseEvent, PointerEvent, TouchEvent } from 'react'

type CtaLinkButtonProps = {
  href: string
  label: string
  variant: 'light' | 'accent'
  ariaLabel: string
  iconType?: 'download' | 'chrome'
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void
  onPointerEnter?: (event: PointerEvent<HTMLAnchorElement>) => void
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void
}

const DownloadTrayIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      aria-hidden="true"
      suppressHydrationWarning
    >
      <path d="M12 3.5v9.4" strokeLinecap="round" />
      <path d="m8.8 9.9 3.2 3.2 3.2-3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15.3v2.1c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.1" strokeLinecap="round" />
      <circle cx="8.5" cy="16.6" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="16.6" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

const ChromeMonochromeIcon = ({ className }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      suppressHydrationWarning
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M19.6 8.5H12" strokeLinecap="round" />
      <path d="m5.2 7.1 4.1 7.1" strokeLinecap="round" />
      <path d="m10.6 19.9 4.2-7.3" strokeLinecap="round" />
    </svg>
  )
}

const CtaLinkButton = ({
  href,
  label,
  variant,
  ariaLabel,
  iconType = 'download',
  onClick,
  onFocus,
  onPointerEnter,
  onTouchStart
}: CtaLinkButtonProps) => {
  const baseClassName =
    'inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-bold uppercase tracking-[0.06em] transition sm:min-h-[48px] sm:w-1/2 sm:rounded-md sm:px-5 sm:text-sm'

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
        {iconType === 'chrome' ? <ChromeMonochromeIcon className="size-[18px]" /> : <DownloadTrayIcon className="size-[18px]" />}
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
        onFocus={onFocus}
        onPointerEnter={onPointerEnter}
        onTouchStart={onTouchStart}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onTouchStart={onTouchStart}
      className={`${baseClassName} ${variantClassName}`}
      aria-label={ariaLabel}
    >
      {content}
    </Link>
  )
}

export default CtaLinkButton
