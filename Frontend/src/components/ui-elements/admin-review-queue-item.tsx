/* eslint-disable @next/next/no-img-element */
type AdminReviewQueueItemProps = {
  characterName: string
  creatorName: string
  previewImageUrl?: string | null
  flagCount?: number
}

const AdminReviewQueueItem = ({ characterName, creatorName, previewImageUrl, flagCount }: AdminReviewQueueItemProps) => {
  return (
    <article className="rounded-md border border-white/12 bg-gradient-to-r from-[#181a20]/95 to-[#111214]/95 px-4 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt=""
              className="size-11 shrink-0 rounded-md border border-white/10 object-cover object-top"
            />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#1a1f28] text-[10px] text-[#4a5a72]">
              -
            </div>
          )}
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-heading)] text-[17px] font-normal leading-tight text-white sm:text-[19px] sm:leading-none">
              {characterName}
            </p>
            <p className="mt-1 text-xs text-[#7585a4]">by {creatorName}</p>
          </div>
        </div>

        <div className="inline-flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          {flagCount ? (
            <span className="inline-flex items-center rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-[11px] font-normal text-rose-300">
              {flagCount} Flags
            </span>
          ) : null}

          <span
            className="inline-flex size-6 items-center justify-center rounded-full border border-[#59657f] text-[#8794ad]"
            aria-label={`${characterName} - pending review`}
            title="Pending review"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  )
}

export default AdminReviewQueueItem
