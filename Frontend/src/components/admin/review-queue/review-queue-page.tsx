'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import AdminReviewQueueCard, { type AdminReviewQueueCardRecord } from '@/components/ui-elements/admin-review-queue-card'
import AdminReviewRejectDialog from '@/components/ui-elements/admin-review-reject-dialog'
import AdminScanReportDialog from '@/components/ui-elements/admin-scan-report-dialog'
import { listAdminReviewQueue, updateCharacterStatus, type AdminReviewQueueRecord } from '@/lib/character-api'
import { ADMIN_OVERVIEW_REFRESH_EVENT } from '@/lib/admin-overview-events'
import { apiGet } from '@/lib/api-client'
import { useCallback, useEffect, useState } from 'react'

const dispatchAdminOverviewRefresh = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ADMIN_OVERVIEW_REFRESH_EVENT))
  }
}

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
  const scanSummary = queueRecord.systemScanSummary
  const hasSystemScan = Boolean(scanSummary)
  const isSystemScanFlagged = scanSummary?.overall === 'flagged'
  const issuesCount = scanSummary?.issuesCount ?? 0
  const systemMessage = scanSummary?.summary?.trim()

  return {
    id: queueRecord.id,
    title: queueRecord.name,
    uploader: queueRecord.owner.username,
    uploadedAgoLabel: formatRelativeTimeLabel(queueRecord.updatedAt),
    scanState: isSystemScanFlagged ? 'flagged' : 'clean',
    scanMessage: hasSystemScan
      ? systemMessage || (isSystemScanFlagged ? `System flagged ${issuesCount} potential issues (NSFW Check)` : 'System scans passed')
      : 'No system scan report yet'
  }
}

const ReviewQueuePage = () => {
  const [queueRecordList, setQueueRecordList] = useState<AdminReviewQueueRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busyRecordId, setBusyRecordId] = useState<string | null>(null)
  const [rejectModalTarget, setRejectModalTarget] = useState<{ id: string; name: string } | null>(null)
  const [isRejectSubmitting, setIsRejectSubmitting] = useState(false)
  const [detailModalTarget, setDetailModalTarget] = useState<{ id: string; name: string } | null>(null)
  const [detailReport, setDetailReport] = useState<null | { overall: 'passed' | 'flagged'; issuesCount: number; summary: string; reportJson: unknown; createdAt: string }>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)

  const loadReviewQueue = useCallback(async (options?: { withSpinner?: boolean }) => {
    const withSpinner = options?.withSpinner ?? true

    if (withSpinner) {
      setIsLoading(true)
    }

    setErrorMessage(null)

    try {
      const payload = await listAdminReviewQueue()
      setQueueRecordList(payload.data)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load review queue.')
      setQueueRecordList([])
    } finally {
      if (withSpinner) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadReviewQueue({ withSpinner: true })
  }, [loadReviewQueue])

  const pendingReviewCount = queueRecordList.length

  const handleApproveRecord = (recordId: string) => {
    Promise.resolve().then(async () => {
      try {
        setBusyRecordId(recordId)
        setErrorMessage(null)
        await updateCharacterStatus(recordId, 'APPROVED')
        await loadReviewQueue({ withSpinner: false })
        dispatchAdminOverviewRefresh()
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to approve character.')
      } finally {
        setBusyRecordId(null)
      }
    })
  }

  const handleRejectRequest = (recordId: string) => {
    const record = queueRecordList.find((queueRecord) => queueRecord.id === recordId)
    setRejectModalTarget({
      id: recordId,
      name: record?.name ?? 'this submission'
    })
  }

  const handleDetailRequest = (recordId: string) => {
    const record = queueRecordList.find((queueRecord) => queueRecord.id === recordId)
    setDetailModalTarget({
      id: recordId,
      name: record?.name ?? 'this submission'
    })
    setDetailReport(null)
    setDetailError(null)

    Promise.resolve().then(async () => {
      setIsDetailLoading(true)
      try {
        const payload = await apiGet<{ data: null | { overall: string; issuesCount: number; summary: string; reportJson: unknown; createdAt: string } }>(
          `/admin/characters/${encodeURIComponent(recordId)}/system-scan-report`
        )

        if (!payload.data) {
          setDetailReport(null)
          return
        }

        const overall = payload.data.overall === 'flagged' ? 'flagged' : 'passed'
        setDetailReport({
          overall,
          issuesCount: payload.data.issuesCount ?? 0,
          summary: payload.data.summary ?? '',
          reportJson: payload.data.reportJson,
          createdAt: payload.data.createdAt
        })
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : 'Failed to load scan report.')
      } finally {
        setIsDetailLoading(false)
      }
    })
  }

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectModalTarget) {
      return
    }

    const recordId = rejectModalTarget.id

    try {
      setIsRejectSubmitting(true)
      setBusyRecordId(recordId)
      setErrorMessage(null)
      await updateCharacterStatus(recordId, 'REJECTED', reason)
      setRejectModalTarget(null)
      await loadReviewQueue({ withSpinner: false })
      dispatchAdminOverviewRefresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to reject character.')
    } finally {
      setIsRejectSubmitting(false)
      setBusyRecordId(null)
    }
  }

  return (
    <AdminPageShell activeKey="review-queue">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[22px] font-normal leading-tight text-white sm:text-[26px] md:text-[29px] md:leading-none">
            Review Queue
          </h1>
          <p className="mt-1 text-[14px] font-[family-name:var(--font-heading)] font-normal leading-snug text-[#9ab0cd] sm:text-[15px]">
            Review community uploads to ensure they meet the platform&apos;s guidelines.
          </p>
        </div>

        <div className="inline-flex w-full min-w-0 flex-wrap items-center justify-center gap-3 rounded-xl border border-ember-500/35 bg-ember-500/10 px-4 py-3.5 text-ember-300 sm:w-auto sm:justify-start sm:gap-[18px] sm:px-5">
          <span className="font-[family-name:var(--font-heading)] text-[32px] font-normal leading-none sm:text-[36px]">{pendingReviewCount}</span>
          <span className="text-center text-[15px] font-normal uppercase tracking-[0.08em] text-ember-200 sm:text-left sm:text-[18px]">
            Pending Reviews
          </span>
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
              previewImageUrl={queueRecord.previewImageUrl}
              onApprove={handleApproveRecord}
              onReject={handleRejectRequest}
              onDetail={handleDetailRequest}
              isBusy={busyRecordId === queueRecord.id}
            />
          ))
        )}
      </div>

      <AdminReviewRejectDialog
        open={rejectModalTarget !== null}
        characterName={rejectModalTarget?.name ?? ''}
        onClose={() => {
          if (!isRejectSubmitting) {
            setRejectModalTarget(null)
          }
        }}
        onConfirm={handleRejectConfirm}
        isSubmitting={isRejectSubmitting}
      />

      <AdminScanReportDialog
        open={detailModalTarget !== null}
        characterName={detailModalTarget?.name ?? ''}
        report={detailReport}
        isLoading={isDetailLoading}
        errorMessage={detailError}
        onClose={() => {
          setDetailModalTarget(null)
          setDetailReport(null)
          setDetailError(null)
          setIsDetailLoading(false)
        }}
      />
    </AdminPageShell>
  )
}

export default ReviewQueuePage
