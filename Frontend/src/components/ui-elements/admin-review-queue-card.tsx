type AdminReviewQueueCardRecord = {
  id: string
  title: string
  uploader: string
  uploadedAgoLabel: string
  scanState: 'clean' | 'flagged'
  scanMessage: string
}

type AdminReviewQueueCardProps = {
  queueRecord: AdminReviewQueueCardRecord
  onApprove: (recordId: string) => void
  onReject: (recordId: string) => void
  onViewDetails: (recordId: string) => void
}

const CheckIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.3 12.2 2.4 2.4 5-5.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const RejectIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
    </svg>
  )
}

const DotsIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <circle cx="12" cy="6.5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="17.5" r="1.7" />
    </svg>
  )
}

const ScanBadge = ({ queueRecord }: { queueRecord: AdminReviewQueueCardRecord }) => {
  if (queueRecord.scanState === 'clean') {
    return (
      <span className="inline-flex items-center rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-normal text-emerald-300">
        {queueRecord.scanMessage}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-md border border-rose-500/35 bg-rose-500/15 px-2.5 py-1 text-xs font-normal text-rose-300">
      {queueRecord.scanMessage}
    </span>
  )
}

const AdminReviewQueueCard = ({ queueRecord, onApprove, onReject, onViewDetails }: AdminReviewQueueCardProps) => {
  const handleApproveClick = () => {
    onApprove(queueRecord.id)
  }

  const handleRejectClick = () => {
    onReject(queueRecord.id)
  }

  const handleViewDetailsClick = () => {
    onViewDetails(queueRecord.id)
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0d1219]/95 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="grid min-h-[176px] border-l-4 border-l-yellow-400 px-5 py-5 sm:grid-cols-[130px_1fr_170px] sm:items-center sm:gap-4">
        <div className="inline-flex h-[130px] w-[130px] items-center justify-center rounded-lg border border-white/10 bg-[#1a1f28] text-[14px] font-[family-name:var(--font-heading)] font-normal text-[#31405b]">
          NO PREVIEW
        </div>

        <div className="mt-4 sm:mt-0">
          <div className="inline-flex items-center gap-3">
            <h3 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-none text-white">{queueRecord.title}</h3>
            <span className="inline-flex items-center rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2.5 py-1 text-xs font-normal text-yellow-300">
              Pending
            </span>
          </div>

          <p className="mt-2 text-[15px] font-[family-name:var(--font-heading)] font-normal leading-none text-[#96a5be]">
            Uploaded by <span className="text-ember-300">{queueRecord.uploader}</span> - {queueRecord.uploadedAgoLabel}
          </p>

          <div className="mt-3">
            <ScanBadge queueRecord={queueRecord} />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:mt-0">
          <button
            type="button"
            onClick={handleApproveClick}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 text-sm font-normal text-emerald-300 transition hover:brightness-110"
            aria-label={`Approve ${queueRecord.title}`}
          >
            <CheckIcon />
            Approve
          </button>

          <button
            type="button"
            onClick={handleRejectClick}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/15 text-sm font-normal text-rose-300 transition hover:brightness-110"
            aria-label={`Reject ${queueRecord.title}`}
          >
            <RejectIcon />
            Reject
          </button>

          <button
            type="button"
            onClick={handleViewDetailsClick}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#232833]/90 text-sm font-normal text-[#d0d7e6] transition hover:bg-[#2d3441]"
            aria-label={`View details for ${queueRecord.title}`}
          >
            <DotsIcon />
            Details
          </button>
        </div>
      </div>
    </article>
  )
}

export default AdminReviewQueueCard
export type { AdminReviewQueueCardRecord }
