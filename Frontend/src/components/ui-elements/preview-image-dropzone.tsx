'use client'

import type { ChangeEvent } from 'react'

type PreviewImageDropzoneProps = {
  onFileSelect: (file: File | null) => void
  selectedFileName: string | null
}

const PreviewImageDropzone = ({ onFileSelect, selectedFileName }: PreviewImageDropzoneProps) => {
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    onFileSelect(nextFile)
  }

  return (
    <label className="relative flex h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-white/20 bg-black/25 text-center transition hover:border-ember-300/65">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleInputChange}
        aria-label="Upload preview image"
      />
      <p className="font-[family-name:var(--font-heading)] text-lg font-normal italic text-white">
        {selectedFileName ? selectedFileName : 'Preview image (PNG, JPG, WebP, GIF)'}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Optional if you use URL below</p>
    </label>
  )
}

export default PreviewImageDropzone
