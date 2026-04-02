'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import MaintenanceWorkspaceGate from '@/components/shared/maintenance-workspace-gate'
import { useAuth } from '@/components/providers/auth-provider'
import PreviewImageDropzone from '@/components/ui-elements/preview-image-dropzone'
import UploadDropzone from '@/components/ui-elements/upload-dropzone'
import FirstMessagePreviewBox from '@/components/ui-elements/first-message-preview-box'
import UploadField from '@/components/ui-elements/upload-field'
import { FIRST_MESSAGE_MAX_LENGTH } from '@/lib/first-message-preview'
import {
  createCharacter,
  getCharacterDetail,
  updateCharacter,
  updateCharacterStatus,
  uploadCharacterAssets
} from '@/lib/character-api'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

type SaveMode = 'user-default' | 'admin-publish' | 'admin-draft'

type UploadVrmFormState = {
  fullName: string
  tagLine: string
  vroidFileUrl: string
  previewImageUrl: string
  description: string
  personality: string
  scenario: string
  exampleDialogs: string
  firstMessageText: string
  isPublic: boolean
}

const initialFormState: UploadVrmFormState = {
  fullName: '',
  tagLine: '',
  vroidFileUrl: '',
  previewImageUrl: '',
  description: '',
  personality: '',
  scenario: '',
  exampleDialogs: '',
  firstMessageText: '',
  isPublic: false
}

