'use client'

import { ASSET_PREVIEW_SQUARE_CLASS } from '@/lib/asset-upload-square-class'
import { lastPathSegmentFromUrl } from '@/lib/url-filename'
import { useRef } from 'react'

type UploadDropzoneProps = {
  onFileSelect: (file: File | null) => void
  selectedFileName: string | null
  /** When set and no new file is chosen, show that a VRM is already stored. */
  existingVrmUrl?: string | null
  /** If true, clicking the zone opens a dialog; file is chosen inside the dialog (edit flow). */
  openPickerInDialog?: boolean
}

const UploadDropzone = ({
  onFileSelect,
  selectedFileName,
  existingVrmUrl,
  openPickerInDialog = false
}: UploadDropzoneProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const dialogInputRef = useRef<HTMLInputElement>(null)

  const handleFileFromInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    onFileSelect(nextFile)
    event.target.value = ''
    dialogRef.current?.close()
  }

  const existingLabel =
    existingVrmUrl && existingVrmUrl.trim().length > 0 ? lastPathSegmentFromUrl(existingVrmUrl) : null
  const showNewFile = Boolean(selectedFileName)
  const showExistingState = Boolean(!showNewFile && existingLabel)

  const zoneInner = (
    <>
      <p className="max-w-full truncate px-2 font-[family-name:var(--font-heading)] text-lg font-normal italic text-white sm:text-xl">
        {showNewFile
          ? selectedFileName
          : showExistingState
            ? 'VRM on file'
            : 'Drop your .VRM file here'}
      </p>
      {showExistingState && !showNewFile ? (
        <p className="mt-1 max-w-full truncate px-2 text-sm font-medium text-ember-200/90" title={existingLabel ?? undefined}>
          {existingLabel}
        </p>
      ) : null}
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">
        {openPickerInDialog
          ? showNewFile
            ? 'New file selected — click to change'
            : showExistingState
              ? 'Click to choose a different VRM'
              : 'Click to select a .VRM file'
          : 'Max file size: 100MB'}
      </p>
    </>
  )

  const zoneClassName = `${ASSET_PREVIEW_SQUARE_CLASS} flex cursor-pointer flex-col items-center justify-center text-center`

  if (openPickerInDialog) {
    return (
      <>
        <button type="button" className={zoneClassName} onClick={() => dialogRef.current?.showModal()} aria-label="Choose VRM file">
          {zoneInner}
        </button>
        <dialog
          ref={dialogRef}
          className="w-[min(92vw,420px)] rounded-lg border border-white/15 bg-[#141010] p-6 text-white shadow-xl [&::backdrop]:bg-black/70"
          onClose={() => {
            dialogInputRef.current && (dialogInputRef.current.value = '')
          }}
        >
          <p className="font-[family-name:var(--font-heading)] text-xl font-normal italic text-white">Select VRM file</p>
          <p className="mt-2 text-xs text-white/60">Choose a new .vrm file to replace the current one, or cancel to keep it.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex h-10 min-w-[140px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
              onClick={() => dialogInputRef.current?.click()}
            >
              Browse files
            </button>
            <button
              type="button"
              className="inline-flex h-10 min-w-[100px] items-center justify-center rounded-md border border-white/25 bg-transparent px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-white/85 transition hover:border-white/40 hover:bg-white/5"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </button>
          </div>
          <input
            ref={dialogInputRef}
            type="file"
            accept=".vrm,model/vrm"
            className="sr-only"
            onChange={handleFileFromInput}
            aria-label="Upload VRM file"
          />
        </dialog>
      </>
    )
  }

  return (
    <label className={zoneClassName}>
      <input type="file" accept=".vrm,model/vrm" className="sr-only" onChange={handleFileFromInput} aria-label="Upload VRM file" />
      {zoneInner}
    </label>
  )
}

export default UploadDropzone
