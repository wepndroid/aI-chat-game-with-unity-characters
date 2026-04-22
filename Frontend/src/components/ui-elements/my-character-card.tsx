import Image from 'next/image'
import Link from 'next/link'
import ModerationStatusChip, { type CharacterModerationStatus } from '@/components/ui-elements/moderation-status-chip'
import { buildAiGirlfriendRouteHref } from '@/lib/ai-girlfriend-route'

type MyCharacterCardRecord = {
  id: string
  slug: string
  title: string
  summary: string
  moderationStatus: CharacterModerationStatus
  moderationRejectReason?: string | null
  updatedAtLabel: string
  views: number
  hearts: number
  previewImageUrl?: string | null
}

type MyCharacterCardProps = {
  characterRecord: MyCharacterCardRecord
  onSubmitForReview?: (characterId: string) => void
  adminMode?: boolean
}

const MyCharacterCard = ({ characterRecord, onSubmitForReview, adminMode = false }: MyCharacterCardProps) => {
  const handleSubmitButtonClick = () => {
    onSubmitForReview?.(characterRecord.id)
  }

  const showSubmitAction =
    !adminMode &&
    Boolean(onSubmitForReview) &&
    (characterRecord.moderationStatus === 'draft' || characterRecord.moderationStatus === 'rejected')
  const isPendingReview = characterRecord.moderationStatus === 'pending'
  const isApproved = characterRecord.moderationStatus === 'approved'
  const showRejectReason = characterRecord.moderationStatus === 'rejected' && Boolean(characterRecord.moderationRejectReason?.trim())

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(25,18,20,0.98),rgba(16,14,16,0.96))] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <div className="grid gap-0 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="relative aspect-[4/5] border-b border-white/10 bg-[#0d0a0b] md:aspect-auto md:min-h-full md:border-b-0 md:border-r">
          {characterRecord.previewImageUrl ? (
            <>
              <Image
                src={characterRecord.previewImageUrl}
                alt={`${characterRecord.title} thumbnail`}
                fill
                unoptimized
                sizes="(min-width: 1024px) 200px, (min-width: 768px) 200px, 100vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.26),transparent_40%),linear-gradient(180deg,#281816_0%,#120e10_100%)]" />
          )}

          <div className="absolute inset-x-0 bottom-0 p-4">
            <span className="inline-flex rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">
              Updated {characterRecord.updatedAtLabel}
            </span>
          </div>
        </div>

        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-[family-name:var(--font-heading)] text-2xl font-normal italic leading-none text-white">
                  {characterRecord.title}
                </h3>
                <ModerationStatusChip status={characterRecord.moderationStatus} mode={adminMode ? 'admin' : 'default'} />
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/78">{characterRecord.summary}</p>
            </div>

            <div className="grid min-w-[220px] grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Views</p>
                <p className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-normal italic leading-none text-white">
                  {characterRecord.views.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Hearts</p>
                <p className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-normal italic leading-none text-white">
                  {characterRecord.hearts.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {showRejectReason ? (
            <p className="mt-4 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-xs leading-relaxed text-rose-100">
              Rejected: <span className="text-rose-100/90">{characterRecord.moderationRejectReason}</span>
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={`/upload-vrm?edit=${characterRecord.id}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-white/20 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200"
              aria-label={`Edit ${characterRecord.title}`}
            >
              Edit Character
            </Link>

            {!adminMode && showSubmitAction ? (
              <button
                type="button"
                onClick={handleSubmitButtonClick}
                className="inline-flex h-10 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
                aria-label={`Submit ${characterRecord.title} for approval`}
              >
                Submit For Review
              </button>
            ) : null}

            {!adminMode && isPendingReview ? (
              <span className="inline-flex h-10 items-center justify-center rounded-md border border-amber-300/25 bg-amber-200/10 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-100">
                Awaiting Approval
              </span>
            ) : null}

            {!adminMode && isApproved ? (
              <Link
                href={buildAiGirlfriendRouteHref(characterRecord.title, characterRecord.id)}
                className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-300/35 bg-emerald-200/10 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-100 transition hover:border-emerald-200"
                aria-label={`Open public page for ${characterRecord.title}`}
              >
                Open Public Page
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

export default MyCharacterCard
export type { MyCharacterCardRecord, CharacterModerationStatus }
