/* eslint-disable @next/next/no-img-element */

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
  previewImageUrl?: string | null
  onApprove: (recordId: string) => void
  onReject: (recordId: string) => void
  onDetail?: (recordId: string) => void
  isBusy?: boolean
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

const DetailIcon = () => {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 12h6M9 16h6M9 8h6" strokeLinecap="round" />
      <path d="M7 3.5h10A2.5 2.5 0 0 1 19.5 6v12A2.5 2.5 0 0 1 17 20.5H7A2.5 2.5 0 0 1 4.5 18V6A2.5 2.5 0 0 1 7 3.5Z" />
    </svg>
  )
}

const ScanOkIcon = () => (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="m8.5 12.1 2.1 2.2 4.9-4.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ScanWarningIcon = () => (
  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 4.2 20 18a1 1 0 0 1-.86 1.5H4.86A1 1 0 0 1 4 18l8-13.8z" />
    <path d="M12 9v5.2M12 17h.01" strokeLinecap="round" />
  </svg>
)

const ScanBadge = ({ queueRecord }: { queueRecord: AdminReviewQueueCardRecord }) => {
  if (queueRecord.scanState === 'clean') {
    return (
      <span className="inline-flex max-w-full items-start gap-1.5 break-words rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-xs font-normal text-emerald-300">
        <span className="mt-0.5 shrink-0">
          <ScanOkIcon />
        </span>
        <span className="min-w-0">{queueRecord.scanMessage}</span>
      </span>
    )
  }

  return (
    <span className="inline-flex max-w-full items-start gap-1.5 break-words rounded-md border border-rose-500/35 bg-rose-500/15 px-2.5 py-1 text-xs font-normal text-rose-300">
      <span className="mt-0.5 shrink-0">
        <ScanWarningIcon />
      </span>
      <span className="min-w-0">{queueRecord.scanMessage}</span>
    </span>
  )
}

const AdminReviewQueueCard = ({
  queueRecord,
  previewImageUrl,
  onApprove,
  onReject,
  onDetail,
  isBusy = false
}: AdminReviewQueueCardProps) => {
  const handleApproveClick = () => {
    onApprove(queueRecord.id)
  }

  const handleRejectClick = () => {
    onReject(queueRecord.id)
  }

  const handleDetailClick = () => {
    onDetail?.(queueRecord.id)
  }

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0d1219]/95 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <div className="grid min-h-0 border-l-4 border-l-yellow-400 px-4 py-4 sm:min-h-[176px] sm:grid-cols-[130px_1fr_170px] sm:items-center sm:gap-4 sm:px-5 sm:py-5">
        <div className="relative mx-auto h-[130px] w-full max-w-[130px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-[#1a1f28] sm:mx-0">
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt=""
              className="size-full object-cover object-top"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-center text-[12px] font-[family-name:var(--font-heading)] font-normal text-[#31405b]">
              No preview
            </div>
          )}
        </div>

        <div className="mt-4 min-w-0 sm:mt-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words font-[family-name:var(--font-heading)] text-[19px] font-normal leading-tight text-white sm:text-[22px] sm:leading-none">
              {queueRecord.title}
            </h3>
            <span className="inline-flex shrink-0 items-center rounded-full border border-yellow-400/35 bg-yellow-400/10 px-2.5 py-1 text-xs font-normal text-yellow-300">
              Pending
            </span>
          </div>

          <p className="mt-2 text-[14px] font-[family-name:var(--font-heading)] font-normal leading-snug text-[#96a5be] sm:text-[15px] sm:leading-none">
            Uploaded by <span className="text-ember-300">{queueRecord.uploader}</span> - {queueRecord.uploadedAgoLabel}
          </p>

          <div className="mt-3">
            <ScanBadge queueRecord={queueRecord} />
          </div>
        </div>

        <div className="mt-4 flex w-full min-w-0 flex-col gap-2 sm:mt-0 sm:w-[170px] sm:shrink-0">
          <button
            type="button"
            onClick={handleApproveClick}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/15 text-sm font-normal text-emerald-300 transition hover:brightness-110"
            aria-label={`Approve ${queueRecord.title}`}
            disabled={isBusy}
          >
            <CheckIcon />
            Approve
          </button>

          <button
            type="button"
            onClick={handleRejectClick}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/15 text-sm font-normal text-rose-300 transition hover:brightness-110"
            aria-label={`Reject ${queueRecord.title}`}
            disabled={isBusy}
          >
            <RejectIcon />
            Reject
          </button>

          <button
            type="button"
            onClick={handleDetailClick}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/20 bg-white/5 text-sm font-normal text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            aria-label={`View system scan details for ${queueRecord.title}`}
            disabled={isBusy || !onDetail}
          >
            <DetailIcon />
            Detail
          </button>
        </div>
      </div>
    </article>
  )
}

export default AdminReviewQueueCard
export type { AdminReviewQueueCardRecord }
