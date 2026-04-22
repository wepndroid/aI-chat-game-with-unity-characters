'use client'

import AdminPageShell from '@/components/shared/admin-page-shell'
import UploadDropzone from '@/components/ui-elements/upload-dropzone'
import VrmLivePreview from '@/components/ui-elements/vrm-live-preview'
import { testImageGeneration, type ImageGenerationMode, type ImageGenerationTestResponse } from '@/lib/image-generation-api'
import { useEffect, useMemo, useState } from 'react'

type ImageGenerationFormState = {
  mode: ImageGenerationMode
  prompt: string
  negativePrompt: string
  width: string
  height: string
  steps: string
  cfgScale: string
  seed: string
  denoisingStrength: string
  samplerName: string
  batchSize: string
  nIter: string
  resizeMode: string
  restoreFaces: boolean
  tiling: boolean
  controlnetWeight: string
  controlnetModule: string
  controlnetModel: string
  extraParametersJson: string
}

const defaultPrompt = '1girl, anime, masterpiece, best quality'

const defaultNegativePrompt = 'blurry, low quality, deformed, ugly'

const createDefaultFormState = (mode: ImageGenerationMode = 'img2img'): ImageGenerationFormState => ({
  mode,
  prompt: defaultPrompt,
  negativePrompt: defaultNegativePrompt,
  width: '832',
  height: '1216',
  steps: mode === 'txt2img' ? '25' : '30',
  cfgScale: mode === 'prompt-pose' ? '8' : '7',
  seed: '-1',
  denoisingStrength: mode === 'prompt-pose' ? '0.75' : '0.65',
  samplerName: 'DPM++ 2M Karras',
  batchSize: '1',
  nIter: '1',
  resizeMode: '0',
  restoreFaces: false,
  tiling: false,
  controlnetWeight: '1.0',
  controlnetModule: 'openpose_full',
  controlnetModel: 'controlnet-openpose-sdxl',
  extraParametersJson: ''
})

const defaultFormState = createDefaultFormState()

const sectionClassName = 'rounded-2xl border border-white/10 bg-[#0c0f14]/95 p-4 sm:p-5'
const labelClassName = 'text-xs font-semibold uppercase tracking-[0.08em] text-white/60'
const inputClassName =
  'mt-1 w-full rounded-md border border-white/15 bg-[#0f1116]/95 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-ember-300 focus:ring-2 focus:ring-ember-400/25'
const helperClassName = 'mt-1 text-xs leading-relaxed text-white/45'

const stringifyJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

const safeNumber = (value: string) => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const resolveAspectRatio = (values: { width?: unknown; height?: unknown }) => {
  const width = typeof values.width === 'number' ? values.width : Number(values.width)
  const height = typeof values.height === 'number' ? values.height : Number(values.height)

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '832 / 1216'
  }

  return `${width} / ${height}`
}

const appendOptionalFormField = (formData: FormData, key: string, value: string) => {
  const trimmed = value.trim()
  if (trimmed.length > 0) {
    formData.append(key, trimmed)
  }
}

