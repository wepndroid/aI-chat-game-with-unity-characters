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
  uploadCharacterAssets,
  type CharacterAssetUploadProgress,
  type CharacterPublicationIntent,
  type CharacterStatus,
  type CharacterVisibility,
  type GenerateCharacterPreviewResponse
} from '@/lib/character-api'
import { getApiBaseUrl } from '@/lib/api-client'
import { lastPathSegmentFromUrl } from '@/lib/url-filename'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  voiceFileUrl: string
  voiceFileName: string
  thumbnailReferenceImageUrl: string
  description: string
  personality: string
  scenario: string
  exampleDialogs: string
  firstMessageText: string
}

type SubmitProgressState = {
  stage: 'uploading' | 'saving'
  loaded: number
  total: number | null
  percent: number | null
}

type SaveMode = 'user-default' | 'admin-official-draft' | 'admin-official-publish'

const initialFormState: UploadVrmFormState = {
  fullName: '',
  tagLine: '',
  vroidFileUrl: '',
  poseFileUrl: '',
  previewImageUrl: '',
  voiceFileUrl: '',
  voiceFileName: '',
  thumbnailReferenceImageUrl: '',
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
const VOICE_FILE_MAX_BYTES = 30 * 1024 * 1024
const visibilityOptions: Array<{
  value: CharacterVisibility
  label: string
  description: string
}> = [
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Only you can see this character and use the VRM in game.'
  },
  {
    value: 'UNLISTED',
    label: 'Hidden',
    description: 'Logged-in users can see this character and use the VRM in game after approval.'
  },
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Everyone can view the character page; logged-in users can use the VRM in game after approval.'
  }
]

const getUploadsBaseUrl = () => getApiBaseUrl().replace(/\/api\/?$/, '')

const getPresetPoseUrl = (filename: (typeof PRESET_POSE_FILENAMES)[number]) => `${getUploadsBaseUrl()}/uploads/${filename}`

const getPublicationIntentForSaveMode = (saveMode: SaveMode): CharacterPublicationIntent | null => {
  if (saveMode === 'admin-official-draft') {
    return 'draft'
  }
  if (saveMode === 'admin-official-publish') {
    return 'publish'
  }
  return null
}

