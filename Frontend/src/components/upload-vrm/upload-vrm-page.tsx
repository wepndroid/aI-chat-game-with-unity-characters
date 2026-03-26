'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import { useAuth } from '@/components/providers/auth-provider'
import PreviewImageDropzone from '@/components/ui-elements/preview-image-dropzone'
import UploadDropzone from '@/components/ui-elements/upload-dropzone'
import UploadField from '@/components/ui-elements/upload-field'
import { createCharacter, getCharacterDetail, updateCharacter, uploadCharacterAssets } from '@/lib/character-api'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type UploadVrmFormState = {
  fullName: string
  tagLine: string
  vroidFileUrl: string
  previewImageUrl: string
  screenshotUrlsRawText: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  legacyFileHash: string
  legacyTier: string
  legacyHeywaifu: boolean
  isPublic: boolean
  officialCurated: boolean
}

const initialFormState: UploadVrmFormState = {
  fullName: '',
  tagLine: '',
  vroidFileUrl: '',
  previewImageUrl: '',
  screenshotUrlsRawText: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  exampleDialogue: '',
  legacyFileHash: '',
  legacyTier: '',
  legacyHeywaifu: false,
  isPublic: false,
  officialCurated: false
}

const UploadVrmPage = () => {
  const { sessionUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const editCharacterId = searchParams.get('edit')?.trim() ?? ''
  const isEditing = editCharacterId.length > 0
  const [formState, setFormState] = useState<UploadVrmFormState>(initialFormState)
  const [vrmFile, setVrmFile] = useState<File | null>(null)
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null)
  const [selectedVrmFileName, setSelectedVrmFileName] = useState<string | null>(null)
  const [selectedPreviewFileName, setSelectedPreviewFileName] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditLoading, setIsEditLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleFieldChange = <T extends keyof UploadVrmFormState>(key: T, value: UploadVrmFormState[T]) => {
    setFormState((previousState) => ({
      ...previousState,
      [key]: value
    }))
  }

  const pageHeadingLabel = useMemo(() => (isEditing ? 'Edit VRM Character' : 'Upload VRM'), [isEditing])

  useEffect(() => {
    if (!isEditing) {
      setFormState(initialFormState)
      setVrmFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      setSelectedPreviewFileName(null)
      setErrorMessage(null)
      setStatusMessage(null)
      setIsEditLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsEditLoading(true)
      setErrorMessage(null)
      setStatusMessage(null)

      try {
        const payload = await getCharacterDetail(editCharacterId)

        if (isCancelled) {
          return
        }

        setVrmFile(null)
        setPreviewImageFile(null)
        setSelectedVrmFileName(null)
        setSelectedPreviewFileName(null)

        setFormState({
          fullName: payload.data.name ?? '',
          tagLine: payload.data.tagline ?? '',
          vroidFileUrl: payload.data.vroidFileUrl ?? '',
          previewImageUrl: payload.data.previewImageUrl ?? '',
          screenshotUrlsRawText: payload.data.screenshots.map((screenshot) => screenshot.imageUrl).join('\n'),
          description: payload.data.description ?? '',
          personality: payload.data.personality ?? '',
          scenario: payload.data.scenario ?? '',
          firstMessage: payload.data.firstMessage ?? '',
          exampleDialogue: payload.data.exampleDialogs ?? '',
          legacyFileHash: payload.data.legacyFileHash ?? '',
          legacyTier: payload.data.legacyTier !== null ? String(payload.data.legacyTier) : '',
          legacyHeywaifu: payload.data.legacyHeyWaifu === 1,
          isPublic: payload.data.visibility === 'PUBLIC',
          officialCurated: payload.data.officialListing
        })
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load character for editing.')
        }
      } finally {
        if (!isCancelled) {
          setIsEditLoading(false)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [editCharacterId, isEditing])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    const normalizedName = formState.fullName.trim()

    if (normalizedName.length < 2) {
      setErrorMessage('Please enter a valid character name.')
      setStatusMessage(null)
      return
    }

    const normalizedTierInput = formState.legacyTier.trim()
    const parsedLegacyTier =
      normalizedTierInput.length > 0 ? Number.parseInt(normalizedTierInput, 10) : undefined

    if (
      normalizedTierInput.length > 0 &&
      (typeof parsedLegacyTier !== 'number' || Number.isNaN(parsedLegacyTier) || parsedLegacyTier < 0 || parsedLegacyTier > 9)
    ) {
      setErrorMessage('Legacy Tier must be a number between 0 and 9.')
      setStatusMessage(null)
      return
    }

    const isPatreonGated = typeof parsedLegacyTier === 'number' ? parsedLegacyTier > 0 : false
    const minimumTierCents =
      parsedLegacyTier === 2 ? 1650 : parsedLegacyTier === 1 ? 900 : undefined
    const screenshotUrls = formState.screenshotUrlsRawText
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    setIsSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)

    const adminOfficialPayload =
      sessionUser?.role === 'ADMIN' ? { officialListing: formState.officialCurated } : {}

    try {
      let vroidUrl = formState.vroidFileUrl.trim()
      let previewUrl = formState.previewImageUrl.trim()

      if (vrmFile || previewImageFile) {
        const formData = new FormData()

        if (vrmFile) {
          formData.append('vrm', vrmFile)
        }

        if (previewImageFile) {
          formData.append('preview', previewImageFile)
        }

        const uploadPayload = await uploadCharacterAssets(formData)

        if (uploadPayload.data.vroidFileUrl) {
          vroidUrl = uploadPayload.data.vroidFileUrl
        }

        if (uploadPayload.data.previewImageUrl) {
          previewUrl = uploadPayload.data.previewImageUrl
        }
      }

      if (isEditing) {
        await updateCharacter(editCharacterId, {
          name: normalizedName,
          fullName: normalizedName,
          tagline: formState.tagLine.trim() || null,
          description: formState.description.trim() || null,
          personality: formState.personality.trim() || null,
          scenario: formState.scenario.trim() || null,
          firstMessage: formState.firstMessage.trim() || null,
          exampleDialogs: formState.exampleDialogue.trim() || null,
          vroidFileUrl: vroidUrl || null,
          previewImageUrl: previewUrl || null,
          screenshotUrls,
          legacyFileHash: formState.legacyFileHash.trim() || null,
          legacyTier: normalizedTierInput.length > 0 ? parsedLegacyTier ?? null : null,
          legacyHeyWaifu: formState.legacyHeywaifu ? 1 : 0,
          isPatreonGated,
          minimumTierCents: isPatreonGated ? minimumTierCents ?? null : null,
          visibility: formState.isPublic ? 'PUBLIC' : 'PRIVATE',
          ...adminOfficialPayload
        })
      } else {
        await createCharacter({
          name: normalizedName,
          fullName: normalizedName,
          tagline: formState.tagLine.trim() || undefined,
          description: formState.description.trim() || undefined,
          personality: formState.personality.trim() || undefined,
          scenario: formState.scenario.trim() || undefined,
          firstMessage: formState.firstMessage.trim() || undefined,
          exampleDialogs: formState.exampleDialogue.trim() || undefined,
          vroidFileUrl: vroidUrl || undefined,
          previewImageUrl: previewUrl || undefined,
          screenshotUrls: screenshotUrls.length > 0 ? screenshotUrls : undefined,
          legacyFileHash: formState.legacyFileHash.trim() || undefined,
          legacyTier: parsedLegacyTier,
          legacyHeyWaifu: formState.legacyHeywaifu ? 1 : 0,
          isPatreonGated,
          minimumTierCents,
          visibility: formState.isPublic ? 'PUBLIC' : 'PRIVATE',
          ...adminOfficialPayload
        })
      }

      setStatusMessage(
        isEditing
          ? 'Character updated successfully. If it was public, it may require re-approval before republishing.'
          : 'Character submitted successfully. It is now waiting for admin approval.'
      )
      setFormState(initialFormState)
      setVrmFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      setSelectedPreviewFileName(null)
      window.setTimeout(() => {
        router.push('/your-characters')
      }, 1000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit character.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative overflow-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            {pageHeadingLabel}
          </h1>

          <div className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
            <AccountSideMenu activeKey="upload-vrm" />

            <form onSubmit={handleSubmit} className="rounded-md border border-white/10 bg-[#1a1414]/95 p-6 md:p-10">
              {isEditLoading ? (
                <p className="mb-4 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/75">Loading character data...</p>
              ) : null}

              <p className="text-sm text-white/65">
                Add a <span className="text-white/90">.vrm</span> and preview image by uploading files here, or paste public <span className="text-white/90">https://</span>{' '}
                URLs below. Uploaded files are stored on this site and fill the URL fields automatically when you submit.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <UploadDropzone
                    onFileSelect={(file) => {
                      setVrmFile(file)
                      setSelectedVrmFileName(file?.name ?? null)
                    }}
                    selectedFileName={selectedVrmFileName}
                  />
                </div>
                <div>
                  <PreviewImageDropzone
                    onFileSelect={(file) => {
                      setPreviewImageFile(file)
                      setSelectedPreviewFileName(file?.name ?? null)
                    }}
                    selectedFileName={selectedPreviewFileName}
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <UploadField label="Full Name" value={formState.fullName} onChange={(value) => handleFieldChange('fullName', value)} />
                <UploadField label="Tag line" value={formState.tagLine} onChange={(value) => handleFieldChange('tagLine', value)} />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <UploadField
                  label="VRM file URL (optional if you upload)"
                  value={formState.vroidFileUrl}
                  onChange={(value) => handleFieldChange('vroidFileUrl', value)}
                  placeholder="https://.../model.vrm"
                />
                <UploadField
                  label="Preview image URL (optional if you upload)"
                  value={formState.previewImageUrl}
                  onChange={(value) => handleFieldChange('previewImageUrl', value)}
                  placeholder="https://.../preview.png"
                />
              </div>

              <div className="mt-4">
                <UploadField
                  label="Screenshot URLs (one per line)"
                  value={formState.screenshotUrlsRawText}
                  onChange={(value) => handleFieldChange('screenshotUrlsRawText', value)}
                  placeholder="https://.../screen-1.png"
                  multiline
                />
              </div>

              <div className="mt-4">
                <UploadField
                  label="Description"
                  value={formState.description}
                  onChange={(value) => handleFieldChange('description', value)}
                  accentBorder
                />
              </div>

              <div className="mt-4 space-y-3">
                <UploadField
                  label="Personality"
                  value={formState.personality}
                  onChange={(value) => handleFieldChange('personality', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="Scenario"
                  value={formState.scenario}
                  onChange={(value) => handleFieldChange('scenario', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="First Message"
                  value={formState.firstMessage}
                  onChange={(value) => handleFieldChange('firstMessage', value)}
                  multiline
                  tokenLimit={800}
                />
                <UploadField
                  label="Example Dialogue"
                  value={formState.exampleDialogue}
                  onChange={(value) => handleFieldChange('exampleDialogue', value)}
                  multiline
                  tokenLimit={800}
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <UploadField
                  label="Legacy File Hash (optional)"
                  value={formState.legacyFileHash}
                  onChange={(value) => handleFieldChange('legacyFileHash', value)}
                  placeholder="64-char sha256 hash"
                />
                <UploadField
                  label="Legacy Tier (0/1/2)"
                  value={formState.legacyTier}
                  onChange={(value) => handleFieldChange('legacyTier', value)}
                  placeholder="0, 1, or 2"
                />
              </div>

              <label className="mt-3 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.legacyHeywaifu}
                  onChange={(event) => handleFieldChange('legacyHeywaifu', event.target.checked)}
                  className="size-4 rounded border border-white/30 bg-transparent text-ember-400 focus:ring-ember-300"
                  aria-label="Legacy heywaifu flag"
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Legacy HeyWaifu Flag</span>
              </label>

              <label className="mt-4 inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={formState.isPublic}
                  onChange={(event) => handleFieldChange('isPublic', event.target.checked)}
                  className="size-4 rounded border border-white/30 bg-transparent text-ember-400 focus:ring-ember-300"
                  aria-label="Make character public"
                />
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Make Character Public</span>
              </label>

              {sessionUser?.role === 'ADMIN' ? (
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formState.officialCurated}
                    onChange={(event) => handleFieldChange('officialCurated', event.target.checked)}
                    className="size-4 rounded border border-white/30 bg-transparent text-ember-400 focus:ring-ember-300"
                    aria-label="Curated official listing"
                  />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
                    Curated (official gallery — admin only)
                  </span>
                </label>
              ) : null}

              {statusMessage ? (
                <p className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
                  {statusMessage}
                </p>
              ) : null}

              {errorMessage ? (
                <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                  {errorMessage}
                </p>
              ) : null}

              <div className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
                  aria-label="Submit VRM upload"
                  disabled={isSubmitting || isEditLoading}
                >
                  {isSubmitting ? 'Submitting...' : isEditing ? 'Save Changes' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}

export default UploadVrmPage
