import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { KeyboardEvent, MouseEvent } from 'react'
import { AI_GIRLFRIEND_ROUTE_BASE } from '@/lib/ai-girlfriend-route'

type CharacterGalleryCardProps = {
  routeId: string
  name: string
  likes: string
  messages: string
  gradientClassName: string
  className?: string
  tagline?: string
  description?: string
  previewImageUrl?: string | null
  cardThumbnailDesktopUrl?: string | null
  cardThumbnailMobileUrl?: string | null
  onActionClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  moderationStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  showModerationBadge?: boolean
  /** When true, pending characters do not show the "Waiting Approval" badge (admin Your Characters). */
  suppressPendingModerationBadge?: boolean
}

const toTagChipLabel = (value?: string) => {
  if (!value) {
    return 'AI COMPANION'
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 24)
    .toUpperCase()
}

const toDescriptionPreview = (value?: string) => {
  if (!value) {
    return null
  }

  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return null
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96).trimEnd()}...` : normalized
}

const MessageBubbleIcon = ({ className = 'size-6' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.75c-4.97 0-9 3.32-9 7.43 0 2.61 1.65 4.9 4.14 6.22-.09 1.11-.4 2.26-1.12 3.03a.6.6 0 0 0 .58 1.01c1.92-.35 3.49-1.2 4.45-1.86.31.03.62.05.95.05 4.97 0 9-3.32 9-7.43S16.97 2.75 12 2.75Z"
        fill="currentColor"
      />
      <circle cx="8.5" cy="10.3" r="1.05" fill="#1b120e" />
      <circle cx="12" cy="10.3" r="1.05" fill="#1b120e" />
      <circle cx="15.5" cy="10.3" r="1.05" fill="#1b120e" />
    </svg>
  )
}

const HeartOutlineIcon = ({ className = 'size-6' }: { className?: string }) => {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.85" aria-hidden="true">
      <path
        d="m12 20.2-.78-.7C6.46 15.21 3.5 12.53 3.5 9.23 3.5 6.55 5.6 4.5 8.25 4.5c1.5 0 2.95.7 3.75 1.82A4.83 4.83 0 0 1 15.75 4.5c2.66 0 4.75 2.05 4.75 4.73 0 3.3-2.96 5.98-7.72 10.27l-.78.7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const CharacterGalleryCard = ({
  routeId,
  name,
  likes,
  messages,
  gradientClassName,
  className = 'mx-auto w-3/4 overflow-hidden rounded-[26px] border border-[#8a4f2b]/80 bg-[#111111] shadow-[0_18px_34px_rgba(0,0,0,0.4)]',
  tagline,
  description,
  previewImageUrl,
  cardThumbnailDesktopUrl,
  cardThumbnailMobileUrl,
  onActionClick,
  moderationStatus,
  showModerationBadge = false,
  suppressPendingModerationBadge = false
}: CharacterGalleryCardProps) => {
  const router = useRouter()
  const actionHref = `${AI_GIRLFRIEND_ROUTE_BASE}/${routeId}`
  const moderationActionLabel =
    showModerationBadge && moderationStatus === 'PENDING' && !suppressPendingModerationBadge
      ? 'Waiting Approval'
      : showModerationBadge && moderationStatus === 'REJECTED'
        ? 'Rejected'
        : showModerationBadge && moderationStatus === 'DRAFT'
          ? 'Draft'
          : null
  const actionLabel = moderationActionLabel ?? 'Chat Now'
  const isStatusOnlyAction = moderationActionLabel !== null
  const tagChipLabel = toTagChipLabel(tagline)
  const descriptionPreview = toDescriptionPreview(description)
  const isCardClickable = !isStatusOnlyAction
  const responsiveImageSrc = cardThumbnailMobileUrl ?? cardThumbnailDesktopUrl ?? previewImageUrl ?? null

  const handleCardClick = () => {
    if (!isCardClickable) {
      return
    }

    router.push(actionHref)
  }

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isCardClickable) {
      return
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    router.push(actionHref)
  }

  return (
    <article
      className={`group transition duration-200 ease-out ${isCardClickable ? 'cursor-pointer hover:-translate-y-1' : ''} ${className}`}
      onClick={isCardClickable ? handleCardClick : undefined}
      onKeyDown={isCardClickable ? handleCardKeyDown : undefined}
      tabIndex={isCardClickable ? 0 : undefined}
      role={isCardClickable ? 'link' : undefined}
      aria-label={isCardClickable ? `${actionLabel} for ${name}` : undefined}
    >
      <div className={`relative aspect-[18/31] w-full ${responsiveImageSrc ? 'bg-black' : `bg-gradient-to-b ${gradientClassName}`}`}>
        {responsiveImageSrc ? (
          <>
            <div className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={responsiveImageSrc}
                width={360}
                height={620}
                alt={`${name} preview`}
                loading="lazy"
                className="h-full w-full object-cover object-center transition duration-300 ease-out group-hover:scale-[1.04] group-focus-within:scale-[1.04]"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
          </>
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.26),transparent_52%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_38%,rgba(255,190,140,0.12)_100%)] opacity-0 transition duration-200 ease-out group-hover:opacity-100 group-focus-within:opacity-100" />

        <div className="absolute right-2 top-2 flex items-center gap-1 sm:right-3 sm:top-3 sm:gap-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-[#b1774b]/70 bg-black/45 px-2 text-[12px] font-semibold text-white sm:h-7 sm:px-2 sm:text-[17px]">
            <span className="text-[#f6b577]">
              <MessageBubbleIcon className="size-4 sm:size-[18px]" />
            </span>
            {messages}
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-full border border-[#b1774b]/70 bg-black/45 px-2 text-[12px] font-semibold text-white sm:h-7 sm:px-2 sm:text-[17px]">
            <span className="text-[#f6b577]">
              <HeartOutlineIcon className="size-4 sm:size-[18px]" />
            </span>
            {likes}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(235,122,49,0)_0%,rgba(235,122,49,0.46)_42%,rgba(235,122,49,0.92)_100%)] px-2.5 pb-3 pt-8 sm:bg-gradient-to-t sm:from-[#f28b45]/95 sm:via-[#f28b45]/60 sm:to-transparent sm:px-4 sm:pb-5 sm:pt-16">
          <div className="flex justify-center">
            <span className="inline-flex max-w-[min(100%,15rem)] min-h-6 items-center justify-center rounded-lg border border-white/25 bg-white/12 px-2 py-1 text-center text-[9px] font-bold uppercase leading-none tracking-[0.08em] text-white/92 sm:min-h-5 sm:px-1.5 sm:py-0.5 sm:text-[9px]">
              {tagChipLabel}
            </span>
          </div>
          <p className="mt-1.5 text-center font-[family-name:var(--font-heading)] text-[17px] font-black leading-[0.96] tracking-[-0.025em] text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)] sm:mt-1.5 sm:text-[20px]">
            {name}
          </p>
          {descriptionPreview ? (
            <p className="mt-1.5 line-clamp-2 text-center text-[12px] leading-4 text-white/84 sm:mt-1.5 sm:line-clamp-2 sm:text-[14px] sm:leading-5">
              {descriptionPreview}
            </p>
          ) : null}
          <div className="mt-2.5 flex justify-center sm:mt-3">
            {isStatusOnlyAction ? (
              <span className="inline-flex h-[34px] min-w-[112px] items-center justify-center rounded-xl border border-black/20 bg-[#201410]/90 px-3 font-[family-name:var(--font-heading)] text-[11px] font-semibold italic uppercase leading-none tracking-[0.03em] text-white/90 sm:h-[32px] sm:min-w-[124px] sm:px-3 sm:text-[12px]">
                {actionLabel}
              </span>
            ) : (
              <Link
                href={actionHref}
                onClick={onActionClick}
                className="relative z-10 inline-flex h-[34px] min-w-[112px] items-center justify-center rounded-xl border border-[#ffd1a5]/20 bg-[linear-gradient(135deg,rgba(47,23,16,0.96),rgba(28,16,12,0.96))] px-3 font-[family-name:var(--font-heading)] text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-white shadow-[0_10px_24px_rgba(20,10,8,0.28)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[#f6b577]/65 hover:bg-[linear-gradient(135deg,rgba(92,40,20,0.98),rgba(48,23,14,0.98))] hover:text-[#fff4e8] hover:shadow-[0_14px_28px_rgba(54,24,12,0.42)] sm:h-[32px] sm:min-w-[124px] sm:px-3 sm:text-[12px]"
                aria-label={`${actionLabel} for ${name}`}
              >
                {actionLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default CharacterGalleryCard
