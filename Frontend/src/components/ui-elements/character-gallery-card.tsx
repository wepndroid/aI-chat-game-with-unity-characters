import Link from 'next/link'
import Image from 'next/image'
import type { MouseEvent } from 'react'

type CharacterGalleryCardProps = {
  routeId: string
  name: string
  likes: string
  chats: string
  gradientClassName: string
  description?: string
  previewImageUrl?: string | null
  isPatreonGated?: boolean
  hasGatedAccess?: boolean
  requiredTierCents?: number | null
  onActionClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  moderationStatus?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED'
  showModerationBadge?: boolean
  /** When true, pending characters do not show the "Waiting Approval" badge (admin Your Characters). */
  suppressPendingModerationBadge?: boolean
}

const formatTierLabel = (tierCents?: number | null) => {
  if (!tierCents || tierCents <= 0) {
    return 'Patreon required'
  }

  return `EUR ${(tierCents / 100).toFixed(2)}+ tier`
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

const ChatBubbleIcon = ({ className = 'size-6' }: { className?: string }) => {
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
  chats,
  gradientClassName,
  description,
  previewImageUrl,
  isPatreonGated = false,
  hasGatedAccess = true,
  requiredTierCents,
  onActionClick,
  moderationStatus,
  showModerationBadge = false,
  suppressPendingModerationBadge = false
}: CharacterGalleryCardProps) => {
  const isLocked = isPatreonGated && !hasGatedAccess
  const actionHref = isLocked ? '/members' : `/characters/${routeId}`
  const moderationActionLabel =
    showModerationBadge && moderationStatus === 'PENDING'
      ? 'Waiting Approval'
      : showModerationBadge && moderationStatus === 'REJECTED'
        ? 'Rejected'
        : showModerationBadge && moderationStatus === 'DRAFT'
          ? 'Draft'
          : null
  const actionLabel = moderationActionLabel ?? (isLocked ? 'Unlock on Patreon' : 'Chat Now')
  const isStatusOnlyAction = moderationActionLabel !== null
  const tagChipLabel = toTagChipLabel(description)

  return (
    <article className="mx-auto w-3/4 overflow-hidden rounded-[26px] border border-[#8a4f2b]/80 bg-[#111111] shadow-[0_18px_34px_rgba(0,0,0,0.4)]">
      <div className={`relative aspect-[5/8.7] w-full ${previewImageUrl ? 'bg-black' : `bg-gradient-to-b ${gradientClassName}`}`}>
        {previewImageUrl ? (
          <>
            <div className="absolute inset-x-0 top-0 h-[89%]">
              <Image
                src={previewImageUrl}
                alt={`${name} preview`}
                fill
                unoptimized
                sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 92vw"
                className="object-contain object-center"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
          </>
        ) : null}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.26),transparent_52%)]" />

        <div className="absolute right-3 top-3 flex items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#b1774b]/70 bg-black/45 px-2 text-[17px] font-semibold text-white">
            <span className="text-[#f6b577]">
              <ChatBubbleIcon className="size-[18px]" />
            </span>
            {chats}
          </span>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#b1774b]/70 bg-black/45 px-2 text-[17px] font-semibold text-white">
            <span className="text-[#f6b577]">
              <HeartOutlineIcon className="size-[18px]" />
            </span>
            {likes}
          </span>
        </div>
        {isPatreonGated ? (
          <div className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/90">
            {isLocked ? `Locked | ${formatTierLabel(requiredTierCents)}` : 'Patreon unlocked'}
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#f28b45]/95 via-[#f28b45]/60 to-transparent px-5 pb-6 pt-20">
          <div className="flex justify-center">
            <span className="inline-flex h-6 items-center rounded-md border border-white/30 bg-white/15 px-2 text-[10px] font-bold uppercase tracking-[0.1em] text-white/95">
              {tagChipLabel}
            </span>
          </div>
          <p className="mt-2 text-center font-[family-name:var(--font-heading)] text-[16px] font-normal italic leading-none tracking-[-0.01em] text-white drop-shadow-[0_3px_8px_rgba(0,0,0,0.5)]">
            {name}
          </p>
          <div className="mt-4 flex justify-center">
            {isStatusOnlyAction ? (
              <span className="inline-flex h-[37px] min-w-[147px] items-center justify-center rounded-xl border border-black/20 bg-[#201410]/90 px-4 font-[family-name:var(--font-heading)] text-[12px] font-semibold italic uppercase leading-none tracking-[0.02em] text-white/90">
                {actionLabel}
              </span>
            ) : (
              <Link
                href={actionHref}
                onClick={onActionClick}
                className="inline-flex h-[37px] min-w-[147px] items-center justify-center rounded-xl border border-black/20 bg-[#201410]/90 px-4 font-[family-name:var(--font-heading)] text-[12px] font-semibold italic uppercase leading-none tracking-[0.02em] text-white transition hover:bg-[#2a1a14]"
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
