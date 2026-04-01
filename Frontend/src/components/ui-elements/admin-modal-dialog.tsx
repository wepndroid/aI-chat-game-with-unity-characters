'use client'

import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'

type AdminModalDialogProps = {
  open: boolean
  title: string
  message: string
  /** Called when closing (backdrop, Escape, Cancel, or after primary in confirm mode). */
  onClose: () => void
  /** If set, shows a primary action; otherwise a single OK button is shown. */
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
  /** Primary button style when `onConfirm` is set. */
  confirmVariant?: 'danger' | 'ember'
}

const AdminModalDialog = ({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  confirmVariant = 'ember'
}: AdminModalDialogProps) => {
  const titleId = useId()
  const descriptionId = useId()
  const isConfirm = Boolean(onConfirm)

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

  if (!open || typeof document === 'undefined') {
    return null
  }

  const handlePrimaryClick = () => {
    onConfirm?.()
    onClose()
  }

  const confirmClassName =
    confirmVariant === 'danger'
      ? 'rounded-lg border border-rose-500/45 bg-rose-500/15 px-4 py-2 text-sm font-normal text-rose-200 transition hover:bg-rose-500/25'
      : 'rounded-lg border border-ember-400/45 bg-gradient-to-r from-ember-400/90 to-ember-500/90 px-4 py-2 text-sm font-normal text-[#1b130f] transition hover:brightness-110'

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain p-4 py-8 sm:items-center sm:py-10"
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
        className="relative z-10 my-auto w-full max-w-md max-h-[min(90dvh,720px)] overflow-y-auto rounded-2xl border border-ember-800/55 bg-[#0f141c] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.55)] sm:p-6"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-heading)] text-xl font-normal leading-tight text-white">
          {title}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-[#a8b6d0]">
          {message}
        </p>
        <div
          className={`mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${isConfirm ? '' : ''}`}
        >
          {isConfirm ? (
            <>
              <button
                type="button"
                className="w-full rounded-lg border border-white/15 bg-transparent px-4 py-2.5 text-sm font-normal text-[#c5d0e4] transition hover:bg-white/5 hover:text-white sm:w-auto"
                onClick={onClose}
              >
                {cancelLabel}
              </button>
              <button type="button" className={`${confirmClassName} w-full sm:w-auto`} onClick={handlePrimaryClick}>
                {confirmLabel}
              </button>
            </>
          ) : (
            <button type="button" className={`${confirmClassName} w-full sm:w-auto`} onClick={onClose}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default AdminModalDialog
