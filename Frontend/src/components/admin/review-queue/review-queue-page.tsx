'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminReviewQueueCard, { type AdminReviewQueueCardRecord } from '@/components/ui-elements/admin-review-queue-card'
import { descriptionHasModeratorKeywordHint } from '@/lib/admin-review-description'
import { listAdminReviewQueue, updateCharacterStatus, type AdminReviewQueueRecord } from '@/lib/character-api'
import { useEffect, useMemo, useState } from 'react'

const formatRelativeTimeLabel = (isoValue: string) => {
  const targetMs = Date.parse(isoValue)

  if (Number.isNaN(targetMs)) {
    return 'unknown'
  }

  const diffMs = Date.now() - targetMs
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes} minutes ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours} hours ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} days ago`
}

const toQueueCardRecord = (queueRecord: AdminReviewQueueRecord): AdminReviewQueueCardRecord => {
  const looksFlagged = descriptionHasModeratorKeywordHint(queueRecord.description)

  return {
    id: queueRecord.id,
    title: queueRecord.name,
    uploader: queueRecord.owner.username,
    uploadedAgoLabel: formatRelativeTimeLabel(queueRecord.updatedAt),
    scanState: looksFlagged ? 'flagged' : 'clean',
    scanMessage: looksFlagged
      ? 'Description matches common NSFW-related keywords—review manually'
      : 'No keyword match for common NSFW terms—still review manually'
  }
}

const ReviewQueuePage = () => {
  const [queueRecordList, setQueueRecordList] = useState<AdminReviewQueueRecord[]>([])
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        const payload = await listAdminReviewQueue()

        if (isCancelled) {
          return
        }

        setQueueRecordList(payload.data)
        setSelectedRecordId(payload.data[0]?.id ?? null)
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load review queue.')
          setQueueRecordList([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

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
    Promise.resolve().then(async () => {
      try {
        setBusyRecordId(recordId)
        await updateCharacterStatus(recordId, 'APPROVED')
        handleRemoveRecordFromQueue(recordId)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to approve character.')
      } finally {
        setBusyRecordId(null)
      }
    })
  }

  const handleRejectRecord = (recordId: string) => {
    Promise.resolve().then(async () => {
      try {
        setBusyRecordId(recordId)
        await updateCharacterStatus(recordId, 'REJECTED')
        handleRemoveRecordFromQueue(recordId)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to reject character.')
      } finally {
        setBusyRecordId(null)
      }
    })
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
        {isLoading ? (
          <section className="rounded-2xl border border-white/10 bg-[#0d1219]/95 px-6 py-16 text-center">
            <p className="text-[18px] font-[family-name:var(--font-heading)] font-normal text-white">Loading review queue...</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{errorMessage}</section>
        ) : null}

        {!isLoading && queueRecordList.length === 0 ? (
          <section className="rounded-2xl border border-white/10 bg-[#0d1219]/95 px-6 py-16 text-center">
            <p className="text-[18px] font-[family-name:var(--font-heading)] font-normal text-white">Queue is clear</p>
            <p className="mt-1 text-[14px] font-[family-name:var(--font-heading)] font-normal text-[#97a8c4]">No pending community reviews right now.</p>
          </section>
        ) : (
          queueRecordList.map((queueRecord) => (
            <AdminReviewQueueCard
              key={queueRecord.id}
              queueRecord={toQueueCardRecord(queueRecord)}
              characterSlug={queueRecord.slug}
              characterId={queueRecord.id}
              previewImageUrl={queueRecord.previewImageUrl}
              onApprove={handleApproveRecord}
              onReject={handleRejectRecord}
              onSelect={setSelectedRecordId}
              isBusy={busyRecordId === queueRecord.id}
            />
          ))
        )}
      </div>

      {selectedQueueRecord ? (
        <section className="mt-4 rounded-2xl border border-white/10 bg-[#0f141d]/95 px-5 py-4">
          <p className="text-[13px] font-normal uppercase tracking-[0.09em] text-[#8da0c0]">Selected Details</p>
          <p className="mt-2 font-[family-name:var(--font-heading)] text-[19px] font-normal leading-none text-white">
            {selectedQueueRecord.name}
          </p>
          <p className="mt-1 text-[14px] font-[family-name:var(--font-heading)] font-normal text-[#9cb0cc]">
            Uploaded by <span className="text-ember-300">{selectedQueueRecord.owner.username}</span> - {formatRelativeTimeLabel(selectedQueueRecord.updatedAt)}
          </p>
          <p className="mt-2 text-[16px] text-white/80">{selectedQueueRecord.description || 'No submission description provided.'}</p>
        </section>
      ) : null}
    </AdminPageShell>
  )
}

export default ReviewQueuePage
