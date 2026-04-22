'use client'

import AccountSideMenu from '@/components/shared/account-side-menu'
import MaintenanceWorkspaceGate from '@/components/shared/maintenance-workspace-gate'
import { useAuth } from '@/components/providers/auth-provider'
import UploadDropzone from '@/components/ui-elements/upload-dropzone'
import UploadField from '@/components/ui-elements/upload-field'
import VrmLivePreview from '@/components/ui-elements/vrm-live-preview'
import { ApiRequestError, apiGet } from '@/lib/api-client'
import {
  createCharacter,
  generateCharacterPreview,
  getCharacterDetail,
  updateCharacter,
  updateCharacterStatus,
  uploadCharacterAssets,
  type GenerateCharacterPreviewResponse
} from '@/lib/character-api'
import { getApiBaseUrl } from '@/lib/api-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

type SaveMode = 'user-default' | 'admin-publish' | 'admin-draft'

type PublicGlobalSettingsResponse = {
  data: {
    characterFieldLimits: {
      nameMaxLength: number
      tagLineMaxLength: number
      descriptionMaxLength: number
      personalityMaxLength: number
      scenarioMaxLength: number
      exampleDialogsMaxLength: number
      firstMessageMaxLength: number
    }
  }
}

type UploadVrmFormState = {
  fullName: string
  tagLine: string
  vroidFileUrl: string
  poseFileUrl: string
  previewImageUrl: string
  description: string
  personality: string
  scenario: string
  exampleDialogs: string
  firstMessageText: string
}

const initialFormState: UploadVrmFormState = {
  fullName: '',
  tagLine: '',
  vroidFileUrl: '',
  poseFileUrl: '',
  previewImageUrl: '',
  description: '',
  personality: '',
  scenario: '',
  exampleDialogs: '',
  firstMessageText: ''
}

const defaultCharacterFieldLimits = {
  nameMaxLength: 120,
  tagLineMaxLength: 160,
  descriptionMaxLength: 5000,
  personalityMaxLength: 8000,
  scenarioMaxLength: 8000,
  exampleDialogsMaxLength: 12000,
  firstMessageMaxLength: 50000
}

const PRESET_POSE_FILENAMES = ['VRMA_01.vrma', 'VRMA_02.vrma', 'VRMA_03.vrma', 'VRMA_04.vrma', 'VRMA_05.vrma', 'VRMA_06.vrma', 'VRMA_07.vrma'] as const

const getUploadsBaseUrl = () => getApiBaseUrl().replace(/\/api\/?$/, '')

const getPresetPoseUrl = (filename: (typeof PRESET_POSE_FILENAMES)[number]) => `${getUploadsBaseUrl()}/uploads/${filename}`

