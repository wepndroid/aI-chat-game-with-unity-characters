'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminReviewQueueCard, { type AdminReviewQueueCardRecord } from '@/components/ui-elements/admin-review-queue-card'
import { useMemo, useState } from 'react'

const initialQueueRecordList: AdminReviewQueueCardRecord[] = [
  {
    id: 'rq-1',
    title: 'Shy Maid Cafe Girl',
    uploader: 'reKengator2',
    uploadedAgoLabel: '2 hours ago',
    scanState: 'clean',
    scanMessage: 'System scans passed'
  },
  {
    id: 'rq-2',
    title: 'Dark Elf Queen',
    uploader: 'FantasyLover',
    uploadedAgoLabel: '5 hours ago',
    scanState: 'flagged',
    scanMessage: 'System flagged 2 potential issues (NSFW Check)'
  },
  {
    id: 'rq-3',
    title: 'NSFW_Test_Do_Not_Approve',
    uploader: 'AnonUser123',
    uploadedAgoLabel: '1 day ago',
    scanState: 'flagged',
    scanMessage: 'System flagged 5 potential issues (NSFW Check)'
  }
]

const ReviewQueuePage = () => {
  const [queueRecordList, setQueueRecordList] = useState<AdminReviewQueueCardRecord[]>(initialQueueRecordList)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialQueueRecordList[0]?.id ?? null)

  const pendingReviewCount = queueRecordList.length

  const selectedQueueRecord = useMemo(() => {
    if (!selectedRecordId) {
      return null
    }

    return queueRecordList.find((queueRecord) => queueRecord.id === selectedRecordId) ?? null
  }, [queueRecordList, selectedRecordId])

  const handleRemoveRecordFromQueue = (recordId: string) => {
    const nextQueueList = queueRecordList.filter((queueRecord) => queueRecord.id !== recordId)
    setQueueRecordList(nextQueueList)

    setSelectedRecordId((previousSelectedId) => {
      if (previousSelectedId !== recordId) {
        return previousSelectedId
      }

      return nextQueueList[0]?.id ?? null
    })
  }

  const handleApproveRecord = (recordId: string) => {
    handleRemoveRecordFromQueue(recordId)
  }

  const handleRejectRecord = (recordId: string) => {
    handleRemoveRecordFromQueue(recordId)
  }

  const handleViewRecordDetails = (recordId: string) => {
    setSelectedRecordId(recordId)
  }

  return (
    <AdminPageShell activeKey="review-queue">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-[29px] font-normal leading-none text-white">Review Queue</h1>
          <p className="mt-1 text-[15px] font-[family-name:var(--font-heading)] font-normal text-[#9ab0cd]">
            Review community uploads to ensure they meet the platform&apos;s guidelines.
          </p>
        </div>

        <div className="inline-flex items-center gap-3 rounded-xl border border-ember-500/35 bg-ember-500/10 px-4 py-3 text-ember-300">
          <span className="font-[family-name:var(--font-heading)] text-[24px] font-normal leading-none">{pendingReviewCount}</span>
          <span className="text-[12px] font-normal uppercase tracking-[0.08em] text-ember-200">Pending Reviews</span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {queueRecordList.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-[#0d1219]/95 px-6 py-16 text-center">
            <p className="text-[18px] font-[family-name:var(--font-heading)] font-normal text-white">Queue is clear</p>
            <p className="mt-1 text-[14px] font-[family-name:var(--font-heading)] font-normal text-[#97a8c4]">No pending community reviews right now.</p>
          </section>
        ) : (
          queueRecordList.map((queueRecord) => (
            <AdminReviewQueueCard
              key={queueRecord.id}
              queueRecord={queueRecord}
              onApprove={handleApproveRecord}
              onReject={handleRejectRecord}
              onViewDetails={handleViewRecordDetails}
            />
          ))
        )}
      </div>

      {selectedQueueRecord ? (
        <section className="mt-4 rounded-2xl border border-white/10 bg-[#0f141d]/95 px-5 py-4">
          <p className="text-[13px] font-normal uppercase tracking-[0.09em] text-[#8da0c0]">Selected Details</p>
          <p className="mt-2 font-[family-name:var(--font-heading)] text-[19px] font-normal leading-none text-white">
            {selectedQueueRecord.title}
          </p>
          <p className="mt-1 text-[14px] font-[family-name:var(--font-heading)] font-normal text-[#9cb0cc]">
            Uploaded by <span className="text-ember-300">{selectedQueueRecord.uploader}</span> - {selectedQueueRecord.uploadedAgoLabel}
          </p>
          <p className="mt-2 text-[16px] text-white/80">{selectedQueueRecord.scanMessage}</p>
        </section>
      ) : null}
    </AdminPageShell>
  )
}

export default ReviewQueuePage
