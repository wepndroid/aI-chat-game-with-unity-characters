'use client'

import { ASSET_PREVIEW_SURFACE_CLASS } from '@/lib/asset-upload-square-class'
import type { ChangeEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

const PreviewUploadIcon = ({ className = 'size-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V3m0 0 4.5 4.5M12 3 7.5 7.5M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5" />
  </svg>
)

const PreviewTrashIcon = ({ className = 'size-5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)

const overlayIconButtonClass =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md border-0 bg-black/70 text-white shadow-md backdrop-blur-sm transition hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400/80'

type PreviewImageDropzoneProps = {
  onFileSelect: (file: File | null) => void
  selectedFileName: string | null
  /** Newly picked file (not yet uploaded) — shown as preview. */
  pendingImageFile?: File | null
  /** Saved preview URL from the server when not replacing yet. */
  existingImageUrl?: string | null
  /** URL from initial load (edit) or empty (new); revert restores this + clears pending file. */
  baselinePreviewImageUrl?: string
  /** Restore original preview (baseline) and clear any newly selected file. */
  onRevertPreview?: () => void
}

const PreviewImageDropzone = ({
  onFileSelect,
  selectedFileName,
  pendingImageFile = null,
  existingImageUrl,
  baselinePreviewImageUrl = '',
  onRevertPreview
}: PreviewImageDropzoneProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingImageFile) {
      setPendingPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(pendingImageFile)
    setPendingPreviewUrl(url)

    return () => {
      URL.revokeObjectURL(url)
    }
  }, [pendingImageFile])

  const displaySrc = pendingPreviewUrl ?? (existingImageUrl?.trim() ? existingImageUrl.trim() : null)
  const hasImage = Boolean(displaySrc)

  const normalizePreviewUrl = (value: string | null | undefined) => (value ?? '').trim()
  const isAtOriginalPreview =
    !pendingImageFile &&
    normalizePreviewUrl(existingImageUrl) === normalizePreviewUrl(baselinePreviewImageUrl)

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  /** Opens the image alone in a new browser tab (full-size URL or blob). */
  const openImageInNewTab = () => {
    if (!displaySrc) {
      return
    }

    const opened = window.open(displaySrc, '_blank', 'noopener,noreferrer')
    if (opened) {
      opened.opener = null
    }
  }

  const handleFileFromInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    onFileSelect(nextFile)
    event.target.value = ''
  }

  const handleTrashClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (isAtOriginalPreview) {
      return
    }
    onRevertPreview?.()
  }

  const handleUploadIconClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    openFilePicker()
  }

  const statusLine = selectedFileName
    ? `New file: ${selectedFileName}`
    : hasImage
      ? pendingImageFile
        ? 'Unsaved preview — submit the form to upload'
        : 'Saved preview — click image to replace'
      : null

  return (
    <div className="w-full">
      {/* In-flow spacer (`pt-[100%]` = width) fixes height when every child is absolute — `aspect-square` alone can collapse to a line. */}
      <div className={ASSET_PREVIEW_SURFACE_CLASS}>
        <div className="pt-[100%]" aria-hidden />
        <div className="absolute inset-0">
          {hasImage ? (
            <div className="group absolute inset-0 z-0">
              {/* Main hit target: replace image (same idea as VRM dropzone). */}
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ember-400/80"
                onClick={openFilePicker}
                aria-label="Replace preview image"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={displaySrc!} alt="" className="pointer-events-none size-full object-cover object-top" />
              </button>
              {/* Hover / focus: full-size view only from this control (not whole-card new tab). */}
              <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                <div className="absolute inset-0 bg-black/50 backdrop-blur-[6px] transition-[background-color,backdrop-filter] duration-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    openImageInNewTab()
                  }}
                  className="pointer-events-auto relative z-[2] rounded-md border border-white/20 bg-black/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ember-200 transition hover:border-ember-300/60 hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember-400/90"
                >
                  Full screen
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={openFilePicker}
              className="absolute inset-0 z-0 flex cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ember-400/80"
              aria-label="Select preview image"
            >
              <p className="font-[family-name:var(--font-heading)] text-lg font-normal italic text-white">Preview image</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">PNG, JPG, WebP, GIF</p>
              <p className="mt-1 text-[10px] text-white/40">Click to browse</p>
            </button>
          )}

          <button
            type="button"
            onClick={handleUploadIconClick}
            className={`${overlayIconButtonClass} absolute right-2 top-2 z-10`}
            aria-label="Upload or replace preview image"
          >
            <PreviewUploadIcon />
          </button>

          {hasImage && onRevertPreview ? (
            <button
              type="button"
              onClick={handleTrashClick}
              disabled={isAtOriginalPreview}
              className={`${overlayIconButtonClass} absolute bottom-2 right-2 z-10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-black/70`}
              aria-label="Revert to original preview image"
            >
              <PreviewTrashIcon />
            </button>
          ) : null}
        </div>
      </div>

      {statusLine ? (
        <p className="mt-2 max-w-[280px] truncate text-[11px] text-white/55" title={statusLine}>
          {statusLine}
        </p>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleFileFromInput}
        aria-label="Upload preview image"
      />
    </div>
  )
}

export default PreviewImageDropzone
