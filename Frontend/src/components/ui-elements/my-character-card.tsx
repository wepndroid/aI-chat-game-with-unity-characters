import Link from 'next/link'
import ModerationStatusChip, { type CharacterModerationStatus } from '@/components/ui-elements/moderation-status-chip'

type CharacterVisibility = 'public' | 'unlisted' | 'private'
type CharacterNsfwLevel = 'none' | 'mild'

type MyCharacterCardRecord = {
  id: string
  slug: string
  title: string
  summary: string
  moderationStatus: CharacterModerationStatus
  visibility: CharacterVisibility
  nsfwLevel: CharacterNsfwLevel
  updatedAtLabel: string
  views: number
  hearts: number
  rating: number
  pledgeAccess: 'free' | 'patreon'
}

type MyCharacterCardProps = {
  characterRecord: MyCharacterCardRecord
  onSubmitForReview: (characterId: string) => void
}

const MyCharacterCard = ({ characterRecord, onSubmitForReview }: MyCharacterCardProps) => {
  const handleSubmitButtonClick = () => {
    onSubmitForReview(characterRecord.id)
  }

  const showSubmitAction = characterRecord.moderationStatus === 'draft' || characterRecord.moderationStatus === 'rejected'
  const isPendingReview = characterRecord.moderationStatus === 'pending'
  const isApproved = characterRecord.moderationStatus === 'approved'

  return (
    <article className="rounded-xl border border-white/10 bg-[#131112]/95 p-4 shadow-[0_8px_22px_rgba(0,0,0,0.35)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-[family-name:var(--font-heading)] text-[22px] font-normal italic leading-[0.9] text-white">
            {characterRecord.title}
          </h3>
          <p className="mt-1 text-xs text-white/55">Updated {characterRecord.updatedAtLabel}</p>
        </div>
        <ModerationStatusChip status={characterRecord.moderationStatus} />
      </div>

      <p className="mt-4 text-sm leading-6 text-white/80">{characterRecord.summary}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/70">
        <p>Visibility: {characterRecord.visibility}</p>
        <p>NSFW: {characterRecord.nsfwLevel}</p>
        <p>Views: {characterRecord.views.toLocaleString()}</p>
        <p>Hearts: {characterRecord.hearts.toLocaleString()}</p>
        <p>Rating: {characterRecord.rating.toFixed(1)}/5</p>
        <p>Access: {characterRecord.pledgeAccess}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href={`/upload-vrm?edit=${characterRecord.id}`}
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/20 px-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-white transition hover:border-ember-300 hover:text-ember-200"
          aria-label={`Edit ${characterRecord.title}`}
        >
          Edit Metadata
        </Link>

        {showSubmitAction ? (
          <button
            type="button"
            onClick={handleSubmitButtonClick}
            className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-black transition hover:brightness-110"
            aria-label={`Submit ${characterRecord.title} for approval`}
          >
            Submit For Review
          </button>
        ) : null}

        {isPendingReview ? (
          <span className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300/25 bg-amber-200/10 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-100">
            Awaiting Approval
          </span>
        ) : null}

        {isApproved ? (
          <Link
            href={`/characters/${characterRecord.slug}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-emerald-300/35 bg-emerald-200/10 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-100 transition hover:border-emerald-200"
            aria-label={`Open public page for ${characterRecord.title}`}
          >
            Open Public Page
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export default MyCharacterCard
export type { MyCharacterCardRecord, CharacterModerationStatus }
