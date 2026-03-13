type AdminReviewQueueItemProps = {
  characterName: string
  creatorName: string
  flagCount?: number
}

const AdminReviewQueueItem = ({ characterName, creatorName, flagCount }: AdminReviewQueueItemProps) => {
  return (
    <article className="rounded-md border border-white/12 bg-gradient-to-r from-[#181a20]/95 to-[#111214]/95 px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-heading)] text-[19px] font-normal leading-none text-white">{characterName}</p>
          <p className="mt-1 text-xs text-[#7585a4]">by {creatorName}</p>
        </div>

        <div className="inline-flex items-center gap-3">
          {flagCount ? (
            <span className="inline-flex items-center rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-[11px] font-normal text-rose-300">
              {flagCount} Flags
            </span>
          ) : null}

          <span className="inline-flex size-6 items-center justify-center rounded-full border border-[#59657f] text-[#8794ad]" aria-label={`${characterName} review check`}>
            <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4.5 10.3L8.1 14l7.3-7.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </article>
  )
}

export default AdminReviewQueueItem
