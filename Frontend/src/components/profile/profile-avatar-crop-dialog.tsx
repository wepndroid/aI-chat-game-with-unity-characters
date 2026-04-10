'use client'

import { getCroppedImageBlob } from '@/lib/get-cropped-image-blob'
import { useCallback, useEffect, useId, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

type ProfileAvatarCropDialogProps = {
  imageSrc: string
  onCancel: () => void
  onConfirm: (blob: Blob) => void
  isBusy: boolean
}

const ProfileAvatarCropDialog = ({ imageSrc, onCancel, onConfirm, isBusy }: ProfileAvatarCropDialogProps) => {
  const titleId = useId()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isEncoding, setIsEncoding] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = () => {
    if (!croppedAreaPixels || isBusy || isEncoding) {
      return
    }
    void (async () => {
      setIsEncoding(true)
      try {
        const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
        onConfirm(blob)
      } finally {
        setIsEncoding(false)
      }
    })()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy && !isEncoding) {
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isBusy, isEncoding, onCancel])

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="Close crop dialog"
        disabled={isBusy || isEncoding}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-lg border border-ember-500/45 bg-[#120d0c] p-4 shadow-[0_0_0_1px_rgba(244,99,19,0.12)] md:p-5"
      >
        <h2 id={titleId} className="text-center font-[family-name:var(--font-heading)] text-xl font-normal italic text-white md:text-2xl">
          Adjust photo
        </h2>

        <div className="relative mt-4 h-[min(52vh,320px)] w-full overflow-hidden rounded-md bg-black/40">
          <Cropper
            key={imageSrc}
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            mediaProps={
              imageSrc.startsWith('http://') || imageSrc.startsWith('https://')
                ? { crossOrigin: 'anonymous' as const }
                : {}
            }
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
            <span className="shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              disabled={isBusy || isEncoding}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="h-2 w-full cursor-pointer accent-ember-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 bg-transparent px-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isBusy || isEncoding}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-11 min-w-[160px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isBusy || isEncoding || !croppedAreaPixels}
            onClick={handleConfirm}
          >
            {isBusy ? 'Uploading…' : isEncoding ? 'Preparing…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { ProfileAvatarCropDialog }