const UploadVrmPage = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sessionUser } = useAuth()
  const isAdmin = sessionUser?.role === 'ADMIN'
  const editCharacterId = searchParams.get('edit')?.trim() ?? ''
  const isEditing = editCharacterId.length > 0
  const [formState, setFormState] = useState<UploadVrmFormState>(initialFormState)
  const [vrmFile, setVrmFile] = useState<File | null>(null)
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null)
  const [selectedVrmFileName, setSelectedVrmFileName] = useState<string | null>(null)
  /** Preview URL from server (edit) or empty (new upload); used to revert after picking a replacement file. */
  const [baselinePreviewImageUrl, setBaselinePreviewImageUrl] = useState('')
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

  const personalityFilled = formState.personality.trim().length > 0
  const scenarioFilled = formState.scenario.trim().length > 0
  const exampleDialogsFilled = formState.exampleDialogs.trim().length > 0

  const canSubmitForm = useMemo(() => {
    if (isEditLoading) {
      return false
    }

    const normalizedName = formState.fullName.trim()
    if (normalizedName.length < 2) {
      return false
    }

    const existingVroidUrl = formState.vroidFileUrl.trim()
    if (!isEditing && !vrmFile) {
      return false
    }
    if (isEditing && !vrmFile && !existingVroidUrl) {
      return false
    }

    const hasPreview = Boolean(previewImageFile) || formState.previewImageUrl.trim().length > 0
    if (!hasPreview) {
      return false
    }

    if (!formState.tagLine.trim()) {
      return false
    }
    if (!formState.description.trim()) {
      return false
    }

    if (!personalityFilled || !scenarioFilled || !exampleDialogsFilled) {
      return false
    }

    const normalizedFirstMessage = formState.firstMessageText.trim()
    if (normalizedFirstMessage.length > FIRST_MESSAGE_MAX_LENGTH) {
      return false
    }
    if (!normalizedFirstMessage) {
      return false
    }

    return true
  }, [
    isEditLoading,
    isEditing,
    vrmFile,
    previewImageFile,
    formState.fullName,
    formState.vroidFileUrl,
    formState.previewImageUrl,
    formState.tagLine,
    formState.description,
    formState.firstMessageText,
    personalityFilled,
    scenarioFilled,
    exampleDialogsFilled
  ])


  useEffect(() => {
    if (!isEditing) {
      setFormState(initialFormState)
      setVrmFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      setBaselinePreviewImageUrl('')
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

        const loadedPreviewUrl = (payload.data.previewImageUrl ?? '').trim()

        setFormState({
          fullName: payload.data.name ?? '',
          tagLine: payload.data.tagline ?? '',
          vroidFileUrl: payload.data.vroidFileUrl ?? '',
          previewImageUrl: loadedPreviewUrl,
          description: payload.data.description ?? '',
          personality: payload.data.personality ?? '',
          scenario: payload.data.scenario ?? '',
          exampleDialogs: payload.data.exampleDialogs ?? '',
          firstMessageText: payload.data.firstMessage ?? '',
          isPublic: payload.data.visibility === 'PUBLIC'
        })
        setBaselinePreviewImageUrl(loadedPreviewUrl)
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

  const handleSave = async (event: React.FormEvent<HTMLFormElement> | null, mode: SaveMode) => {
    event?.preventDefault()

    if (isSubmitting) {
      return
    }

    const normalizedName = formState.fullName.trim()

    if (normalizedName.length < 2) {
      setErrorMessage('Please enter a valid character name.')
      setStatusMessage(null)
      return
    }

    const existingVroidUrl = formState.vroidFileUrl.trim()

    if (!isEditing && !vrmFile) {
      setErrorMessage('Please upload a VRM file.')
      setStatusMessage(null)
      return
    }

    if (isEditing && !vrmFile && !existingVroidUrl) {
      setErrorMessage('This character has no VRM yet. Please upload a VRM file.')
      setStatusMessage(null)
      return
    }

    if (!previewImageFile && !formState.previewImageUrl.trim()) {
      setErrorMessage('Please add a preview image.')
      setStatusMessage(null)
      return
    }

    if (!formState.tagLine.trim()) {
      setErrorMessage('Please enter a tag line.')
      setStatusMessage(null)
      return
    }

    if (!formState.description.trim()) {
      setErrorMessage('Please enter a description.')
      setStatusMessage(null)
      return
    }

    if (!personalityFilled || !scenarioFilled || !exampleDialogsFilled) {
      const missing: string[] = []
      if (!personalityFilled) {
        missing.push('personality')
      }
      if (!scenarioFilled) {
        missing.push('scenario')
      }
      if (!exampleDialogsFilled) {
        missing.push('example dialogs')
      }
      setErrorMessage(`Please fill in: ${missing.join(', ')}.`)
      setStatusMessage(null)
      return
    }

    const normalizedFirstMessage = formState.firstMessageText.trim()

    if (normalizedFirstMessage.length > FIRST_MESSAGE_MAX_LENGTH) {
      setErrorMessage(`First message is too long (${normalizedFirstMessage.length} / ${FIRST_MESSAGE_MAX_LENGTH} characters).`)
      setStatusMessage(null)
      return
    }

    if (!normalizedFirstMessage) {
      setErrorMessage('Please enter a first message.')
      setStatusMessage(null)
      return
    }

    const firstMessageForApi: string = normalizedFirstMessage

    setIsSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)

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

      const personalityText = formState.personality.trim()
      const scenarioText = formState.scenario.trim()
      const exampleDialogsText = formState.exampleDialogs.trim()

      const basePayload = {
        name: normalizedName,
        fullName: normalizedName,
        tagline: formState.tagLine.trim() || null,
        description: formState.description.trim() || null,
        personality: personalityText,
        scenario: scenarioText,
        exampleDialogs: exampleDialogsText,
        firstMessage: firstMessageForApi,
        vroidFileUrl: vroidUrl || null,
        previewImageUrl: previewUrl || null
      }

      if (isAdmin && mode === 'admin-publish') {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...basePayload,
            visibility: 'PUBLIC'
          })
          await updateCharacterStatus(editCharacterId, 'APPROVED')
        } else {
          await createCharacter({
            name: normalizedName,
            fullName: normalizedName,
            tagline: formState.tagLine.trim() || undefined,
            description: formState.description.trim() || undefined,
            personality: personalityText,
            scenario: scenarioText,
            exampleDialogs: exampleDialogsText,
            firstMessage: firstMessageForApi,
            vroidFileUrl: vroidUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            visibility: 'PUBLIC',
            draft: false
          })
        }
        setStatusMessage(
          isEditing ? 'Character updated and published to the gallery.' : 'Official character published to the gallery.'
        )
      } else if (isAdmin && mode === 'admin-draft') {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...basePayload,
            visibility: 'PRIVATE'
          })
          await updateCharacterStatus(editCharacterId, 'DRAFT')
        } else {
          await createCharacter({
            name: normalizedName,
            fullName: normalizedName,
            tagline: formState.tagLine.trim() || undefined,
            description: formState.description.trim() || undefined,
            personality: personalityText,
            scenario: scenarioText,
            exampleDialogs: exampleDialogsText,
            firstMessage: firstMessageForApi,
            vroidFileUrl: vroidUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            draft: true
          })
        }
        setStatusMessage('Saved as draft.')
      } else {
        const visibility = formState.isPublic ? 'PUBLIC' : 'PRIVATE'

        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...basePayload,
            visibility
          })
        } else {
          await createCharacter({
            name: normalizedName,
            fullName: normalizedName,
            tagline: formState.tagLine.trim() || undefined,
            description: formState.description.trim() || undefined,
            personality: personalityText,
            scenario: scenarioText,
            exampleDialogs: exampleDialogsText,
            firstMessage: firstMessageForApi,
            vroidFileUrl: vroidUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            visibility
          })
        }

        setStatusMessage(
          isEditing
            ? 'Character updated successfully. If it was public, it may require re-approval before republishing.'
            : 'Character submitted successfully. It is now waiting for admin approval.'
        )
      }

      setFormState(initialFormState)
      setVrmFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      const nextPath = isAdmin ? '/admin/official-vrms' : '/your-characters'
      window.setTimeout(() => {
        router.push(nextPath)
      }, 1000)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit character.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative overflow-x-hidden bg-[#030303] text-white">
      <section className="relative min-h-[calc(100vh-150px)] border-b border-white/10 px-5 py-10 md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_44%_0%,rgba(244,99,19,0.12),transparent_38%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px] opacity-50" />

        <div className="relative z-10 mx-auto w-full max-w-[1150px] pt-24">
          <h1 className="text-center font-[family-name:var(--font-heading)] text-4xl font-normal italic leading-none text-white md:text-5xl">
            {pageHeadingLabel}
          </h1>

          <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-[380px_1fr] lg:items-start">
            <AccountSideMenu activeKey="upload-vrm" />

            <MaintenanceWorkspaceGate>
            <form
              onSubmit={(event) => {
                if (isAdmin) {
                  event.preventDefault()
                  return
                }

                void handleSave(event, 'user-default')
              }}
              className="rounded-md border border-white/10 bg-[#1a1414]/95 p-6 md:p-10"
            >
              {isEditLoading ? (
                <p className="mb-4 rounded-md border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/75">Loading character data...</p>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <UploadDropzone
                    onFileSelect={(file) => {
                      setVrmFile(file)
                      setSelectedVrmFileName(file?.name ?? null)
                    }}
                    selectedFileName={selectedVrmFileName}
                    existingVrmUrl={formState.vroidFileUrl.trim() || null}
                    openPickerInDialog={isEditing}
                  />
                </div>
                <div>
                  <PreviewImageDropzone
                    onFileSelect={(file) => {
                      setPreviewImageFile(file)
                    }}
                    pendingImageFile={previewImageFile}
                    existingImageUrl={formState.previewImageUrl.trim() || null}
                    baselinePreviewImageUrl={baselinePreviewImageUrl}
                    onRevertPreview={() => {
                      setPreviewImageFile(null)
                      handleFieldChange('previewImageUrl', baselinePreviewImageUrl)
                    }}
                  />
                </div>
              </div>


              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <UploadField
                  label="Full Name"
                  value={formState.fullName}
                  onChange={(value) => handleFieldChange('fullName', value)}
                  tokenLimit={120}
                  maxLength={120}
                  disabled={isEditLoading}
                />
                <UploadField
                  label="Tag line"
                  value={formState.tagLine}
                  onChange={(value) => handleFieldChange('tagLine', value)}
                  tokenLimit={160}
                  maxLength={160}
                  disabled={isEditLoading}
                />
              </div>

              <div className="mt-6">
                <UploadField
                  label="Description"
                  value={formState.description}
                  onChange={(value) => handleFieldChange('description', value)}
                  multiline
                  rows={4}
                  tokenLimit={5000}
                  maxLength={5000}
                  disabled={isEditLoading}
                />
              </div>

              <div className="mt-6 space-y-6">
                <UploadField
                  label="Personality"
                  value={formState.personality}
                  onChange={(value) => handleFieldChange('personality', value)}
                  multiline
                  rows={4}
                  tokenLimit={8000}
                  maxLength={8000}
                  placeholder="How the character thinks, speaks, and reacts…"
                  disabled={isEditLoading}
                />
                <UploadField
                  label="Scenario"
                  value={formState.scenario}
                  onChange={(value) => handleFieldChange('scenario', value)}
                  multiline
                  rows={4}
                  tokenLimit={8000}
                  maxLength={8000}
                  placeholder="Setting, situation, or roleplay context…"
                  disabled={isEditLoading}
                />
                <UploadField
                  label="Example dialogs"
                  value={formState.exampleDialogs}
                  onChange={(value) => handleFieldChange('exampleDialogs', value)}
                  multiline
                  rows={5}
                  tokenLimit={12000}
                  maxLength={12000}
                  placeholder="Sample exchanges (e.g. User: … / Character: …)"
                  disabled={isEditLoading}
                />
              </div>

              <div className="mt-4">
                <div className="rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">
                      First message <span className="font-normal normal-case text-white/35">(required)</span>
                    </p>
                    <p id="first-message-help" className="mt-1.5 text-[11px] leading-relaxed text-white/40">
                      Required plain text. Use <span className="text-white/55">*text*</span> for pink, <span className="text-white/55">"text"</span> for
                      normal white, and <span className="text-white/55">**</span> for actions (same style as chat).
                    </p>
                  </div>

                  <UploadField
                    label="First message"
                    value={formState.firstMessageText}
                    onChange={(value) => handleFieldChange('firstMessageText', value)}
                    multiline
                    rows={5}
                    tokenLimit={FIRST_MESSAGE_MAX_LENGTH}
                    maxLength={FIRST_MESSAGE_MAX_LENGTH}
                    placeholder={'Use *like this* for pink, "like this" for normal white, and ** for actions.'}
                    disabled={isEditLoading}
                  />

                  <div className="mt-4">
                    <FirstMessagePreviewBox firstMessage={formState.firstMessageText} />
                    <p className="mt-2 text-[10px] text-white/35" aria-live="polite">
                      Preview uses your plain text message exactly as typed.
                    </p>
                  </div>
                </div>
              </div>

              {!isAdmin ? (
                <label className="mt-5 inline-flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formState.isPublic}
                    onChange={(event) => handleFieldChange('isPublic', event.target.checked)}
                    aria-label="Make character public"
                  />
                  <span className="text-sm font-medium text-white/70">Make Character Public</span>
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

              <div className="mt-6 flex flex-wrap gap-3">
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55 disabled:hover:brightness-100"
                      aria-label="Submit and publish to gallery"
                      disabled={isSubmitting || !canSubmitForm}
                      onClick={() => void handleSave(null, 'admin-publish')}
                    >
                      {isSubmitting ? 'Saving...' : 'Submit'}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-md border border-white/25 bg-transparent px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white/90 transition hover:border-white/40 hover:bg-white/5 disabled:cursor-not-allowed disabled:border-white/12 disabled:text-white/35 disabled:hover:border-white/12 disabled:hover:bg-transparent"
                      aria-label="Save as draft"
                      disabled={isSubmitting || !canSubmitForm}
                      onClick={() => void handleSave(null, 'admin-draft')}
                    >
                      {isSubmitting ? 'Saving...' : 'Draft'}
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55 disabled:hover:brightness-100"
                    aria-label="Submit VRM upload"
                    disabled={isSubmitting || !canSubmitForm}
                  >
                    {isSubmitting ? 'Submitting...' : isEditing ? 'Save Changes' : 'Submit'}
                  </button>
                )}
              </div>
            </form>
            </MaintenanceWorkspaceGate>
          </div>
        </div>
      </section>
    </main>
  )
}

export default UploadVrmPage
