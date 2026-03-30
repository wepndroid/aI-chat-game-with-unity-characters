 'use client'
 
import { useEffect, useId, useMemo, useState } from 'react'
 import { createPortal } from 'react-dom'
 
 type ScanOverall = 'passed' | 'flagged'

type ParsedIssue = {
  name: string
  detail: string
  status: string
}
 
 type AdminScanReportDialogProps = {
   open: boolean
   characterName: string
   report:
     | null
     | {
         overall: ScanOverall
         issuesCount: number
         summary: string
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         reportJson: any
         createdAt: string
       }
   isLoading: boolean
   errorMessage: string | null
   onClose: () => void
 }
 
 const closeButtonClassName =
   'rounded-lg border border-white/15 bg-transparent px-4 py-2 text-sm font-normal text-[#c5d0e4] transition hover:bg-white/5 hover:text-white'
const iconButtonClassName =
  'inline-flex size-9 items-center justify-center rounded-md border border-white/20 bg-white/5 text-white/80 transition hover:border-white/35 hover:bg-white/10 hover:text-white'

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="9" y="9" width="10" height="10" rx="2" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
  </svg>
)

const parseIssuesFromReportJson = (reportJson: unknown): ParsedIssue[] => {
  if (!reportJson || typeof reportJson !== 'object') {
    return []
  }

  const checks = (reportJson as { checks?: unknown }).checks
  if (!Array.isArray(checks)) {
    return []
  }

  return checks
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const row = entry as { name?: unknown; detail?: unknown; status?: unknown; message?: unknown }
      const name = typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : 'Issue'
      const status = typeof row.status === 'string' && row.status.trim().length > 0 ? row.status.trim() : 'UNKNOWN'
      const detailSource = typeof row.detail === 'string' ? row.detail : typeof row.message === 'string' ? row.message : ''
      const detail = detailSource.trim()
      const normalizedStatus = status.toLowerCase()
      const isIssueStatus =
        normalizedStatus.includes('not_ok') ||
        normalizedStatus.includes('fail') ||
        normalizedStatus.includes('error') ||
        normalizedStatus.includes('flag') ||
        normalizedStatus.includes('warn') ||
        normalizedStatus.includes('issue')

      if (detail.length === 0 || !isIssueStatus) {
        return null
      }

      return { name, status, detail }
    })
    .filter((row): row is ParsedIssue => Boolean(row))
}
 
 const AdminScanReportDialog = ({ open, characterName, report, isLoading, errorMessage, onClose }: AdminScanReportDialogProps) => {
   const titleId = useId()
   const descriptionId = useId()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copyPayloadText = useMemo(() => {
    if (!report) {
      return ''
    }

    return [
      `Character: ${characterName}`,
      `Overall: ${report.overall}`,
      `Issues: ${report.issuesCount}`,
      `Summary: ${report.summary}`,
      `CreatedAt: ${report.createdAt}`,
      'DetailedReport:',
      JSON.stringify(report.reportJson, null, 2)
    ].join('\n')
  }, [characterName, report])

  const parsedIssueList = useMemo(() => parseIssuesFromReportJson(report?.reportJson ?? null), [report])
 
   useEffect(() => {
     if (!open) {
       return
     }
 
     const previousOverflow = document.body.style.overflow
     document.body.style.overflow = 'hidden'
 
     const handleKeyDown = (event: KeyboardEvent) => {
       if (event.key === 'Escape') {
         onClose()
       }
     }
 
     document.addEventListener('keydown', handleKeyDown)
     return () => {
       document.body.style.overflow = previousOverflow
       document.removeEventListener('keydown', handleKeyDown)
     }
   }, [open, onClose])

  useEffect(() => {
    if (open) {
      setCopyState('idle')
    }
  }, [open])
 
   if (!open || typeof document === 'undefined') {
     return null
   }
 
   const overallLabel = report?.overall === 'passed' ? 'OK' : report?.overall === 'flagged' ? 'Flagged' : 'No report'
   const overallToneClass =
     report?.overall === 'passed'
       ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
       : report?.overall === 'flagged'
         ? 'border-rose-400/35 bg-rose-400/10 text-rose-200'
         : 'border-white/15 bg-white/5 text-white/75'
 
  const handleCopy = async () => {
    if (!copyPayloadText || !navigator?.clipboard) {
      setCopyState('failed')
      return
    }

    try {
      await navigator.clipboard.writeText(copyPayloadText)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

   return createPortal(
     <div
       className="fixed inset-0 z-[210] flex items-center justify-center p-4"
       role="presentation"
       onMouseDown={(event) => {
         if (event.target === event.currentTarget) {
           onClose()
         }
       }}
     >
       <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
       <div
         role="dialog"
         aria-modal="true"
         aria-labelledby={titleId}
         aria-describedby={descriptionId}
         className="relative z-10 w-full max-w-2xl rounded-2xl border border-ember-800/55 bg-[#0f141c] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
         onMouseDown={(event) => event.stopPropagation()}
       >
         <div className="flex flex-wrap items-start justify-between gap-3">
           <div>
             <h2 id={titleId} className="font-[family-name:var(--font-heading)] text-xl font-normal leading-tight text-white">
               System scan report
             </h2>
             <p id={descriptionId} className="mt-2 text-sm leading-6 text-[#a8b6d0]">
               Detailed automated checks for <span className="text-ember-300">{characterName}</span>.
             </p>
           </div>
          <div className="flex items-center gap-2">
            {report?.overall === 'flagged' ? (
              <button
                type="button"
                onClick={() => void handleCopy()}
                className={iconButtonClassName}
                aria-label="Copy full scan report"
                disabled={!report || isLoading || Boolean(errorMessage)}
                title={copyState === 'copied' ? 'Copied' : 'Copy report'}
              >
                <CopyIcon />
              </button>
            ) : null}
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${overallToneClass}`}>
              {overallLabel}
            </span>
          </div>
         </div>
 
         <div className="mt-5">
           {isLoading ? <p className="text-sm text-white/70">Loading report…</p> : null}
           {errorMessage ? (
             <p className="rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
           ) : null}
 
           {!isLoading && !errorMessage && !report ? (
             <p className="text-sm text-white/70">No scan report is available for this character yet.</p>
           ) : null}
 
           {!isLoading && !errorMessage && report ? (
             <div className="space-y-3">
              {copyState === 'copied' ? <p className="text-xs text-emerald-200">Report copied. Paste it into rejection reason.</p> : null}
              {copyState === 'failed' ? (
                <p className="text-xs text-rose-200">Copy failed. Please select and copy the report manually.</p>
              ) : null}
               <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
                 <p className="text-sm text-white/85">{report.summary}</p>
                 <p className="mt-1 text-xs text-white/55">
                   Issues: <span className="text-white/75">{report.issuesCount}</span> · Recorded {new Date(report.createdAt).toLocaleString()}
                 </p>
               </div>
 
              {report.overall === 'flagged' ? (
                <>
                  {parsedIssueList.length > 0 ? (
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14]/70 p-4">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/60">Detected issues</p>
                      <div className="mt-3 space-y-2">
                        {parsedIssueList.map((issue, index) => (
                          <div key={`${issue.name}-${index}`} className="rounded-md border border-rose-400/25 bg-rose-400/10 px-3 py-2">
                            <p className="text-sm text-rose-100">
                              <span className="font-semibold">{issue.name}</span> <span className="text-rose-100/80">({issue.status})</span>
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-rose-100/90">{issue.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-white/10 bg-[#0b0f14]/70 p-4">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/60">Raw report</p>
                      <pre className="mt-3 max-h-[320px] overflow-auto rounded-md border border-white/10 bg-black/30 p-3 text-[12px] leading-relaxed text-white/80">
{JSON.stringify(report.reportJson, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              ) : null}
             </div>
           ) : null}
         </div>
 
         <div className="mt-6 flex justify-end">
           <button type="button" className={closeButtonClassName} onClick={onClose}>
             Close
           </button>
         </div>
       </div>
     </div>,
     document.body
   )
 }
 
 export default AdminScanReportDialog
 export type { ScanOverall }
 