const getPublicationStatusForSaveMode = (saveMode: SaveMode): CharacterStatus | null => {
  if (saveMode === 'admin-official-draft') {
    return 'DRAFT'
  }
  if (saveMode === 'admin-official-publish') {
    return 'APPROVED'
  }
  return null
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
  const [poseFile, setPoseFile] = useState<File | null>(null)
  const [previewImageFile, setPreviewImageFile] = useState<File | null>(null)
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [selectedVrmFileName, setSelectedVrmFileName] = useState<string | null>(null)
  const [localCapturedPreviewUrl, setLocalCapturedPreviewUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitProgress, setSubmitProgress] = useState<SubmitProgressState | null>(null)
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
  const [isModelPreparing, setIsModelPreparing] = useState(false)
  const [modelLoadProgressPercent, setModelLoadProgressPercent] = useState(0)
  const [isModelReadyForThumbnail, setIsModelReadyForThumbnail] = useState(false)
  const [isCharacterFlipped, setIsCharacterFlipped] = useState(false)
  const [visibility, setVisibility] = useState<CharacterVisibility>('PUBLIC')
  const previewGenerationRequestIdRef = useRef(0)
  const [editInitialState, setEditInitialState] = useState<UploadVrmFormState | null>(null)
  const [editInitialVisibility, setEditInitialVisibility] = useState<CharacterVisibility | null>(null)
  const [editInitialStatus, setEditInitialStatus] = useState<CharacterStatus | null>(null)
  const [editInitialOfficialListing, setEditInitialOfficialListing] = useState<boolean | null>(null)
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

  const handleAssetUploadProgress = (progress: CharacterAssetUploadProgress) => {
    setSubmitProgress({
      stage: 'uploading',
      loaded: progress.loaded,
      total: progress.total,
      percent: progress.percent
    })
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
  const isThumbnailGenerationLocked = !hasModelSource || isEditLoading || isPreviewGenerating || isModelPreparing || !isModelReadyForThumbnail || isRegenerateCoolingDown

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

    if (!isEditing && (!personalityFilled || !scenarioFilled)) {
      return false
    }

    const normalizedFirstMessage = formState.firstMessageText.trim()
    if (!isEditing && normalizedFirstMessage.length > fieldLimits.firstMessageMaxLength) {
      return false
    }
    if (!isEditing && !normalizedFirstMessage) {
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
    isEditing,
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
    if (visibility !== editInitialVisibility) {
      return true
    }
    // Any new local files imply a change.
    if (vrmFile || poseFile || previewImageFile || voiceFile) {
      return true
    }
    // Compare each text field against the initial loaded state.
    const keys: (keyof UploadVrmFormState)[] = [
      'fullName',
      'tagLine',
      'vroidFileUrl',
      'poseFileUrl',
      'previewImageUrl',
      'voiceFileUrl',
      'voiceFileName',
      'thumbnailReferenceImageUrl',
      'description'
    ]
    return keys.some((key) => formState[key] !== editInitialState[key])
  }, [editInitialState, editInitialVisibility, formState, isEditing, poseFile, previewImageFile, visibility, voiceFile, vrmFile])

  const usesOfficialPublicationControls = isAdmin && (!isEditing || editInitialOfficialListing === true)

  const canSubmitSaveMode = (saveMode: SaveMode) => {
    if (isSubmitting || !canSubmitForm) {
      return false
    }

    if (!isEditing) {
      return true
    }

    const targetStatus = getPublicationStatusForSaveMode(saveMode)
    const hasPublicationStatusChange = Boolean(targetStatus && editInitialStatus && editInitialStatus !== targetStatus)

    return isEditingDirty || hasPublicationStatusChange
  }


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
      setVoiceFile(null)
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
      setSubmitProgress(null)
      setIsModelPreparing(false)
      setModelLoadProgressPercent(0)
      setIsModelReadyForThumbnail(false)
      setIsCharacterFlipped(false)
      setVisibility('PUBLIC')
      setEditInitialState(null)
      setEditInitialVisibility(null)
      setEditInitialStatus(null)
      setEditInitialOfficialListing(null)
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
      setIsModelPreparing(false)
      setModelLoadProgressPercent(0)
      setIsModelReadyForThumbnail(false)
      setIsCharacterFlipped(false)
      setEditInitialState(null)
      setEditInitialVisibility(null)
      setEditInitialStatus(null)
      setEditInitialOfficialListing(null)
      previewGenerationRequestIdRef.current += 1
      setStatusMessage(null)
      setSubmitProgress(null)

      try {
        const payload = await getCharacterDetail(editCharacterId)

        if (isCancelled) {
          return
        }

        setVrmFile(null)
        setPoseFile(null)
        setPreviewImageFile(null)
        setVoiceFile(null)
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
          voiceFileUrl: payload.data.voiceFileUrl ?? '',
          voiceFileName: payload.data.voiceFileName ?? '',
          thumbnailReferenceImageUrl: payload.data.thumbnailReferenceImageUrl ?? '',
          description: payload.data.description ?? '',
          personality: '',
          scenario: '',
          exampleDialogs: '',
          firstMessageText: ''
        }

        setFormState(nextState)
        setEditInitialState(nextState)
        setVisibility(payload.data.visibility)
        setEditInitialVisibility(payload.data.visibility)
        setEditInitialStatus(payload.data.status)
        setEditInitialOfficialListing(payload.data.officialListing)
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
      handleFieldChange('thumbnailReferenceImageUrl', payload.data.referenceImageUrl)
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

  const handleSave = async (event: React.FormEvent<HTMLFormElement> | null, saveMode: SaveMode = 'user-default') => {
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

    if (!isEditing && (!personalityFilled || !scenarioFilled)) {
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

    if (!isEditing && normalizedFirstMessage.length > fieldLimits.firstMessageMaxLength) {
      setErrorMessage(`First message is too long (${normalizedFirstMessage.length} / ${fieldLimits.firstMessageMaxLength} characters).`)
      setStatusMessage(null)
      return
    }

    if (!isEditing && !normalizedFirstMessage) {
      setErrorMessage('Please enter a first message.')
      setStatusMessage(null)
      return
    }

    if (voiceFile) {
      if (!voiceFile.name.toLowerCase().endsWith('.wav')) {
        setErrorMessage('Voice upload must be a .wav file.')
        setStatusMessage(null)
        return
      }

      if (voiceFile.size > VOICE_FILE_MAX_BYTES) {
        setErrorMessage('Voice WAV exceeds max size limit (30MB).')
        setStatusMessage(null)
        return
      }
    }

    const firstMessageForApi: string = normalizedFirstMessage

    setIsSubmitting(true)
    setErrorMessage(null)
    setStatusMessage(null)
    setSubmitProgress(null)

    try {
      let vroidUrl = formState.vroidFileUrl.trim()
      let poseUrl = formState.poseFileUrl.trim()
      let previewUrl = formState.previewImageUrl.trim()
      let voiceUrl = formState.voiceFileUrl.trim()
      let voiceName = formState.voiceFileName.trim()
      const thumbnailReferenceImageUrl = formState.thumbnailReferenceImageUrl.trim()

      if (vrmFile || poseFile || previewImageFile || voiceFile) {
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
        if (voiceFile) {
          formData.append('voice', voiceFile)
        }

        setSubmitProgress({
          stage: 'uploading',
          loaded: 0,
          total: null,
          percent: 0
        })

        const uploadPayload = await uploadCharacterAssets(formData, handleAssetUploadProgress)

        setSubmitProgress((previousProgress) => ({
          stage: 'saving',
          loaded: previousProgress?.loaded ?? 0,
          total: previousProgress?.total ?? null,
          percent: 100
        }))

        if (uploadPayload.data.vroidFileUrl) {
          vroidUrl = uploadPayload.data.vroidFileUrl
        }

        if (uploadPayload.data.previewImageUrl) {
          previewUrl = uploadPayload.data.previewImageUrl
        }
        if (uploadPayload.data.poseFileUrl) {
          poseUrl = uploadPayload.data.poseFileUrl
        }
        if (uploadPayload.data.voiceFileUrl) {
          voiceUrl = uploadPayload.data.voiceFileUrl
          voiceName = uploadPayload.data.voiceFileName ?? voiceFile?.name ?? lastPathSegmentFromUrl(uploadPayload.data.voiceFileUrl)
        }
      } else {
        setSubmitProgress({
          stage: 'saving',
          loaded: 0,
          total: null,
          percent: null
        })
      }

      const personalityText = formState.personality.trim()
      const scenarioText = formState.scenario.trim()
      const exampleDialogsText = formState.exampleDialogs.trim()
      const publicationIntent = getPublicationIntentForSaveMode(saveMode)

      if (!isEditing && scenarioText.length < 30) {
        setErrorMessage('Scenario must be at least 30 characters.')
        setStatusMessage(null)
        return
      }

      const basePayload = {
        name: normalizedName,
        fullName: normalizedName,
        tagline: formState.tagLine.trim() || null,
        description: formState.description.trim() || null,
        poseFileUrl: poseUrl || null,
        previewImageUrl: previewUrl || null,
        voiceFileUrl: voiceUrl || null,
        voiceFileName: voiceName || null,
        thumbnailReferenceImageUrl: thumbnailReferenceImageUrl || null,
        visibility
      }

      const initialStory = {
        title: `${normalizedName} Introduction`,
        promptDescription: formState.description.trim(),
        personality: personalityText,
        scenario: scenarioText,
        firstMessage: firstMessageForApi,
        ...(exampleDialogsText ? { exampleDialogs: exampleDialogsText } : {}),
        scenarioStory: scenarioText,
        scenarioChat: firstMessageForApi,
        ...(voiceUrl ? { voiceFileUrl: voiceUrl } : {}),
        ...(voiceName ? { voiceFileName: voiceName } : {})
      }

      const updatePayload = {
        ...basePayload,
        ...(vrmFile ? { vroidFileUrl: vroidUrl || null } : {})
      }

      if (isAdmin) {
        if (isEditing) {
          await updateCharacter(editCharacterId, {
            ...updatePayload,
            ...(publicationIntent ? { publicationIntent } : {})
          })
        } else {
          await createCharacter({
            name: normalizedName,
            fullName: normalizedName,
            tagline: formState.tagLine.trim() || undefined,
            description: formState.description.trim() || undefined,
            initialStory,
            vroidFileUrl: vroidUrl || undefined,
            poseFileUrl: poseUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            voiceFileUrl: voiceUrl || undefined,
            voiceFileName: voiceName || undefined,
            thumbnailReferenceImageUrl: thumbnailReferenceImageUrl || undefined,
            ...(publicationIntent ? { publicationIntent } : {}),
            visibility
          })
        }
        setStatusMessage(
          publicationIntent === 'draft'
            ? 'Official character saved as draft.'
            : publicationIntent === 'publish'
              ? 'Official character published.'
              : 'Character updated.'
        )
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
            initialStory,
            vroidFileUrl: vroidUrl || undefined,
            poseFileUrl: poseUrl || undefined,
            previewImageUrl: previewUrl || undefined,
            voiceFileUrl: voiceUrl || undefined,
            voiceFileName: voiceName || undefined,
            thumbnailReferenceImageUrl: thumbnailReferenceImageUrl || undefined,
            visibility
          })
        }

        setStatusMessage(
          visibility === 'PRIVATE'
            ? isEditing
              ? 'Private character updated successfully.'
              : 'Private character saved. Only you can see and use it.'
            : isEditing
              ? 'Character updated successfully. It may require approval before being shared.'
              : 'Character submitted successfully. It is now waiting for admin approval.'
        )
      }

      setFormState(initialFormState)
      setVrmFile(null)
      setPoseFile(null)
      setPreviewImageFile(null)
      setVoiceFile(null)
      setSelectedVrmFileName(null)
      setThumbnailErrorMessage(null)
      setThumbnailStatusMessage(null)
      setPreviewGenerationDebugData(null)
      setPreviewGenerationCooldownUntil(null)
      setCooldownNow(Date.now())
      setHiddenCaptureRequestKey(0)
      setIsModelPreparing(false)
      setModelLoadProgressPercent(0)
      setIsModelReadyForThumbnail(false)
      setIsCharacterFlipped(false)
      setVisibility('PUBLIC')
      setEditInitialState(null)
      setEditInitialVisibility(null)
      setEditInitialStatus(null)
      setEditInitialOfficialListing(null)
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
      setSubmitProgress(null)
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

  const submitProgressPercent =
    submitProgress?.percent === null || submitProgress?.percent === undefined
      ? null
      : Math.min(100, Math.max(0, Math.round(submitProgress.percent)))
  const submitProgressLabel = submitProgress
    ? submitProgress.stage === 'uploading'
      ? submitProgressPercent === null
        ? 'Uploading files...'
        : `Uploading files... ${submitProgressPercent}%`
      : submitProgressPercent === null
        ? 'Saving character...'
        : 'Upload complete. Saving character...'
    : null
  const submitProgressBarWidth = submitProgressPercent ?? (submitProgress ? 100 : 0)
  const selectedVisibilityOption = visibilityOptions.find((option) => option.value === visibility) ?? visibilityOptions[2]
  const submitButtonLabel =
    isSubmitting
      ? isEditing
        ? 'Saving...'
        : visibility === 'PRIVATE'
          ? 'Saving...'
          : 'Submitting...'
      : isEditing
        ? 'Save Changes'
        : visibility === 'PRIVATE'
          ? 'Save Private VRM'
          : 'Submit VRM'

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
                  if (usesOfficialPublicationControls) {
                    event.preventDefault()
                    return
                  }
                  void handleSave(event)
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
                      setIsModelPreparing(Boolean(file))
                      setModelLoadProgressPercent(file ? 0 : 0)
                      setIsModelReadyForThumbnail(false)
                      setIsCharacterFlipped(false)
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
                      handleFieldChange('thumbnailReferenceImageUrl', '')
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
                      flipCharacter={isCharacterFlipped}
                      capturePreset="portrait-thumbnail"
                      captureRequestKey={hiddenCaptureRequestKey}
                      onModelLoadStateChange={({ isLoading, progressPercent, isReady }) => {
                        setIsModelPreparing(isLoading)
                        setModelLoadProgressPercent(progressPercent)
                        setIsModelReadyForThumbnail(isReady)
                      }}
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
                        {isModelPreparing
                          ? `Loading model... ${Math.min(100, Math.max(0, modelLoadProgressPercent))}%`
                          : isPreviewGenerating
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
                      disabled={isThumbnailGenerationLocked}
                      className="inline-flex h-10 min-w-[180px] items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 transition hover:border-white/35 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                    >
                      {isModelPreparing
                        ? `Loading... ${Math.min(100, Math.max(0, modelLoadProgressPercent))}%`
                        : isPreviewGenerating
                        ? 'Generating...'
                        : isRegenerateCoolingDown
                          ? `Regenerate (${formatSeconds(previewCooldownSecondsRemaining)})`
                          : 'Regenerate'}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsCharacterFlipped((previous) => !previous)}
                      disabled={!hasModelSource || isEditLoading || isModelPreparing}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-amber-200/30 bg-amber-300/10 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-100 transition hover:border-amber-100/45 hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                    >
                      {isCharacterFlipped ? 'Reset facing' : 'Flip character'}
                    </button>
                    <p className="text-xs text-white/55">
                      Hidden capture is currently using the {isCharacterFlipped ? 'flipped' : 'default'} facing direction.
                    </p>
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

                      {isAdmin && (hiddenReferencePreviewUrl || formState.thumbnailReferenceImageUrl.trim()) ? (
                        <div>
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Reference Image Used</p>
                          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={hiddenReferencePreviewUrl ?? formState.thumbnailReferenceImageUrl.trim()}
                              alt="Reference capture used for generation"
                              className="h-auto w-full object-cover"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (isAdmin && (hiddenReferencePreviewUrl || formState.thumbnailReferenceImageUrl.trim()) ? (
                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Reference Image Used</p>
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={hiddenReferencePreviewUrl ?? formState.thumbnailReferenceImageUrl.trim()}
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

                <div className="mt-5 rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Voice WAV</p>
                      <p className="mt-1 text-xs text-white/55">
                        {voiceFile
                          ? voiceFile.name
                          : formState.voiceFileName.trim()
                            ? formState.voiceFileName.trim()
                            : formState.voiceFileUrl.trim()
                              ? lastPathSegmentFromUrl(formState.voiceFileUrl)
                              : 'No custom voice selected.'}
                      </p>
                    </div>
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-white/20 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85 transition hover:border-white/35 hover:bg-white/10">
                      Choose WAV
                      <input
                        type="file"
                        accept=".wav,audio/wav,audio/x-wav"
                        className="sr-only"
                        disabled={isEditLoading || isSubmitting}
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          event.target.value = ''

                          if (!file) {
                            return
                          }

                          if (!file.name.toLowerCase().endsWith('.wav')) {
                            setErrorMessage('Voice upload must be a .wav file.')
                            return
                          }

                          if (file.size > VOICE_FILE_MAX_BYTES) {
                            setErrorMessage('Voice WAV exceeds max size limit (30MB).')
                            return
                          }

                          setVoiceFile(file)
                          setErrorMessage(null)
                        }}
                      />
                    </label>
                  </div>
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

                {!isEditing ? (
                  <>
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
                  </>
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

                {submitProgress && submitProgressLabel ? (
                  <div className="mt-4 rounded-md border border-ember-300/25 bg-ember-300/10 px-4 py-3" aria-live="polite">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-ember-50">{submitProgressLabel}</p>
                      {submitProgressPercent !== null ? (
                        <p className="shrink-0 text-[11px] font-semibold tabular-nums text-ember-100/80">
                          {submitProgressPercent}%
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-black/35"
                      role="progressbar"
                      aria-label="Character upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={submitProgressPercent ?? undefined}
                    >
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-ember-300 to-ember-500 transition-[width] duration-200 ${
                          submitProgressPercent === null ? 'animate-pulse' : ''
                        }`}
                        style={{ width: `${submitProgressBarWidth}%` }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-6 rounded-md border border-white/10 bg-black/25 p-4 md:p-5">
                  <label>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Visibility</span>
                    <select
                      className="mt-2 h-11 w-full rounded-md border border-white/15 bg-[#0f0c0c] px-3 text-sm text-white outline-none transition focus:border-ember-300 disabled:cursor-not-allowed disabled:opacity-60"
                      value={visibility}
                      disabled={isEditLoading || isSubmitting}
                      onChange={(event) => setVisibility(event.target.value as CharacterVisibility)}
                      aria-label="Select VRM visibility"
                    >
                      {visibilityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-white/55">{selectedVisibilityOption.description}</p>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {usesOfficialPublicationControls ? (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-md border border-white/20 bg-white/5 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:border-white/35 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-white/35"
                        aria-label="Save Draft"
                        disabled={!canSubmitSaveMode('admin-official-draft')}
                        onClick={() => {
                          void handleSave(null, 'admin-official-draft')
                        }}
                      >
                        {isSubmitting ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 min-w-[180px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55 disabled:hover:brightness-100"
                        aria-label="Publish"
                        disabled={!canSubmitSaveMode('admin-official-publish')}
                        onClick={() => {
                          void handleSave(null, 'admin-official-publish')
                        }}
                      >
                        {isSubmitting ? 'Publishing...' : 'Publish'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="submit"
                      className="inline-flex h-11 min-w-[220px] items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55 disabled:hover:brightness-100"
                      aria-label={submitButtonLabel}
                      disabled={!canSubmitSaveMode('user-default')}
                    >
                      {submitButtonLabel}
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
