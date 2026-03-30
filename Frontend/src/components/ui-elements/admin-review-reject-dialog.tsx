'use client'

import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'

/** Matches `AdminModalDialog` danger primary + panel; textarea matches admin search/input focus treatment. */
const dangerConfirmClassName =
  'rounded-lg border border-rose-500/45 bg-rose-500/15 px-4 py-2 text-sm font-normal text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-rose-500/15'

const cancelButtonClassName =
  'rounded-lg border border-white/15 bg-transparent px-4 py-2 text-sm font-normal text-[#c5d0e4] transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'

type AdminReviewRejectDialogProps = {
  open: boolean
  characterName: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
  isSubmitting: boolean
}

const AdminReviewRejectDialog = ({
  open,
  characterName,
  onClose,
  onConfirm,
  isSubmitting
}: AdminReviewRejectDialogProps) => {
  const titleId = useId()
  const descriptionId = useId()
  const reasonLabelId = useId()
  const [reason, setReason] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setLocalError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose, isSubmitting])

  if (!open || typeof document === 'undefined') {
    return null
  }

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (trimmed.length < 3) {
      setLocalError('Please enter a reason (at least 3 characters).')
      return
    }

    setLocalError(null)
    await onConfirm(trimmed)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!isSubmitting && event.target === event.currentTarget) {
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
        className="relative z-10 w-full max-w-md rounded-2xl border border-ember-800/55 bg-[#0f141c] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.55)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-heading)] text-xl font-normal leading-tight text-white">
          Reject submission
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-[#a8b6d0]">
          Explain why <span className="text-ember-300">{characterName}</span> is being rejected. This is saved on the
          character record for moderation history.
        </p>

        <div className="mt-4">
          <label
            htmlFor={reasonLabelId}
            className="text-[13px] font-normal uppercase tracking-[0.09em] text-[#8da0c0]"
          >
            Rejection reason
          </label>
          <textarea
            id={reasonLabelId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (localError) {
                setLocalError(null)
              }
            }}
            rows={4}
            disabled={isSubmitting}
            placeholder="e.g. Does not meet community guidelines for…"
            className="mt-2 w-full resize-y rounded-md border border-white/20 bg-[#0f1116]/90 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-white/50 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/35 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {localError ? (
            <p className="mt-2 text-sm leading-6 text-rose-200/95">{localError}</p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={cancelButtonClassName} onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" className={dangerConfirmClassName} onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Rejecting…' : 'Reject submission'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AdminReviewRejectDialog