const ImageGenerationPage = () => {
  const [formState, setFormState] = useState<ImageGenerationFormState>(defaultFormState)
  const [vrmFile, setVrmFile] = useState<File | null>(null)
  const [selectedVrmFileName, setSelectedVrmFileName] = useState<string | null>(null)
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null)
  const [referenceImagePreviewUrl, setReferenceImagePreviewUrl] = useState<string | null>(null)
  const [referenceSourceLabel, setReferenceSourceLabel] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
  const [resultResponse, setResultResponse] = useState<ImageGenerationTestResponse['data'] | null>(null)

  useEffect(() => {
    return () => {
      if (referenceImagePreviewUrl) {
        URL.revokeObjectURL(referenceImagePreviewUrl)
      }
    }
  }, [referenceImagePreviewUrl])

  const replaceReferenceImage = (file: File | null, sourceLabel: string | null) => {
    setReferenceImageFile(file)
    setReferenceSourceLabel(sourceLabel)
    setReferenceImagePreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous)
      }

      return file ? URL.createObjectURL(file) : null
    })
  }

  const applyPreset = () => {
    setFormState((previous) => createDefaultFormState(previous.mode))
  }

  const clearAll = () => {
    setFormState(defaultFormState)
    setVrmFile(null)
    setSelectedVrmFileName(null)
    replaceReferenceImage(null, null)
    setGeneratedImages([])
    setResultResponse(null)
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const modeLabel =
    formState.mode === 'txt2img'
      ? 'Text-to-image'
      : formState.mode === 'img2img'
        ? 'Transform reference image'
        : formState.mode === 'pose'
          ? 'Change pose'
          : 'Keep character + prompt pose'
  const requiresInputImage = formState.mode !== 'txt2img'
  const inputImageLabel =
    formState.mode === 'pose' ? 'Pose image' : formState.mode === 'prompt-pose' ? 'Character image' : 'Reference image'
  const inputImageHelperText =
    formState.mode === 'pose'
      ? 'Upload or capture a pose guide image. The model will follow that pose while using your prompt for the final look.'
      : formState.mode === 'prompt-pose'
        ? 'Upload or capture the character image you want to preserve. Use the prompt to describe the new pose and scene.'
      : formState.mode === 'img2img'
        ? 'Upload or capture the source image you want to transform.'
        : 'Optional in text-to-image mode.'
  const hasReferenceImage = Boolean(referenceImageFile)
  const canGenerate = formState.prompt.trim().length > 0 && (!requiresInputImage || hasReferenceImage) && !isGenerating

  const requestPreview = useMemo(() => {
    const preview: Record<string, unknown> = {
      mode: formState.mode,
      prompt: formState.prompt,
      negativePrompt: formState.negativePrompt,
      width: safeNumber(formState.width),
      height: safeNumber(formState.height),
      steps: safeNumber(formState.steps),
      cfgScale: safeNumber(formState.cfgScale),
      seed: safeNumber(formState.seed),
      denoisingStrength: safeNumber(formState.denoisingStrength),
      samplerName: formState.samplerName.trim(),
      batchSize: safeNumber(formState.batchSize),
      nIter: safeNumber(formState.nIter),
      resizeMode: safeNumber(formState.resizeMode),
      restoreFaces: formState.restoreFaces,
      tiling: formState.tiling,
      controlnetWeight: safeNumber(formState.controlnetWeight),
      controlnetModule: formState.controlnetModule.trim(),
      controlnetModel: formState.controlnetModel.trim()
    }

    if (formState.mode === 'txt2img') {
      delete preview.denoisingStrength
      delete preview.resizeMode
      delete preview.controlnetWeight
      delete preview.controlnetModule
      delete preview.controlnetModel
    }

    if (formState.mode === 'img2img') {
      delete preview.batchSize
      delete preview.nIter
      delete preview.tiling
      delete preview.controlnetWeight
      delete preview.controlnetModule
      delete preview.controlnetModel
    }

    if (formState.mode === 'pose') {
      delete preview.denoisingStrength
      delete preview.batchSize
      delete preview.nIter
      delete preview.resizeMode
      delete preview.restoreFaces
      delete preview.tiling
    }

    if (formState.mode === 'prompt-pose') {
      delete preview.samplerName
      delete preview.batchSize
      delete preview.nIter
      delete preview.resizeMode
      delete preview.restoreFaces
      delete preview.tiling
      delete preview.controlnetWeight
      delete preview.controlnetModule
      delete preview.controlnetModel
    }

    if (formState.extraParametersJson.trim().length > 0) {
      preview.extraParametersJson = formState.extraParametersJson
    }

    if (referenceImageFile) {
      preview[
        inputImageLabel === 'Pose image' ? 'poseImage' : inputImageLabel === 'Character image' ? 'characterImage' : 'referenceImage'
      ] = {
        name: referenceImageFile.name,
        source: referenceSourceLabel
      }
    }

    if (vrmFile) {
      preview.vrmSource = vrmFile.name
    }

    return stringifyJson(preview)
  }, [formState, inputImageLabel, referenceImageFile, referenceSourceLabel, vrmFile])

  const generatedInfoText = useMemo(() => {
    if (!resultResponse) {
      return ''
    }

    return stringifyJson({
      mode: resultResponse.mode,
      imageCount: resultResponse.imageCount,
      info: resultResponse.info,
      parameters: resultResponse.parameters
    })
  }, [resultResponse])

  const outputAspectRatio = useMemo(() => {
    const parameters = (resultResponse?.parameters ?? {}) as Record<string, unknown>
    return resolveAspectRatio({
      width: parameters.width ?? formState.width,
      height: parameters.height ?? formState.height
    })
  }, [formState.height, formState.width, resultResponse])

  const handleGenerate = async () => {
    if (isGenerating) {
      return
    }

    if (requiresInputImage && !referenceImageFile) {
      setErrorMessage(
        formState.mode === 'pose'
          ? 'Please add a pose image or capture one from a VRM before running pose mode.'
          : formState.mode === 'prompt-pose'
            ? 'Please add a character image or capture one from a VRM before running prompt-pose mode.'
          : 'Please add a reference image or capture one from a VRM before running img2img.'
      )
      setSuccessMessage(null)
      return
    }

    setIsGenerating(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const formData = new FormData()
      formData.append('mode', formState.mode)
      formData.append('prompt', formState.prompt)
      formData.append('negativePrompt', formState.negativePrompt)
      formData.append('width', formState.width.trim())
      formData.append('height', formState.height.trim())
      formData.append('steps', formState.steps.trim())
      formData.append('cfgScale', formState.cfgScale.trim())
      formData.append('seed', formState.seed.trim())
      if (formState.mode === 'txt2img') {
        appendOptionalFormField(formData, 'samplerName', formState.samplerName)
        appendOptionalFormField(formData, 'batchSize', formState.batchSize)
        appendOptionalFormField(formData, 'nIter', formState.nIter)
        formData.append('restoreFaces', String(formState.restoreFaces))
        formData.append('tiling', String(formState.tiling))
      }

      if (formState.mode === 'img2img') {
        appendOptionalFormField(formData, 'samplerName', formState.samplerName)
        appendOptionalFormField(formData, 'denoisingStrength', formState.denoisingStrength)
        appendOptionalFormField(formData, 'resizeMode', formState.resizeMode)
        formData.append('restoreFaces', String(formState.restoreFaces))
      }

      if (formState.mode === 'pose') {
        appendOptionalFormField(formData, 'samplerName', formState.samplerName)
        appendOptionalFormField(formData, 'controlnetWeight', formState.controlnetWeight)
        appendOptionalFormField(formData, 'controlnetModule', formState.controlnetModule)
        appendOptionalFormField(formData, 'controlnetModel', formState.controlnetModel)
      }

      if (formState.mode === 'prompt-pose') {
        appendOptionalFormField(formData, 'denoisingStrength', formState.denoisingStrength)
      }

      appendOptionalFormField(formData, 'extraParametersJson', formState.extraParametersJson)

      if (referenceImageFile) {
        formData.append('referenceImage', referenceImageFile)
      }

      const payload = await testImageGeneration(formData)
      const resolvedImages = payload.data.images.map((imageBase64) => `data:image/png;base64,${imageBase64}`)

      setGeneratedImages(resolvedImages)
      setResultResponse(payload.data)
      setSuccessMessage(`Generated ${payload.data.imageCount} image${payload.data.imageCount === 1 ? '' : 's'}.`)
    } catch (error) {
      setGeneratedImages([])
      setResultResponse(null)
      setErrorMessage(error instanceof Error ? error.message : 'Image generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const resultImage = generatedImages[0] ?? null

  return (
    <AdminPageShell activeKey="image-lab" contentClassName="min-w-0 p-4 pb-8 sm:p-6 xl:p-8 2xl:p-10">
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-heading)] text-[24px] font-normal leading-tight text-white sm:text-[29px] sm:leading-none">
            Image Generation Lab
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[#95a6c1]">
            Test the full workflow here: upload a VRM, capture a high-resolution guide image from the 3D preview, and run text-to-image, reference transforms, pose-guided generation, or character-preserving prompt-pose generation through the admin proxy.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={applyPreset}
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/85 transition hover:border-white/30 hover:bg-white/10"
          >
            Load preset
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-transparent px-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70 transition hover:border-white/30 hover:bg-white/5 hover:text-white"
          >
            Reset form
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-5 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="mt-5 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      ) : null}

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <div className="space-y-5 min-w-0">
          <section className={sectionClassName}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className={labelClassName}>Generation mode</p>
                <p className="mt-1 text-sm text-white/60">{modeLabel}</p>
              </div>
              <div className="inline-flex w-full rounded-lg border border-white/10 bg-black/20 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setFormState((previous) => ({ ...previous, mode: 'txt2img' }))}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition sm:flex-none ${
                    formState.mode === 'txt2img' ? 'bg-ember-400 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Text to image
                </button>
                <button
                  type="button"
                  onClick={() => setFormState((previous) => ({ ...previous, mode: 'img2img' }))}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition sm:flex-none ${
                    formState.mode === 'img2img' ? 'bg-ember-400 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Image to image
                </button>
                <button
                  type="button"
                  onClick={() => setFormState((previous) => ({ ...previous, mode: 'pose' }))}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition sm:flex-none ${
                    formState.mode === 'pose' ? 'bg-ember-400 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Change pose
                </button>
                <button
                  type="button"
                  onClick={() => setFormState((previous) => ({ ...previous, mode: 'prompt-pose' }))}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] transition sm:flex-none ${
                    formState.mode === 'prompt-pose' ? 'bg-ember-400 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Prompt pose
                </button>
              </div>
            </div>

            <p className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-relaxed text-white/65">
              {formState.mode === 'txt2img'
                ? 'Pure prompt-based generation. Use batch size and iterations if you want multiple outputs in one request.'
                : formState.mode === 'img2img'
                  ? 'Transforms the uploaded input image. Denoising strength controls how much of the source gets changed.'
                  : formState.mode === 'pose'
                    ? 'Uses a pose guide image with ControlNet. ControlNet weight decides how strictly the pose is enforced.'
                    : 'Uses the uploaded character image to preserve identity while the prompt describes the new pose, framing, and scene.'}
            </p>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
              <label className="block min-w-0">
                <span className={labelClassName}>Prompt</span>
                <textarea
                  className={`${inputClassName} min-h-[200px] resize-y`}
                  value={formState.prompt}
                  onChange={(event) => setFormState((previous) => ({ ...previous, prompt: event.target.value }))}
                  placeholder="Describe the image you want to generate."
                />
                <p className={helperClassName}>Suggested order: style, subject, body details, lighting, camera, quality.</p>
              </label>

              <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
                <p className={labelClassName}>Current input image</p>
                {referenceImagePreviewUrl ? (
                  <>
                    <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/25">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={referenceImagePreviewUrl} alt="Reference preview" className="h-[260px] w-full object-contain bg-[#090b10]" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-white">{referenceImageFile?.name ?? inputImageLabel}</p>
                    <p className="mt-1 text-xs text-white/55">{referenceSourceLabel ?? `${inputImageLabel} ready`}</p>
                    <button
                      type="button"
                      onClick={() => replaceReferenceImage(null, null)}
                      className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                    >
                      Clear reference
                    </button>
                  </>
                ) : (
                  <div className="mt-3 flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#090b10] px-6 text-center text-sm leading-relaxed text-white/40">
                    {requiresInputImage
                      ? `Upload a manual ${inputImageLabel.toLowerCase()} or capture one from the VRM preview.`
                      : 'Text-to-image does not require an input image, but you can still prepare one before switching modes.'}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="block min-w-0">
                <span className={labelClassName}>Negative prompt</span>
                <textarea
                  className={`${inputClassName} min-h-[120px] resize-y`}
                  value={formState.negativePrompt}
                  onChange={(event) => setFormState((previous) => ({ ...previous, negativePrompt: event.target.value }))}
                  placeholder="What to avoid."
                />
              </label>
              <label className="block min-w-0">
                <span className={labelClassName}>Extra parameters JSON</span>
                <textarea
                  className={`${inputClassName} min-h-[120px] resize-y font-mono text-[12px]`}
                  value={formState.extraParametersJson}
                  onChange={(event) => setFormState((previous) => ({ ...previous, extraParametersJson: event.target.value }))}
                  placeholder='{"sampler_name":"DPM++ SDE Karras","eta":0.0}'
                />
                <p className={helperClassName}>Optional raw JSON merged into the backend request for testing extra knobs.</p>
              </label>
            </div>
          </section>

          <section className={sectionClassName}>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Core settings</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label>
                <span className={labelClassName}>Width</span>
                <input className={inputClassName} value={formState.width} onChange={(event) => setFormState((previous) => ({ ...previous, width: event.target.value }))} />
              </label>
              <label>
                <span className={labelClassName}>Height</span>
                <input className={inputClassName} value={formState.height} onChange={(event) => setFormState((previous) => ({ ...previous, height: event.target.value }))} />
              </label>
              <label>
                <span className={labelClassName}>Steps</span>
                <input className={inputClassName} value={formState.steps} onChange={(event) => setFormState((previous) => ({ ...previous, steps: event.target.value }))} />
              </label>
              <label>
                <span className={labelClassName}>CFG scale</span>
                <input className={inputClassName} value={formState.cfgScale} onChange={(event) => setFormState((previous) => ({ ...previous, cfgScale: event.target.value }))} />
              </label>
              <label>
                <span className={labelClassName}>Seed</span>
                <input className={inputClassName} value={formState.seed} onChange={(event) => setFormState((previous) => ({ ...previous, seed: event.target.value }))} />
              </label>
              <label>
                <span className={labelClassName}>Sampler name</span>
                <input
                  className={inputClassName}
                  value={formState.samplerName}
                  onChange={(event) => setFormState((previous) => ({ ...previous, samplerName: event.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className={sectionClassName}>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Mode-specific controls</h2>
                <p className={helperClassName}>
                  {formState.mode === 'txt2img'
                    ? 'Batch controls only apply in text-to-image mode.'
                    : formState.mode === 'img2img'
                      ? 'Resize mode and denoising shape how the source image gets transformed.'
                      : formState.mode === 'pose'
                        ? 'ControlNet settings decide how tightly the model follows the uploaded pose image.'
                        : 'Prompt-pose uses the character image plus your prompt. Denoising controls how far it can move from the source look.'}
                </p>
              </div>
            </div>

            {formState.mode === 'txt2img' ? (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label>
                    <span className={labelClassName}>Batch size</span>
                    <input
                      className={inputClassName}
                      value={formState.batchSize}
                      onChange={(event) => setFormState((previous) => ({ ...previous, batchSize: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className={labelClassName}>Iterations</span>
                    <input
                      className={inputClassName}
                      value={formState.nIter}
                      onChange={(event) => setFormState((previous) => ({ ...previous, nIter: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formState.restoreFaces}
                      onChange={(event) => setFormState((previous) => ({ ...previous, restoreFaces: event.target.checked }))}
                    />
                    Restore faces
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formState.tiling}
                      onChange={(event) => setFormState((previous) => ({ ...previous, tiling: event.target.checked }))}
                    />
                    Tiling
                  </label>
                </div>
              </>
            ) : null}

            {formState.mode === 'img2img' ? (
              <>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <label>
                    <span className={labelClassName}>Denoising strength</span>
                    <input
                      className={inputClassName}
                      value={formState.denoisingStrength}
                      onChange={(event) => setFormState((previous) => ({ ...previous, denoisingStrength: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span className={labelClassName}>Resize mode</span>
                    <input
                      className={inputClassName}
                      value={formState.resizeMode}
                      onChange={(event) => setFormState((previous) => ({ ...previous, resizeMode: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/70">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formState.restoreFaces}
                      onChange={(event) => setFormState((previous) => ({ ...previous, restoreFaces: event.target.checked }))}
                    />
                    Restore faces
                  </label>
                </div>
              </>
            ) : null}

            {formState.mode === 'pose' ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label>
                  <span className={labelClassName}>ControlNet weight</span>
                  <input
                    className={inputClassName}
                    value={formState.controlnetWeight}
                    onChange={(event) => setFormState((previous) => ({ ...previous, controlnetWeight: event.target.value }))}
                  />
                </label>
                <label>
                  <span className={labelClassName}>ControlNet module</span>
                  <input
                    className={inputClassName}
                    value={formState.controlnetModule}
                    onChange={(event) => setFormState((previous) => ({ ...previous, controlnetModule: event.target.value }))}
                  />
                </label>
                <label>
                  <span className={labelClassName}>ControlNet model</span>
                  <input
                    className={inputClassName}
                    value={formState.controlnetModel}
                    onChange={(event) => setFormState((previous) => ({ ...previous, controlnetModel: event.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            {formState.mode === 'prompt-pose' ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label>
                  <span className={labelClassName}>Denoising strength</span>
                  <input
                    className={inputClassName}
                    value={formState.denoisingStrength}
                    onChange={(event) => setFormState((previous) => ({ ...previous, denoisingStrength: event.target.value }))}
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex h-11 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-6 text-[12px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-neutral-600 disabled:to-neutral-700 disabled:text-white/55 disabled:hover:brightness-100"
            >
              {isGenerating ? 'Generating...' : requiresInputImage && !hasReferenceImage ? `Add ${inputImageLabel.toLowerCase()} first` : 'Generate'}
            </button>
            <button
              type="button"
              onClick={() => {
                setGeneratedImages([])
                setResultResponse(null)
                setErrorMessage(null)
                setSuccessMessage(null)
              }}
              className="inline-flex h-11 items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-[12px] font-bold uppercase tracking-[0.08em] text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
            >
              Clear result
            </button>
          </section>
        </div>

        <div className="space-y-5 min-w-0 2xl:sticky 2xl:top-24 2xl:self-start">
          <section className={sectionClassName}>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Reference workflow</h2>
            <p className={helperClassName}>Upload a VRM to test the real pipeline, or drop in a manual input image for prompt tuning and pose guidance.</p>

            <div className="mt-4 grid gap-4 xl:grid-cols-2 2xl:grid-cols-1">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className={labelClassName}>VRM source</p>
                <div className="mt-3">
                  <UploadDropzone
                    onFileSelect={(file) => {
                      setVrmFile(file)
                      setSelectedVrmFileName(file?.name ?? null)
                    }}
                    selectedFileName={selectedVrmFileName}
                    className="h-[220px] max-w-none aspect-auto"
                  />
                </div>
                {vrmFile ? (
                  <button
                    type="button"
                    onClick={() => {
                      setVrmFile(null)
                      setSelectedVrmFileName(null)
                    }}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-md border border-white/15 bg-white/5 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/80 transition hover:border-white/30 hover:bg-white/10 hover:text-white"
                  >
                    Remove VRM
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className={labelClassName}>{inputImageLabel}</p>
                <label className="mt-3 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#090b10] px-4 py-5 text-center transition hover:border-ember-300/60 hover:bg-white/5">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      replaceReferenceImage(file, file ? 'Uploaded manually' : null)
                      event.target.value = ''
                    }}
                  />
                  <p className="text-sm font-semibold text-white/85">
                    {referenceImageFile && referenceSourceLabel === 'Uploaded manually' ? referenceImageFile.name : `Upload a ${inputImageLabel.toLowerCase()}`}
                  </p>
                  <p className="mt-2 text-xs text-white/50">{inputImageHelperText}</p>
                </label>
              </div>
            </div>

            {vrmFile ? (
              <div className="mt-5">
                <div className="mb-3 rounded-lg border border-ember-300/20 bg-ember-300/8 px-3 py-2 text-xs leading-relaxed text-ember-100">
                  As soon as the VRM finishes loading, the lab automatically captures a high-resolution framed preview and uses it as the active input image. You can still capture again manually any time.
                </div>
                <VrmLivePreview
                  selectedFile={vrmFile}
                  onThumbnailGenerated={(file) => {
                    replaceReferenceImage(file, `Captured from VRM: ${selectedVrmFileName ?? file.name}`)
                    setFormState((previous) => (previous.mode === 'txt2img' ? { ...previous, mode: 'img2img' } : previous))
                  }}
                  wideLayout
                  autoCaptureOnLoad
                />
              </div>
            ) : null}
          </section>

          <section className={sectionClassName}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Output</h2>
              <p className="text-xs uppercase tracking-[0.08em] text-white/45">{resultResponse ? `${resultResponse.imageCount} image(s)` : 'No output yet'}</p>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
              {resultImage ? (
                <div className="flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,99,19,0.08),rgba(4,6,10,0.92)_62%)]" style={{ aspectRatio: outputAspectRatio }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={resultImage} alt="Generated result" className="max-h-[78vh] w-full object-contain" />
                </div>
              ) : (
                <div className="flex items-center justify-center px-8 text-center text-sm leading-relaxed text-white/40" style={{ aspectRatio: outputAspectRatio }}>
                  Generated images will appear here. For the full workflow test, upload a VRM, capture the thumbnail, then run the mode you want to compare.
                </div>
              )}
            </div>

            {generatedImages.length > 1 ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {generatedImages.map((imageUrl, index) => (
                  <a
                    key={`${imageUrl.slice(0, 18)}-${index}`}
                    href={imageUrl}
                    download={`image-generation-${index + 1}.png`}
                    className="overflow-hidden rounded-lg border border-white/10 bg-black/25"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt={`Generated thumbnail ${index + 1}`} className="h-24 w-full object-contain bg-black/30" />
                  </a>
                ))}
              </div>
            ) : null}
          </section>

          <section className={sectionClassName}>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Request preview</h2>
            <p className={helperClassName}>This is the payload shape about to go to the backend proxy.</p>
            <pre className="mt-4 max-h-[260px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-[11px] leading-relaxed text-white/70">
              {requestPreview}
            </pre>
          </section>

          <section className={sectionClassName}>
            <h2 className="font-[family-name:var(--font-heading)] text-[18px] font-normal text-white">Response details</h2>
            <p className={helperClassName}>Use this to compare model behavior as you iterate on settings.</p>
            <pre className="mt-4 max-h-[260px] overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-[11px] leading-relaxed text-white/70">
              {generatedInfoText || 'No response yet.'}
            </pre>
          </section>
        </div>
      </div>
    </AdminPageShell>
  )
}

export default ImageGenerationPage