const UploadVrmPage = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { sessionUser } = useAuth()
  const isAdmin = sessionUser?.role === 'ADMIN'
  const editCharacterId = searchParams.get('edit')?.trim() ?? ''
  const isEditing = editCharacterId.length > 0
  const [formState, setFormState] = useState<UploadVrmFormState>(initialFormState)
  const [vrmFile, setVrmFile] = useState<File | null>(null)
  const [poseFile, setPoseFile] = useState<File | null>(null)
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null)
  const [selectedVrmFileName, setSelectedVrmFileName] = useState<string | null>(null)
  const [localCapturedPreviewUrl, setLocalCapturedPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEditLoading, setIsEditLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [thumbnailStatusMessage, setThumbnailStatusMessage] = useState<string | null>(null)
  const [thumbnailErrorMessage, setThumbnailErrorMessage] = useState<string | null>(null)
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false)
  const [previewGenerationCooldownUntil, setPreviewGenerationCooldownUntil] = useState<number | null>(null)
  const [cooldownNow, setCooldownNow] = useState(() => Date.now())
  const [hiddenCaptureRequestKey, setHiddenCaptureRequestKey] = useState(0)
  const [hiddenReferencePreviewUrl, setHiddenReferencePreviewUrl] = useState<string | null>(null)
  const [previewGenerationDebugData, setPreviewGenerationDebugData] = useState<GenerateCharacterPreviewResponse['data']['debug'] | null>(null)
  const previewGenerationRequestIdRef = useRef(0)
  const [editInitialState, setEditInitialState] = useState<UploadVrmFormState | null>(null)
  const [fieldLimits, setFieldLimits] = useState(defaultCharacterFieldLimits)

  const presetPoseOptions = useMemo(
    () =>
      PRESET_POSE_FILENAMES.map((filename, index) => ({
        id: `preset-${index + 1}`,
        label: String(index + 1),
        filename,
        url: getPresetPoseUrl(filename)
      })),
    []
  )

  const handleFieldChange = <T extends keyof UploadVrmFormState>(key: T, value: UploadVrmFormState[T]) => {
    setFormState((previousState) => ({
      ...previousState,
      [key]: value
    }))
  }

  const pageHeadingLabel = useMemo(() => (isEditing ? 'Edit VRM Character' : 'Upload VRM'), [isEditing])

  const personalityFilled = formState.personality.trim().length > 0
  const scenarioFilled = formState.scenario.trim().length > 0
  const hasModelSource = Boolean(vrmFile || formState.vroidFileUrl.trim())
  const defaultHiddenPoseUrl = presetPoseOptions[0]?.url
  const previewCooldownSecondsRemaining = previewGenerationCooldownUntil
    ? Math.max(0, Math.ceil((previewGenerationCooldownUntil - cooldownNow) / 1000))
    : 0
  const shouldAutoGenerateHiddenPreview = hasModelSource && (Boolean(vrmFile) || formState.previewImageUrl.trim().length === 0)
  const isRegenerateCoolingDown = !isAdmin && previewCooldownSecondsRemaining > 0

  const canSubmitForm = useMemo(() => {
    if (isEditLoading) {
      return false
    }

    if (isPreviewGenerating) {
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

    if (!personalityFilled || !scenarioFilled) {
      return false
    }

    const normalizedFirstMessage = formState.firstMessageText.trim()
    if (normalizedFirstMessage.length > fieldLimits.firstMessageMaxLength) {
      return false
    }
    if (!normalizedFirstMessage) {
      return false
    }

    return true
  }, [
    isEditLoading,
    isPreviewGenerating,
    isEditing,
    vrmFile,
    previewImageFile,
    formState.fullName,
    formState.vroidFileUrl,
    formState.previewImageUrl,
    formState.tagLine,
    formState.description,
    formState.firstMessageText,
    fieldLimits.firstMessageMaxLength,
    personalityFilled,
    scenarioFilled
  ])

  const isEditingDirty = useMemo(() => {
    if (!isEditing) {
      // Creating a new character: rely solely on canSubmitForm.
      return true
    }
    if (!editInitialState) {
      // Still loading initial data; treat as not dirty so Save Changes stays disabled.
      return false
    }
    // Any new local files imply a change.
    if (vrmFile || poseFile || previewImageFile) {
      return true
    }
    // Compare each text field against the initial loaded state.
    const keys: (keyof UploadVrmFormState)[] = [
      'fullName',
      'tagLine',
      'vroidFileUrl',
      'poseFileUrl',
      'previewImageUrl',
      'description',
      'personality',
      'scenario',
      'exampleDialogs',
      'firstMessageText'
    ]
    return keys.some((key) => formState[key] !== editInitialState[key])
  }, [editInitialState, formState, isEditing, poseFile, previewImageFile, vrmFile])


  useEffect(() => {
    if (!previewGenerationCooldownUntil) {
      return
    }

    if (previewGenerationCooldownUntil <= Date.now()) {
      setPreviewGenerationCooldownUntil(null)
      return
    }

    const intervalId = window.setInterval(() => {
      const nextNow = Date.now()
      setCooldownNow(nextNow)

      if (previewGenerationCooldownUntil <= nextNow) {
        setPreviewGenerationCooldownUntil(null)
      }
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [previewGenerationCooldownUntil])

  useEffect(() => {
    let isCancelled = false

    Promise.resolve().then(async () => {
      try {
        const payload = await apiGet<PublicGlobalSettingsResponse>('/global-settings/public')
        if (!isCancelled) {
          setFieldLimits(payload.data.characterFieldLimits)
        }
      } catch {
        if (!isCancelled) {
          setFieldLimits(defaultCharacterFieldLimits)
        }
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isEditing) {
      setFormState(initialFormState)
      setVrmFile(null)
      setPoseFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      setHiddenReferencePreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return null
      })
      setPreviewGenerationDebugData(null)
      setLocalCapturedPreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return null
      })
      setErrorMessage(null)
      setThumbnailErrorMessage(null)
      setThumbnailStatusMessage(null)
      setPreviewGenerationCooldownUntil(null)
      setCooldownNow(Date.now())
      setIsPreviewGenerating(false)
      setHiddenCaptureRequestKey(0)
      previewGenerationRequestIdRef.current += 1
      setStatusMessage(null)
      setIsEditLoading(false)
      return
    }

    let isCancelled = false

    Promise.resolve().then(async () => {
      setIsEditLoading(true)
      setErrorMessage(null)
      setThumbnailErrorMessage(null)
      setThumbnailStatusMessage(null)
      setPreviewGenerationCooldownUntil(null)
      setCooldownNow(Date.now())
      setHiddenCaptureRequestKey(0)
      previewGenerationRequestIdRef.current += 1
      setStatusMessage(null)

      try {
        const payload = await getCharacterDetail(editCharacterId)

        if (isCancelled) {
          return
        }

        setVrmFile(null)
        setPoseFile(null)
        setPreviewImageFile(null)
        setSelectedVrmFileName(null)
        setHiddenReferencePreviewUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
          }
          return null
        })
        setPreviewGenerationDebugData(null)
        setLocalCapturedPreviewUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
          }
          return null
        })

        const loadedPreviewUrl = (payload.data.previewImageUrl ?? '').trim()

        const nextState: UploadVrmFormState = {
          fullName: payload.data.name ?? '',
          tagLine: payload.data.tagline ?? '',
          vroidFileUrl: payload.data.vroidFileUrl ?? '',
          poseFileUrl: payload.data.poseFileUrl ?? '',
          previewImageUrl: loadedPreviewUrl,
          description: payload.data.description ?? '',
          personality: payload.data.personality ?? '',
          scenario: payload.data.scenario ?? '',
          exampleDialogs: payload.data.exampleDialogs ?? '',
          firstMessageText: payload.data.firstMessage ?? ''
        }

        setFormState(nextState)
        setEditInitialState(nextState)
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

  useEffect(() => {
    return () => {
      if (localCapturedPreviewUrl) {
        URL.revokeObjectURL(localCapturedPreviewUrl)
      }
    }
  }, [localCapturedPreviewUrl])

  useEffect(() => {
    return () => {
      if (hiddenReferencePreviewUrl) {
        URL.revokeObjectURL(hiddenReferencePreviewUrl)
      }
    }
  }, [hiddenReferencePreviewUrl])

  const formatSeconds = (value: number) => {
    if (value < 60) {
      return `${value}s`
    }

    const minutes = Math.floor(value / 60)
    const seconds = value % 60
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
  }

  const triggerHiddenPreviewGeneration = async (referenceFile: File) => {
    const requestId = ++previewGenerationRequestIdRef.current
    setIsPreviewGenerating(true)
    setThumbnailErrorMessage(null)
    setThumbnailStatusMessage('Generating thumbnail automatically...')
    setPreviewGenerationDebugData(null)

    const formData = new FormData()
    formData.append('characterImage', referenceFile)

    if (isEditing) {
      formData.append('characterId', editCharacterId)
    }

    try {
      const payload = await generateCharacterPreview(formData)
      if (previewGenerationRequestIdRef.current !== requestId) {
        return
      }

      setLocalCapturedPreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return null
      })
      handleFieldChange('previewImageUrl', payload.data.previewImageUrl)
      setPreviewGenerationDebugData(payload.data.debug ?? null)

      if (payload.data.cooldownSecondsRemaining > 0) {
        const nextCooldownUntil = Date.now() + payload.data.cooldownSecondsRemaining * 1000
        setPreviewGenerationCooldownUntil(nextCooldownUntil)
        setCooldownNow(Date.now())
        setThumbnailStatusMessage(
          `Thumbnail generated. Regenerate will be available again in ${formatSeconds(payload.data.cooldownSecondsRemaining)}.`
        )
      } else {
        setPreviewGenerationCooldownUntil(null)
        setCooldownNow(Date.now())
        setThumbnailStatusMessage('Thumbnail generated automatically.')
      }
    } catch (error) {
      if (previewGenerationRequestIdRef.current !== requestId) {
        return
      }

      const message = error instanceof Error ? error.message : 'Failed to generate thumbnail.'
      const cooldownMatch = /(\d+)\s*second/i.exec(message)
      if (cooldownMatch?.[1]) {
        const cooldownSeconds = Number(cooldownMatch[1])
        if (Number.isFinite(cooldownSeconds) && cooldownSeconds > 0) {
          setPreviewGenerationCooldownUntil(Date.now() + cooldownSeconds * 1000)
          setCooldownNow(Date.now())
        }
      }
      setThumbnailErrorMessage(message)
      setThumbnailStatusMessage(null)
      setPreviewGenerationDebugData(null)
    } finally {
      if (previewGenerationRequestIdRef.current === requestId) {
        setIsPreviewGenerating(false)
      }
    }
  }

  const handleUserRegeneratePreview = () => {
    if (isPreviewGenerating || previewCooldownSecondsRemaining > 0 || !hasModelSource) {
      return
    }

    setThumbnailErrorMessage(null)
    setThumbnailStatusMessage('Refreshing hidden reference capture...')
    setCooldownNow(Date.now())
    setHiddenCaptureRequestKey((previous) => previous + 1)
  }

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

    if (!personalityFilled || !scenarioFilled) {
      const missing: string[] = []
      if (!personalityFilled) {
        missing.push('personality')
      }
      if (!scenarioFilled) {
        missing.push('scenario')
      }
      setErrorMessage(`Please fill in: ${missing.join(', ')}.`)
      setStatusMessage(null)
      return
    }

    const normalizedFirstMessage = formState.firstMessageText.trim()

    if (normalizedFirstMessage.length > fieldLimits.firstMessageMaxLength) {
      setErrorMessage(`First message is too long (${normalizedFirstMessage.length} / ${fieldLimits.firstMessageMaxLength} characters).`)
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
      let poseUrl = formState.poseFileUrl.trim()
      let previewUrl = formState.previewImageUrl.trim()

      if (vrmFile || poseFile || previewImageFile) {
        const formData = new FormData()

        if (vrmFile) {
          formData.append('vrm', vrmFile)
        }

        if (previewImageFile) {
          formData.append('preview', previewImageFile)
        }
        if (poseFile) {
          formData.append('pose', poseFile)
        }

        const uploadPayload = await uploadCharacterAssets(formData)

        if (uploadPayload.data.vroidFileUrl) {
          vroidUrl = uploadPayload.data.vroidFileUrl
        }

        if (uploadPayload.data.previewImageUrl) {
          previewUrl = uploadPayload.data.previewImageUrl
        }
        if (uploadPayload.data.poseFileUrl) {
          poseUrl = uploadPayload.data.poseFileUrl
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
        poseFileUrl: poseUrl || null,
        previewImageUrl: previewUrl || null
      }

      const updatePayload = {
        ...basePayload,
        ...(vrmFile ? { vroidFileUrl: vroidUrl || null } : {})
      }

      if (isAdmin && mode === 'admin-publish') {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...updatePayload
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
            poseFileUrl: poseUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            draft: false
          })
        }
        setStatusMessage(
          isEditing ? 'Character updated and published to the gallery.' : 'Official character published to the gallery.'
        )
      } else if (isAdmin && mode === 'admin-draft') {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...updatePayload
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
            poseFileUrl: poseUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            draft: true
          })
        }
        setStatusMessage('Saved as draft.')
      } else {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...updatePayload
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
            poseFileUrl: poseUrl || undefined,
            previewImageUrl: previewUrl || undefined
          })
        }

        setStatusMessage(
          isEditing
            ? 'Character updated successfully. It may require re-approval before republishing.'
            : 'Character submitted successfully. It is now waiting for admin approval.'
        )
      }

      setFormState(initialFormState)
      setVrmFile(null)
      setPoseFile(null)
      setPreviewImageFile(null)
      setSelectedVrmFileName(null)
      setThumbnailErrorMessage(null)
      setThumbnailStatusMessage(null)
      setPreviewGenerationDebugData(null)
      setPreviewGenerationCooldownUntil(null)
      setCooldownNow(Date.now())
      setHiddenCaptureRequestKey(0)
      previewGenerationRequestIdRef.current += 1
      setHiddenReferencePreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return null
      })
      setLocalCapturedPreviewUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl)
        }
        return null
      })
      const nextPath = isAdmin ? '/admin/official-vrms' : '/your-characters'
      window.setTimeout(() => {
        router.push(nextPath)
      }, 1000)
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'INVALID_CHARACTER_ASSET_URL') {
        const hint =
          error.field === 'vroidFileUrl'
            ? ' Re-upload the VRM so it is stored in configured object storage.'
            : error.field === 'poseFileUrl'
              ? ' Re-upload the pose file or use a valid pose URL.'
              : ' Replace the preview image or capture a new thumbnail.'
        setErrorMessage(`${error.message}${hint}`)
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to submit character.')
      }
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

                <div className="mt-4">
                  <UploadDropzone
                    onFileSelect={(file) => {
                      setVrmFile(file)
                      setSelectedVrmFileName(file?.name ?? null)
                      previewGenerationRequestIdRef.current += 1
                      setPreviewImageFile(null)
                      setThumbnailErrorMessage(null)
                      setPreviewGenerationDebugData(null)
                      setPreviewGenerationCooldownUntil(null)
                      setCooldownNow(Date.now())
                      setHiddenReferencePreviewUrl((previousUrl) => {
                        if (previousUrl) {
                          URL.revokeObjectURL(previousUrl)
                        }
                        return null
                      })
                      setLocalCapturedPreviewUrl((previousUrl) => {
                        if (previousUrl) {
                          URL.revokeObjectURL(previousUrl)
                        }
                        return null
                      })
                      handleFieldChange('previewImageUrl', '')
                      setThumbnailStatusMessage(file ? 'Preparing thumbnail automatically...' : null)
                    }}
                    selectedFileName={selectedVrmFileName}
                    existingVrmUrl={formState.vroidFileUrl.trim() || null}
                    openPickerInDialog={isEditing}
                    className="w-full max-w-none aspect-auto h-[280px]"
                  />
                </div>

                {hasModelSource ? (
                  <div className="relative h-0 overflow-hidden">
                    <VrmLivePreview
                      selectedFile={vrmFile}
                      existingVrmUrl={formState.vroidFileUrl}
                      existingPreviewImageUrl={null}
                      autoPoseUrls={defaultHiddenPoseUrl ? [defaultHiddenPoseUrl] : undefined}
                      autoCaptureOnLoad={shouldAutoGenerateHiddenPreview}
                      headless
                      capturePreset="portrait-thumbnail"
                      captureRequestKey={hiddenCaptureRequestKey}
                      onThumbnailGenerated={(file) => {
                        if (isAdmin) {
                          const nextReferenceUrl = URL.createObjectURL(file)
                          setHiddenReferencePreviewUrl((previousUrl) => {
                            if (previousUrl) {
                              URL.revokeObjectURL(previousUrl)
                            }
                            return nextReferenceUrl
                          })
                        }
                        void triggerHiddenPreviewGeneration(file)
                      }}
                    />
                  </div>
                ) : null}

                <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Thumbnail</p>
                      <p className="mt-1 text-sm text-white/80">
                        {isPreviewGenerating
                          ? 'Generating thumbnail automatically...'
                          : formState.previewImageUrl.trim()
                            ? 'Thumbnail ready.'
                            : hasModelSource
                              ? 'Thumbnail will be generated automatically.'
                              : 'Upload a VRM and we will generate the thumbnail automatically.'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleUserRegeneratePreview}
                      disabled={!hasModelSource || isEditLoading || isPreviewGenerating || isRegenerateCoolingDown}
                      className="inline-flex h-10 min-w-[180px] items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 transition hover:border-white/35 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                    >
                      {isPreviewGenerating
                        ? 'Generating...'
                        : isRegenerateCoolingDown
                          ? `Regenerate (${formatSeconds(previewCooldownSecondsRemaining)})`
                          : 'Regenerate'}
                    </button>
                  </div>

                  {thumbnailStatusMessage ? (
                    <p className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
                      {thumbnailStatusMessage}
                    </p>
                  ) : null}

                  {thumbnailErrorMessage ? (
                    <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                      {thumbnailErrorMessage}
                    </p>
                  ) : null}

                  {formState.previewImageUrl.trim() ? (
                    <div className={`mt-4 grid gap-4 ${isAdmin ? 'lg:grid-cols-2' : ''}`}>
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Generated Thumbnail</p>
                        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formState.previewImageUrl.trim()}
                            alt="Generated thumbnail"
                            className="h-auto w-full object-cover"
                          />
                        </div>
                      </div>

                      {isAdmin && hiddenReferencePreviewUrl ? (
                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Reference Image Used</p>
                          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={hiddenReferencePreviewUrl}
                              alt="Reference capture used for generation"
                              className="h-auto w-full object-cover"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (isAdmin && hiddenReferencePreviewUrl ? (
                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Reference Image Used</p>
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={hiddenReferencePreviewUrl}
                          alt="Reference capture used for generation"
                          className="h-auto w-full object-cover"
                        />
                      </div>
                    </div>
                  ) : null)}

                  {isAdmin && previewGenerationDebugData ? (
                    <details className="mt-4 rounded-md border border-white/10 bg-black/35">
                      <summary className="cursor-pointer list-none px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80">
                        API Debug Details
                      </summary>
                      <div className="border-t border-white/10 px-4 py-3">
                        <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/70">
                          {JSON.stringify(previewGenerationDebugData, null, 2)}
                        </pre>
                      </div>
                    </details>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-6 sm:grid-cols-2">
                  <UploadField
                    label="Full Name"
                    value={formState.fullName}
                    onChange={(value) => handleFieldChange('fullName', value)}
                    tokenLimit={fieldLimits.nameMaxLength}
                    maxLength={fieldLimits.nameMaxLength}
                    disabled={isEditLoading}
                  />
                  <UploadField
                    label="Tag line"
                    value={formState.tagLine}
                    onChange={(value) => handleFieldChange('tagLine', value)}
                    tokenLimit={fieldLimits.tagLineMaxLength}
                    maxLength={fieldLimits.tagLineMaxLength}
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
                    tokenLimit={fieldLimits.descriptionMaxLength}
                    maxLength={fieldLimits.descriptionMaxLength}
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
                    tokenLimit={fieldLimits.personalityMaxLength}
                    maxLength={fieldLimits.personalityMaxLength}
                    placeholder="How the character thinks, speaks, and reacts…"
                    disabled={isEditLoading}
                  />
                  <UploadField
                    label="Scenario"
                    value={formState.scenario}
                    onChange={(value) => handleFieldChange('scenario', value)}
                    multiline
                    rows={4}
                    tokenLimit={fieldLimits.scenarioMaxLength}
                    maxLength={fieldLimits.scenarioMaxLength}
                    placeholder="Setting, situation, or roleplay context…"
                    disabled={isEditLoading}
                  />
                  <UploadField
                    label="Example dialogs (optional)"
                    value={formState.exampleDialogs}
                    onChange={(value) => handleFieldChange('exampleDialogs', value)}
                    multiline
                    rows={5}
                    tokenLimit={fieldLimits.exampleDialogsMaxLength}
                    maxLength={fieldLimits.exampleDialogsMaxLength}
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
                        Required plain text. Use <span className="text-white/55">*text*</span> for pink, <span className="text-white/55">&quot;text&quot;</span> for
                        normal white, and <span className="text-white/55">**</span> for actions (same style as chat).
                      </p>
                    </div>

                    <UploadField
                      label="First message"
                      value={formState.firstMessageText}
                      onChange={(value) => handleFieldChange('firstMessageText', value)}
                      multiline
                      rows={5}
                      tokenLimit={fieldLimits.firstMessageMaxLength}
                      maxLength={fieldLimits.firstMessageMaxLength}
                      placeholder={'Use *like this* for pink, "like this" for normal white, and ** for actions.'}
                      disabled={isEditLoading}
                    />
                  </div>
                </div>

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
                      disabled={isSubmitting || !canSubmitForm || (isEditing && !isEditingDirty)}
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
