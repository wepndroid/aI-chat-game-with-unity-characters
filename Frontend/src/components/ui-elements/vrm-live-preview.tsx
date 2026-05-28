'use client'

import { createVrmGLTFLoader, getVrmFromGltfUserData, loadVrmRuntime, optimizeVrmSceneForRendering } from '@/lib/vrm-three'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { VRMAnimation } from '@pixiv/three-vrm-animation'
import type { VRM, VrmLoadedGltf } from '@/lib/vrm-three'

type VrmLivePreviewProps = {
  selectedFile: File | null
  selectedPoseFile?: File | null
  existingVrmUrl?: string | null
  existingPoseUrl?: string | null
  existingPreviewImageUrl?: string | null
  onThumbnailGenerated: (file: File) => void
  onModelLoadStateChange?: (state: { isLoading: boolean; progressPercent: number; isReady: boolean }) => void
  poseControls?: ReactNode
  autoPoseUrls?: string[]
  wideLayout?: boolean
  autoCaptureOnLoad?: boolean
  headless?: boolean
  debugViewport?: boolean
  flipCharacter?: boolean
  capturePreset?: 'default' | 'portrait-thumbnail'
  captureRequestKey?: number
}

const MAX_PREVIEW_PIXEL_RATIO = 1.25
const ENABLE_UPLOAD_PREVIEW_POST_PROCESSING = true
const SMALL_THUMBNAIL_WIDTH = 240
const SMALL_THUMBNAIL_HEIGHT = 400
const LARGE_THUMBNAIL_WIDTH = 1000
const LARGE_THUMBNAIL_HEIGHT = 1400
const DEFAULT_AUTO_CAPTURE_SETTLE_DELAY_MS = 220
const PORTRAIT_AUTO_CAPTURE_SETTLE_DELAY_MS = 900

const formatDiagnosticError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const disposeMaterial = (material: THREE.Material) => {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}

const createUnlitMaterial = (material: THREE.Material) => {
  const source = material as THREE.MeshStandardMaterial & {
    alphaMap?: THREE.Texture | null
    map?: THREE.Texture | null
    color?: THREE.Color
  }

  return new THREE.MeshBasicMaterial({
    name: `${material.name || 'vrm-material'}-unlit-debug`,
    map: source.map ?? null,
    alphaMap: source.alphaMap ?? null,
    color: source.color?.clone() ?? new THREE.Color('#ffffff'),
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    alphaTest: material.alphaTest,
    depthWrite: material.depthWrite,
    depthTest: material.depthTest
  })
}

const applyMaterialArray = (mesh: THREE.Mesh, materials: THREE.Material | THREE.Material[]) => {
  mesh.material = materials
  if (Array.isArray(materials)) {
    for (const material of materials) {
      material.needsUpdate = true
    }
    return
  }

  materials.needsUpdate = true
}

const createPreviewPoseClip = (clip: THREE.AnimationClip) => {
  const filteredTracks = clip.tracks.filter((track) => {
    const lowerName = track.name.toLowerCase()
    return !lowerName.endsWith('.position')
  })

  return new THREE.AnimationClip(`${clip.name || 'vrma'}-preview-pose`, clip.duration, filteredTracks)
}

const loadDanceVrmaClip = async (vrm: VRM, animationUrl: string) => {
  const [{ GLTFLoader }, { VRMAnimationLoaderPlugin, createVRMAnimationClip }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm-animation')
  ])

  const vrmaLoader = new GLTFLoader()
  vrmaLoader.crossOrigin = 'anonymous'
  vrmaLoader.register((parser) => new VRMAnimationLoaderPlugin(parser))

  const vrma = await vrmaLoader.loadAsync(animationUrl)
  const vrmAnimations = (vrma.userData as { vrmAnimations?: VRMAnimation[] }).vrmAnimations
  const sourceVrmAnimation: VRMAnimation | undefined = vrmAnimations?.[0]

  if (!sourceVrmAnimation) {
    throw new Error('No VRM animation clip found in dance.vrma')
  }

  const clip = createVRMAnimationClip(sourceVrmAnimation, vrm)
  return createPreviewPoseClip(clip)
}

const RotateIcon = () => (
  <svg viewBox="0 0 122.88 122.88" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M64.89,32.65,59.81,58.5l-5.16-7.77C43.54,55.19,37.3,62.54,36.38,73.86c-9.13-16-3.59-30.25,8-38.63L39.09,27.3l25.8,5.35ZM61.44,0A61.46,61.46,0,1,1,18,18,61.21,61.21,0,0,1,61.44,0ZM97.56,25.32a51.08,51.08,0,1,0,15,36.12,51,51,0,0,0-15-36.12ZM56.64,91.8,61.72,66l5.16,7.77C78,69.26,84.23,61.91,85.15,50.59c9.13,16,3.59,30.25-8,38.63l5.26,7.93L56.64,91.8Z"
    />
  </svg>
)

const MoveIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3v18M3 12h18" strokeLinecap="round" />
    <path
      d="m12 3 2.5 2.5M12 3 9.5 5.5M12 21l2.5-2.5M12 21l-2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const CameraIcon = () => (
  // Video camera icon (matches reference image 3).
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <path d="M14 7H5a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h9a3 3 0 0 0 3-3v-.7l3.2 1.9A1.6 1.6 0 0 0 24 14V10a1.6 1.6 0 0 0-2.4-1.4L18 10.5V10a3 3 0 0 0-3-3Z" />
  </svg>
)

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <path d="M9 7.2v9.6c0 .8.9 1.3 1.6.9l8.1-4.8c.7-.4.7-1.4 0-1.8l-8.1-4.8c-.7-.4-1.6.1-1.6.9Z" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
    <path d="M7.5 6.5c0-.6.4-1 1-1h1.5c.6 0 1 .4 1 1v11c0 .6-.4 1-1 1H8.5c-.6 0-1-.4-1-1v-11Zm8 0c0-.6.4-1 1-1H18c.6 0 1 .4 1 1v11c0 .6-.4 1-1 1h-1.5c-.6 0-1-.4-1-1v-11Z" />
  </svg>
)

const CaptureIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
    <path
      d="M7.5 8h2l1-1.6h3l1 1.6h2A2.5 2.5 0 0 1 19 10.5v6A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-6A2.5 2.5 0 0 1 7.5 8Z"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="13.5" r="2.3" />
  </svg>
)

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3v10m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 16.5v1.2A2.3 2.3 0 0 0 6.3 20h11.4a2.3 2.3 0 0 0 2.3-2.3v-1.2" strokeLinecap="round" />
  </svg>
)

const SwitchIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M7 7h11l-2.2-2.2M18 17H7l2.2 2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MirrorIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 4v16M6 8c2 0 3 1.8 3 4s-1 4-3 4M18 8c-2 0-3 1.8-3 4s1 4 3 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const VrmLivePreview = ({
  selectedFile,
  selectedPoseFile,
  existingVrmUrl,
  existingPoseUrl,
  existingPreviewImageUrl,
  onThumbnailGenerated,
  onModelLoadStateChange,
  poseControls,
  autoPoseUrls,
  wideLayout = false,
  autoCaptureOnLoad = false,
  headless = false,
  debugViewport = false,
  flipCharacter = false,
  capturePreset = 'default',
  captureRequestKey = 0
}: VrmLivePreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const composerRef = useRef<{
    composer: { render: () => void; setSize: (w: number, h: number) => void; dispose?: () => void }
    bloomPass: { strength: number; threshold: number; radius: number }
    vignettePass: { uniforms: Record<string, { value: unknown }> }
    fxaaPass?: { material?: { uniforms?: Record<string, { value: unknown }> } }
  } | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)
  const clipRef = useRef<THREE.AnimationClip | null>(null)
  const vrmRef = useRef<VRM | null>(null)
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null)
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null)
  const debugMeshOriginalMaterialsRef = useRef<Array<{ mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }>>([])
  const controlModeRef = useRef<'rotate' | 'move'>('rotate')
  const loadGenerationRef = useRef(0)
  const isPlayingRef = useRef(true)
  const isCameraFollowEnabledRef = useRef(false)
  const isDraggingModelRef = useRef(false)
  const lookAtTargetRef = useRef<THREE.Object3D | null>(null)
  const anchoredHipsWorldPositionRef = useRef<THREE.Vector3 | null>(null)
  const initialCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [animationMessage, setAnimationMessage] = useState<string | null>(null)
  const hasModelSource = Boolean(selectedFile || existingVrmUrl?.trim())
  const [isPlaying, setIsPlaying] = useState(true)
  const [capturedSmallUrl, setCapturedSmallUrl] = useState<string | null>(null)
  const [capturedLargeUrl, setCapturedLargeUrl] = useState<string | null>(null)
  const capturedSmallFileRef = useRef<File | null>(null)
  const capturedLargeFileRef = useRef<File | null>(null)
  const [isMirroringSmall, setIsMirroringSmall] = useState(false)
  const [isMirroringLarge, setIsMirroringLarge] = useState(false)
  const [selectedPreviewSize, setSelectedPreviewSize] = useState<'small' | 'large'>('large')
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [modelLoadProgressPercent, setModelLoadProgressPercent] = useState(0)
  const [isModelReadyForThumbnail, setIsModelReadyForThumbnail] = useState(false)
  const [controlMode, setControlMode] = useState<'rotate' | 'move'>('rotate')
  const [isCameraFollowEnabled, setIsCameraFollowEnabled] = useState(false)

  const [bloomStrength, setBloomStrength] = useState(capturePreset === 'portrait-thumbnail' ? 0 : 0.1)
  const [bloomThreshold, setBloomThreshold] = useState(capturePreset === 'portrait-thumbnail' ? 1.41 : 0.17)
  const [bloomRadius, setBloomRadius] = useState(2)
  const [vignetteDarkness, setVignetteDarkness] = useState(capturePreset === 'portrait-thumbnail' ? 0 : 1.2)
  const [backgroundMode, setBackgroundMode] = useState<'project' | 'solid' | 'transparent'>(
    capturePreset === 'portrait-thumbnail' ? 'solid' : 'project'
  )
  const [backgroundColor, setBackgroundColor] = useState(capturePreset === 'portrait-thumbnail' ? '#000000' : '#101722')
  const [keyLightColor, setKeyLightColor] = useState('#ffffff')
  const [fillLightColor, setFillLightColor] = useState('#6ba7ff')
  const [keyLightIntensity, setKeyLightIntensity] = useState(2.7)
  const [fillLightIntensity, setFillLightIntensity] = useState(0.5)
  const [useUnlitDebug, setUseUnlitDebug] = useState(false)
  const [autoPoseUrl, setAutoPoseUrl] = useState<string | null>(null)
  const autoCaptureTimeoutRef = useRef<number | null>(null)
  const autoCaptureGenerationRef = useRef(0)
  const lastCaptureRequestKeyRef = useRef(captureRequestKey)
  const handleCaptureThumbnailRef = useRef<() => void>(() => {})
  const previewFrameClassName = wideLayout ? 'max-w-[500px] 2xl:max-w-[540px]' : 'max-w-[360px]'
  const supportingPanelClassName = wideLayout ? 'max-w-[460px] 2xl:max-w-[500px]' : 'max-w-[330px]'
  const smallThumbnailClassName = wideLayout ? 'max-w-[180px]' : 'max-w-[150px]'
  const largeThumbnailClassName = wideLayout ? 'max-w-[280px]' : 'max-w-[230px]'
  const previewFrameStyle = { aspectRatio: `${LARGE_THUMBNAIL_WIDTH} / ${LARGE_THUMBNAIL_HEIGHT}` }
  const smallThumbnailStyle = { aspectRatio: `${SMALL_THUMBNAIL_WIDTH} / ${SMALL_THUMBNAIL_HEIGHT}` }
  const largeThumbnailStyle = { aspectRatio: `${LARGE_THUMBNAIL_WIDTH} / ${LARGE_THUMBNAIL_HEIGHT}` }
  const isInteractiveViewport = !headless && !debugViewport

  useEffect(() => {
    onModelLoadStateChange?.({
      isLoading: isModelLoading,
      progressPercent: modelLoadProgressPercent,
      isReady: isModelReadyForThumbnail
    })
  }, [isModelLoading, isModelReadyForThumbnail, modelLoadProgressPercent, onModelLoadStateChange])

  useEffect(() => {
    if (hasModelSource) {
      return
    }

    setIsModelLoading(false)
    setModelLoadProgressPercent(0)
    setIsModelReadyForThumbnail(false)
  }, [hasModelSource])

  useEffect(() => {
    isCameraFollowEnabledRef.current = isCameraFollowEnabled
  }, [isCameraFollowEnabled])

  useEffect(() => {
    controlModeRef.current = controlMode
  }, [controlMode])

  useEffect(() => {
    if (!vrmRef.current) {
      return
    }

    vrmRef.current.scene.rotation.y = flipCharacter ? Math.PI : 0
    vrmRef.current.scene.updateMatrixWorld(true)
  }, [flipCharacter])

  useEffect(() => {
    const entries = debugMeshOriginalMaterialsRef.current
    if (entries.length === 0) {
      return
    }

    for (const entry of entries) {
      if (useUnlitDebug) {
        const debugMaterial = Array.isArray(entry.material)
          ? entry.material.map((material) => createUnlitMaterial(material))
          : createUnlitMaterial(entry.material)
        applyMaterialArray(entry.mesh, debugMaterial)
        continue
      }

      const currentMaterial = entry.mesh.material
      if (Array.isArray(currentMaterial)) {
        for (const material of currentMaterial) {
          if (material.name.endsWith('-unlit-debug')) {
            material.dispose()
          }
        }
      } else if (currentMaterial.name.endsWith('-unlit-debug')) {
        currentMaterial.dispose()
      }

      applyMaterialArray(entry.mesh, entry.material)
    }
  }, [useUnlitDebug])

  useEffect(() => {
    const trimmedExistingPoseUrl = existingPoseUrl?.trim() ?? ''
    if (trimmedExistingPoseUrl || !hasModelSource || !autoPoseUrls || autoPoseUrls.length === 0) {
      setAutoPoseUrl(null)
      return
    }

    const nextAutoPoseUrl = autoPoseUrls[Math.floor(Math.random() * autoPoseUrls.length)] ?? null
    setAutoPoseUrl(nextAutoPoseUrl)
  }, [autoPoseUrls, existingPoseUrl, hasModelSource, selectedFile, existingVrmUrl])

  // Sync light intensities when sliders change.
  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.intensity = keyLightIntensity
    }
  }, [keyLightIntensity])

  useEffect(() => {
    if (fillLightRef.current) {
      fillLightRef.current.intensity = fillLightIntensity
    }
  }, [fillLightIntensity])

  // Sync light colors when swatches change.
  useEffect(() => {
    if (keyLightRef.current) {
      keyLightRef.current.color = new THREE.Color(keyLightColor)
    }
  }, [keyLightColor])

  useEffect(() => {
    if (fillLightRef.current) {
      fillLightRef.current.color = new THREE.Color(fillLightColor)
    }
  }, [fillLightColor])

  // Real bloom parameters (UnrealBloomPass).
  useEffect(() => {
    const bundle = composerRef.current
    if (!bundle) {
      return
    }
    const renderer = rendererRef.current
    const fxaaUniform = bundle.fxaaPass?.material?.uniforms?.resolution?.value as
      | { set: (x: number, y: number) => void }
      | undefined
    if (fxaaUniform && renderer) {
      const pixelRatio = renderer.getPixelRatio()
      const width = Math.max(renderer.domElement.width, 1)
      const height = Math.max(renderer.domElement.height, 1)
      fxaaUniform.set(1 / (width * pixelRatio), 1 / (height * pixelRatio))
    }
    bundle.bloomPass.strength = bloomStrength
    bundle.bloomPass.threshold = bloomThreshold
    bundle.bloomPass.radius = bloomRadius
  }, [bloomRadius, bloomStrength, bloomThreshold])

  // Real vignette parameters (VignetteShader).
  useEffect(() => {
    const bundle = composerRef.current
    if (!bundle) {
      return
    }
    // VignetteShader expects ~0..3 range; we expose 0..2 in UI.
    bundle.vignettePass.uniforms.offset.value = 1.0
    bundle.vignettePass.uniforms.darkness.value = Math.max(0, vignetteDarkness)
  }, [vignetteDarkness])

  // Sync background choice to renderer clear color.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }
    if (backgroundMode === 'transparent') {
      renderer.setClearColor(0x000000, 0)
      return
    }
    const color = backgroundMode === 'project' ? '#101722' : backgroundColor
    renderer.setClearColor(new THREE.Color(color), 1)
  }, [backgroundColor, backgroundMode])

  useEffect(() => {
    return () => {
      if (autoCaptureTimeoutRef.current !== null) {
        window.clearTimeout(autoCaptureTimeoutRef.current)
      }
      if (capturedSmallUrl) {
        URL.revokeObjectURL(capturedSmallUrl)
      }
      if (capturedLargeUrl) {
        URL.revokeObjectURL(capturedLargeUrl)
      }
    }
  }, [capturedLargeUrl, capturedSmallUrl])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const fallbackUrl = existingVrmUrl?.trim() || null
    const modelUrl = selectedFile ? URL.createObjectURL(selectedFile) : fallbackUrl
    const fallbackPoseUrl = existingPoseUrl?.trim() || autoPoseUrl
    const poseUrl = selectedPoseFile ? URL.createObjectURL(selectedPoseFile) : fallbackPoseUrl
    if (!modelUrl) {
      return () => undefined
    }

    const appendDiagnostic = (message: string) => {
      const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
      const line = `${timestamp} ${message}`
      console.info('[VrmLivePreview]', line)
    }

    setErrorMessage(null)
    setAnimationMessage(null)
    autoCaptureGenerationRef.current = 0
    if (autoCaptureTimeoutRef.current !== null) {
      window.clearTimeout(autoCaptureTimeoutRef.current)
      autoCaptureTimeoutRef.current = null
    }
    appendDiagnostic(`Starting preview load for ${selectedFile?.name ?? 'existing VRM URL'}`)

    let disposed = false
    let frameId = 0
    const clock = new THREE.Clock()
    isPlayingRef.current = true
    const loadGeneration = ++loadGenerationRef.current

    const scene = new THREE.Scene()
    scene.background = null

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200)
    camera.position.set(0, 1.35, 2.2)
    const lookAtTarget = new THREE.Object3D()
    scene.add(lookAtTarget)
    lookAtTargetRef.current = lookAtTarget

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PREVIEW_PIXEL_RATIO))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.className = 'block h-full w-full'
    if (backgroundMode === 'transparent') {
      renderer.setClearColor(0x000000, 0)
    } else {
      const initialBg = backgroundMode === 'project' ? '#101722' : backgroundColor
      renderer.setClearColor(new THREE.Color(initialBg), 1)
    }
    renderer.shadowMap.enabled = false
    renderer.debug.checkShaderErrors = true
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer
    sceneRef.current = scene
    composerRef.current = null

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.2, 0)
    controls.enableDamping = true
    controls.minDistance = 1.3
    controls.maxDistance = 6
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN
    controls.touches.ONE = THREE.TOUCH.ROTATE
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN
    controls.update()
    controlsRef.current = controls
    cameraRef.current = camera
    initialCameraRef.current = {
      position: camera.position.clone(),
      target: controls.target.clone()
    }

    const hemiLight = new THREE.HemisphereLight('#cfe6ff', '#273244', 0.95)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight(keyLightColor, keyLightIntensity)
    keyLight.position.set(2.2, 3.4, 2.8)
    scene.add(keyLight)
    keyLightRef.current = keyLight

    const fillLight = new THREE.DirectionalLight(fillLightColor, fillLightIntensity)
    fillLight.position.set(-2.6, 1.4, -2.1)
    scene.add(fillLight)
    fillLightRef.current = fillLight

    // Intentionally no floor mesh (clean preview background).

    const resize = () => {
      const nextWidth = Math.max(container.clientWidth, 240)
      const nextHeight = Math.max(container.clientHeight, 280)
      renderer.setSize(nextWidth, nextHeight, false)
      syncComposerResolution(nextWidth, nextHeight)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    }

    const onContextLost = (event: Event) => {
      event.preventDefault()
      appendDiagnostic('WebGL context lost')
      setIsModelLoading(false)
      setErrorMessage('Preview renderer lost its WebGL context. Check the diagnostics log below.')
    }

    const onContextRestored = () => {
      appendDiagnostic('WebGL context restored')
    }

    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored)

    const cleanupRenderer = () => {
      if (actionRef.current) {
        actionRef.current.stop()
      }
      if (mixerRef.current) {
        if (clipRef.current) {
          mixerRef.current.uncacheClip(clipRef.current)
        }
      }
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.geometry) {
          mesh.geometry.dispose()
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            for (const material of mesh.material) {
              disposeMaterial(material)
            }
          } else {
            disposeMaterial(mesh.material)
          }
        }
      })
      controlsRef.current?.dispose()
      composerRef.current?.composer.dispose?.()
      composerRef.current = null
      rendererRef.current?.dispose()
      controlsRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      mixerRef.current = null
      actionRef.current = null
      clipRef.current = null
      vrmRef.current = null
      lookAtTargetRef.current = null
      anchoredHipsWorldPositionRef.current = null
      isDraggingModelRef.current = false
      debugMeshOriginalMaterialsRef.current = []
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored)
      container.innerHTML = ''
    }

    const animate = (vrm: VRM) => {
      try {
        const delta = clock.getDelta()
        if (isPlayingRef.current) {
          mixerRef.current?.update(delta)
        }
        if (vrm.lookAt && lookAtTargetRef.current) {
          lookAtTargetRef.current.position.copy(camera.position)
          vrm.lookAt.target = lookAtTargetRef.current
          vrm.lookAt.autoUpdate = true
        }
        vrm.update(delta)
        const hips = vrm.humanoid?.getNormalizedBoneNode('hips' as never)
        const anchoredHipsWorldPosition = anchoredHipsWorldPositionRef.current
        if (hips && anchoredHipsWorldPosition) {
          const currentHipsWorldPosition = new THREE.Vector3()
          hips.getWorldPosition(currentHipsWorldPosition)
          const anchorOffset = new THREE.Vector3(
            anchoredHipsWorldPosition.x - currentHipsWorldPosition.x,
            anchoredHipsWorldPosition.y - currentHipsWorldPosition.y,
            anchoredHipsWorldPosition.z - currentHipsWorldPosition.z
          )
          vrm.scene.position.add(anchorOffset)
        }
        if (isCameraFollowEnabledRef.current && !isDraggingModelRef.current) {
          if (hips) {
            const worldPos = new THREE.Vector3()
            hips.getWorldPosition(worldPos)
            controls.target.lerp(worldPos, 0.18)
          }
        }
        controls.update()
        const composerBundle = composerRef.current
        if (composerBundle) {
          composerBundle.composer.render()
        } else {
          renderer.render(scene, camera)
        }
        frameId = window.requestAnimationFrame(() => animate(vrm))
      } catch (error) {
        appendDiagnostic(`Render loop failed: ${formatDiagnosticError(error)}`)
        setIsModelLoading(false)
        setErrorMessage('Preview render failed. Check the diagnostics log below.')
      }
    }

    const frameCameraToVrm = (vrm: VRM) => {
      vrm.scene.updateMatrixWorld(true)

      const fitBox = new THREE.Box3().setFromObject(vrm.scene)
      const fitSize = fitBox.getSize(new THREE.Vector3())
      const fitCenter = fitBox.getCenter(new THREE.Vector3())
      const hips = vrm.humanoid?.getNormalizedBoneNode('hips' as never)
      const head = vrm.humanoid?.getNormalizedBoneNode('head' as never)
      const hipsWorldPosition = new THREE.Vector3()
      const headWorldPosition = new THREE.Vector3()

      if (hips) {
        hips.getWorldPosition(hipsWorldPosition)
      } else {
        hipsWorldPosition.copy(fitCenter)
      }

      if (head) {
        head.getWorldPosition(headWorldPosition)
      } else {
        headWorldPosition.set(fitCenter.x, fitCenter.y + fitSize.y * 0.35, fitCenter.z)
      }

      const torsoHeight = Math.max(headWorldPosition.y - hipsWorldPosition.y, fitSize.y * 0.35, 0.35)

      if (capturePreset === 'portrait-thumbnail') {
        const estimatedHeadTopY = Math.max(fitBox.max.y, headWorldPosition.y + torsoHeight * 0.18)
        const stomachY = hipsWorldPosition.y + torsoHeight * 0.28
        const visibleHeight = Math.max(estimatedHeadTopY - stomachY, torsoHeight * 0.8, 0.45)
        const portraitTargetY = stomachY + visibleHeight * 0.5
        const portraitTargetZ = (headWorldPosition.z + hipsWorldPosition.z + fitCenter.z) / 3
        const fovRadians = (camera.fov * Math.PI) / 180
        const fitDistance = Math.max(0.95, (visibleHeight / 2) / Math.tan(fovRadians / 2) * 1.08)

        controls.target.set(fitCenter.x, portraitTargetY, portraitTargetZ)
        camera.near = Math.max(0.01, fitDistance / 200)
        camera.far = Math.max(200, fitDistance * 20)
        camera.position.set(fitCenter.x, portraitTargetY, portraitTargetZ + fitDistance)
        camera.updateProjectionMatrix()
        controls.maxDistance = Math.max(controls.maxDistance, fitDistance * 2.25)
        controls.minDistance = Math.min(controls.minDistance, fitDistance * 0.85)
        controls.update()

        appendDiagnostic(
          `Portrait framing headTop=${estimatedHeadTopY.toFixed(2)} stomach=${stomachY.toFixed(2)} targetY=${portraitTargetY.toFixed(2)} targetZ=${portraitTargetZ.toFixed(2)} distance=${fitDistance.toFixed(2)}`
        )
        return
      }

      const maxDim = Math.max(fitSize.x, fitSize.y, fitSize.z, torsoHeight)
      const fovRadians = (camera.fov * Math.PI) / 180
      const fitDistance = Math.max(1.2, (maxDim / 2) / Math.tan(fovRadians / 2) * 1.25)
      const target = hipsWorldPosition.clone()

      controls.target.copy(target)
      camera.near = Math.max(0.01, fitDistance / 200)
      camera.far = Math.max(200, fitDistance * 20)
      camera.position.set(target.x, target.y + torsoHeight * 0.55, target.z + fitDistance)
      camera.updateProjectionMatrix()
      controls.maxDistance = Math.max(controls.maxDistance, fitDistance * 2.25)
      controls.update()

      appendDiagnostic(
        `Bounds size=(${fitSize.x.toFixed(2)}, ${fitSize.y.toFixed(2)}, ${fitSize.z.toFixed(2)}) center=(${fitCenter.x.toFixed(2)}, ${fitCenter.y.toFixed(2)}, ${fitCenter.z.toFixed(2)})`
      )
      appendDiagnostic(
        `Hips target=(${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}) torsoHeight=${torsoHeight.toFixed(2)}`
      )
      appendDiagnostic(
        `Camera position=(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}) near=${camera.near.toFixed(3)} far=${camera.far.toFixed(2)}`
      )
    }

    const scheduleAutoCapture = (reason: string) => {
      if (!autoCaptureOnLoad) {
        return
      }

      if (autoCaptureGenerationRef.current === loadGeneration) {
        return
      }

      autoCaptureGenerationRef.current = loadGeneration

      if (autoCaptureTimeoutRef.current !== null) {
        window.clearTimeout(autoCaptureTimeoutRef.current)
      }

      const settleDelayMs =
        capturePreset === 'portrait-thumbnail' ? PORTRAIT_AUTO_CAPTURE_SETTLE_DELAY_MS : DEFAULT_AUTO_CAPTURE_SETTLE_DELAY_MS

      appendDiagnostic(`Scheduling automatic thumbnail capture (${reason}) after ${settleDelayMs}ms`)
      autoCaptureTimeoutRef.current = window.setTimeout(() => {
        autoCaptureTimeoutRef.current = null

        if (disposed || loadGenerationRef.current !== loadGeneration) {
          return
        }

        appendDiagnostic(`Running automatic thumbnail capture (${reason})`)
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (disposed || loadGenerationRef.current !== loadGeneration) {
              return
            }

            handleCaptureThumbnail()
          })
        })
      }, settleDelayMs)
    }

    const anchorHipsToCurrentTarget = (vrm: VRM) => {
      const hips = vrm.humanoid?.getNormalizedBoneNode('hips' as never)
      const anchoredHipsWorldPosition = anchoredHipsWorldPositionRef.current
      if (!hips || !anchoredHipsWorldPosition) {
        return
      }

      vrm.scene.updateMatrixWorld(true)
      const currentHipsWorldPosition = new THREE.Vector3()
      hips.getWorldPosition(currentHipsWorldPosition)
      const anchorOffset = new THREE.Vector3(
        anchoredHipsWorldPosition.x - currentHipsWorldPosition.x,
        anchoredHipsWorldPosition.y - currentHipsWorldPosition.y,
        anchoredHipsWorldPosition.z - currentHipsWorldPosition.z
      )
      vrm.scene.position.add(anchorOffset)
      vrm.scene.updateMatrixWorld(true)
      appendDiagnostic(
        `Re-anchored posed hips by (${anchorOffset.x.toFixed(2)}, ${anchorOffset.y.toFixed(2)}, ${anchorOffset.z.toFixed(2)})`
      )
    }

    resize()
    window.addEventListener('resize', resize)

    void Promise.resolve().then(async () => {
      setIsModelReadyForThumbnail(false)
      setModelLoadProgressPercent(5)
      setIsModelLoading(true)
      appendDiagnostic('Initializing preview renderer')
      try {
        if (ENABLE_UPLOAD_PREVIEW_POST_PROCESSING) {
          try {
            const [
              { EffectComposer },
              { RenderPass },
              { UnrealBloomPass },
              { ShaderPass },
              { VignetteShader },
              { FXAAShader }
            ] = await Promise.all([
              import('three/examples/jsm/postprocessing/EffectComposer.js'),
              import('three/examples/jsm/postprocessing/RenderPass.js'),
              import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
              import('three/examples/jsm/postprocessing/ShaderPass.js'),
              import('three/examples/jsm/shaders/VignetteShader.js'),
              import('three/examples/jsm/shaders/FXAAShader.js')
            ])

            if (!disposed) {
              const composer = new EffectComposer(renderer)
              const renderPass = new RenderPass(scene, camera)
              const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomStrength, bloomRadius, bloomThreshold)
              const fxaaPass = new ShaderPass(FXAAShader)
              const vignettePass = new ShaderPass(VignetteShader)
              vignettePass.uniforms.offset.value = 1.0
              vignettePass.uniforms.darkness.value = Math.max(0, vignetteDarkness)
              const pixelRatio = renderer.getPixelRatio()
              fxaaPass.material.uniforms.resolution.value.set(
                1 / (Math.max(container.clientWidth, 240) * pixelRatio),
                1 / (Math.max(container.clientHeight, 280) * pixelRatio)
              )

              composer.addPass(renderPass)
              composer.addPass(fxaaPass)
              composer.addPass(bloomPass)
              composer.addPass(vignettePass)
              composer.setSize(Math.max(container.clientWidth, 240), Math.max(container.clientHeight, 280))

              composerRef.current = { composer, bloomPass, vignettePass, fxaaPass }
              setModelLoadProgressPercent((previous) => Math.max(previous, 12))
              appendDiagnostic('Post-processing initialized')
            }
          } catch (error) {
            console.warn('[VrmLivePreview] Post-processing unavailable', error)
            composerRef.current = null
            appendDiagnostic(`Post-processing unavailable: ${formatDiagnosticError(error)}`)
          }
        } else {
          composerRef.current = null
          appendDiagnostic('Post-processing disabled for preview stability')
        }

        appendDiagnostic('Loading VRM runtime modules')
        setModelLoadProgressPercent((previous) => Math.max(previous, 18))
        const runtime = await loadVrmRuntime()
        if (disposed) {
          return
        }

        appendDiagnostic('Creating GLTF loader')
        setModelLoadProgressPercent((previous) => Math.max(previous, 24))
        const loader = createVrmGLTFLoader(runtime)
        loader.load(
          modelUrl,
          (loadedGltf) => {
            if (disposed || loadGenerationRef.current !== loadGeneration) {
              return
            }
            try {
              appendDiagnostic('VRM file downloaded and parsed by GLTFLoader')
              setModelLoadProgressPercent((previous) => Math.max(previous, 84))
              setIsPlaying(true)

              const gltf = loadedGltf as VrmLoadedGltf
              const vrm = getVrmFromGltfUserData(gltf)
              if (!vrm) {
                appendDiagnostic('VRM plugin returned no VRM instance')
                setModelLoadProgressPercent(0)
                setErrorMessage('Failed to read VRM data for preview.')
                return
              }
              appendDiagnostic('VRM instance created')
              setModelLoadProgressPercent((previous) => Math.max(previous, 88))
              vrmRef.current = vrm
              if (vrm.lookAt && lookAtTargetRef.current) {
                vrm.lookAt.target = lookAtTargetRef.current
                vrm.lookAt.autoUpdate = true
              }

              appendDiagnostic('Optimizing VRM scene')
              setModelLoadProgressPercent((previous) => Math.max(previous, 92))
              optimizeVrmSceneForRendering(runtime, vrm.scene)
              debugMeshOriginalMaterialsRef.current = []
              vrm.scene.traverse((node) => {
                if (!('isMesh' in node) || !node.isMesh) {
                  return
                }

                const mesh = node as THREE.Mesh
                mesh.castShadow = false
                mesh.receiveShadow = false

                debugMeshOriginalMaterialsRef.current.push({
                  mesh,
                  material: mesh.material
                })
              })
              appendDiagnostic(`Prepared ${debugMeshOriginalMaterialsRef.current.length} mesh materials`)

              if (useUnlitDebug) {
                appendDiagnostic('Applying unlit debug materials')
                for (const entry of debugMeshOriginalMaterialsRef.current) {
                  const debugMaterial = Array.isArray(entry.material)
                    ? entry.material.map((material) => createUnlitMaterial(material))
                    : createUnlitMaterial(entry.material)
                  applyMaterialArray(entry.mesh, debugMaterial)
                }
              }
              // Admins can flip the model for hidden reference capture without reloading the VRM.
              vrm.scene.rotation.y = flipCharacter ? Math.PI : 0
              scene.add(vrm.scene)
              isPlayingRef.current = true
              setIsPlaying(true)

              actionRef.current?.stop()
              actionRef.current = null

              mixerRef.current?.stopAllAction()
              mixerRef.current = null
              setErrorMessage(null)

              appendDiagnostic('Fitting camera to hips target')
              setModelLoadProgressPercent((previous) => Math.max(previous, 95))
              frameCameraToVrm(vrm)
              initialCameraRef.current = {
                position: camera.position.clone(),
                target: controls.target.clone()
              }
              const hips = vrm.humanoid?.getNormalizedBoneNode('hips' as never)
              if (hips) {
                const anchoredHipsWorldPosition = new THREE.Vector3()
                hips.getWorldPosition(anchoredHipsWorldPosition)
                anchoredHipsWorldPositionRef.current = anchoredHipsWorldPosition
                appendDiagnostic(
                  `Anchored hips at (${anchoredHipsWorldPosition.x.toFixed(2)}, ${anchoredHipsWorldPosition.y.toFixed(2)}, ${anchoredHipsWorldPosition.z.toFixed(2)})`
                )
              } else {
                anchoredHipsWorldPositionRef.current = null
                appendDiagnostic('No hips bone found for root-motion anchoring')
              }
              appendDiagnostic('Model added to scene successfully')

              if (poseUrl === null) {
                appendDiagnostic('No pose selected; rendering base model only')
                setModelLoadProgressPercent(100)
                setIsModelReadyForThumbnail(true)
                scheduleAutoCapture('base model ready')
              } else {
                const selectedPoseUrl: string = poseUrl
                void Promise.resolve().then(async () => {
                  try {
                    appendDiagnostic('Loading VRMA pose/animation')
                    setModelLoadProgressPercent((previous) => Math.max(previous, 97))
                    const vrmaClip = await loadDanceVrmaClip(vrm, selectedPoseUrl)
                    if (disposed || loadGenerationRef.current !== loadGeneration) {
                      return
                    }
                    if (vrmaClip.tracks.length === 0) {
                      console.warn('[VrmLivePreview] VRMA produced zero tracks')
                      appendDiagnostic('VRMA loaded but produced zero tracks')
                      setAnimationMessage('Selected pose loaded, but it has no tracks. Preview is still available for capture.')
                      return
                    }

                    mixerRef.current = new THREE.AnimationMixer(vrm.scene)
                    const action = mixerRef.current.clipAction(vrmaClip)
                    action.setLoop(THREE.LoopRepeat, Infinity)
                    action.clampWhenFinished = false
                    action.paused = !isPlayingRef.current
                    action.play()
                    mixerRef.current.update(0)
                    anchorHipsToCurrentTarget(vrm)
                    frameCameraToVrm(vrm)
                    actionRef.current = action
                    clipRef.current = vrmaClip
                    setAnimationMessage(null)
                    appendDiagnostic(`VRMA applied with ${vrmaClip.tracks.length} tracks (autoplay on)`)
                    setModelLoadProgressPercent(100)
                    setIsModelReadyForThumbnail(true)
                    scheduleAutoCapture('pose applied')
                  } catch (error) {
                    console.warn('[VrmLivePreview] Failed to load/apply VRMA animation', error)
                    appendDiagnostic(`VRMA load failed: ${formatDiagnosticError(error)}`)
                    setAnimationMessage('Selected pose unavailable right now. Preview and capture still work.')
                    setModelLoadProgressPercent(100)
                    setIsModelReadyForThumbnail(true)
                    scheduleAutoCapture('pose failed; base model fallback')
                  }
                })
              }

              appendDiagnostic('Starting render loop')
              animate(vrm)
              setIsModelLoading(false)
            } catch (error) {
              appendDiagnostic(`Load pipeline failed: ${formatDiagnosticError(error)}`)
              setIsModelLoading(false)
              setModelLoadProgressPercent(0)
              setIsModelReadyForThumbnail(false)
              setErrorMessage('Could not finish preparing this VRM for preview. Check the diagnostics log below.')
            }
          },
          (event) => {
            const progressEvent = event as ProgressEvent
            if (progressEvent.lengthComputable && progressEvent.total > 0) {
              const downloadPercent = Math.round((progressEvent.loaded / progressEvent.total) * 100)
              setModelLoadProgressPercent((previous) => Math.max(previous, 24 + Math.round(downloadPercent * 0.56)))
              appendDiagnostic(`Download progress ${downloadPercent}%`)
            }
          },
          (error) => {
            appendDiagnostic(`GLTF loader failed: ${formatDiagnosticError(error)}`)
            setIsModelLoading(false)
            setModelLoadProgressPercent(0)
            setIsModelReadyForThumbnail(false)
            setErrorMessage('Could not load this VRM file for preview.')
          }
        )
      } catch (error) {
        appendDiagnostic(`Preview initialization failed: ${formatDiagnosticError(error)}`)
        setIsModelLoading(false)
        setModelLoadProgressPercent(0)
        setIsModelReadyForThumbnail(false)
        setErrorMessage('Could not initialize the 3D preview.')
      }
    })

    return () => {
      disposed = true
      if (autoCaptureTimeoutRef.current !== null) {
        window.clearTimeout(autoCaptureTimeoutRef.current)
        autoCaptureTimeoutRef.current = null
      }
      window.removeEventListener('resize', resize)
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      cleanupRenderer()
      if (selectedFile) {
        URL.revokeObjectURL(modelUrl)
      }
      if (selectedPoseFile && poseUrl) {
        URL.revokeObjectURL(poseUrl)
      }
    }
  // This effect intentionally rebuilds the preview only when the model or pose source changes.
  // `autoCaptureOnLoad` is read during a given load cycle, but changing it later should not tear down and reload the model.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPoseUrl, existingVrmUrl, selectedFile, selectedPoseFile])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) {
      return
    }
    controls.enableRotate = controlMode === 'rotate'
    controls.enablePan = controlMode === 'move'
    controls.mouseButtons.LEFT = controlMode === 'move' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    controls.mouseButtons.RIGHT = controlMode === 'move' ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
  }, [controlMode])

  const handleTogglePlayback = () => {
    const nextIsPlaying = !isPlayingRef.current
    isPlayingRef.current = nextIsPlaying
    setIsPlaying(nextIsPlaying)
    if (actionRef.current) {
      actionRef.current.paused = !nextIsPlaying
    }
  }

  const handleSetRotateMode = () => {
    setControlMode('rotate')
  }

  const handleSetMoveMode = () => {
    setControlMode('move')
  }

  const handleToggleCameraFollow = () => {
    setIsCameraFollowEnabled((previous) => !previous)
  }

  const syncComposerResolution = (width: number, height: number) => {
    const renderer = rendererRef.current
    const bundle = composerRef.current
    if (!renderer || !bundle) {
      return
    }

    bundle.composer.setSize(width, height)
    const fxaaUniform = bundle.fxaaPass?.material?.uniforms?.resolution?.value as { set: (x: number, y: number) => void } | undefined
    if (!fxaaUniform) {
      return
    }

    const pixelRatio = renderer.getPixelRatio()
    fxaaUniform.set(1 / Math.max(width * pixelRatio, 1), 1 / Math.max(height * pixelRatio, 1))
  }

  const renderCurrentFrame = () => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!renderer || !scene || !camera || !controls) {
      return false
    }

    controls.update()
    const composerBundle = composerRef.current
    if (composerBundle) {
      composerBundle.composer.render()
    } else {
      renderer.render(scene, camera)
    }

    return true
  }

  const captureRendererFrame = () => {
    const renderer = rendererRef.current
    const camera = cameraRef.current
    if (!renderer || !camera) {
      throw new Error('Renderer is not ready yet.')
    }

    const originalSize = renderer.getSize(new THREE.Vector2())
    const originalPixelRatio = renderer.getPixelRatio()
    const originalAspect = camera.aspect

    try {
      renderer.setPixelRatio(1)
      renderer.setSize(LARGE_THUMBNAIL_WIDTH, LARGE_THUMBNAIL_HEIGHT, false)
      syncComposerResolution(LARGE_THUMBNAIL_WIDTH, LARGE_THUMBNAIL_HEIGHT)
      camera.aspect = LARGE_THUMBNAIL_WIDTH / LARGE_THUMBNAIL_HEIGHT
      camera.updateProjectionMatrix()
      renderCurrentFrame()
      return copyCanvasFrame(renderer.domElement)
    } finally {
      renderer.setPixelRatio(originalPixelRatio)
      renderer.setSize(originalSize.x, originalSize.y, false)
      syncComposerResolution(originalSize.x, originalSize.y)
      camera.aspect = originalAspect
      camera.updateProjectionMatrix()
      renderCurrentFrame()
    }
  }

  const createResizedSnapshotFile = async (options: {
    sourceCanvas: HTMLCanvasElement
    width: number
    height: number
    filename: string
    background: { mode: 'project' | 'solid' | 'transparent'; color: string }
  }) => {
    const { sourceCanvas, width, height, filename, background } = options
    const targetCanvas = document.createElement('canvas')
    targetCanvas.width = width
    targetCanvas.height = height
    const context = targetCanvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to create 2D canvas context.')
    }

    // Match the visible preview frame: fill the target aspect and crop evenly from center.
    const sourceWidth = sourceCanvas.width
    const sourceHeight = sourceCanvas.height
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    const drawWidth = Math.round(sourceWidth * scale)
    const drawHeight = Math.round(sourceHeight * scale)
    const dx = Math.round((width - drawWidth) / 2)
    const dy = Math.round((height - drawHeight) / 2)
    // Keep thumbnails consistent with live preview background.
    if (background.mode === 'transparent') {
      context.clearRect(0, 0, width, height)
    } else {
      const fill = background.mode === 'project' ? '#101722' : background.color
      context.fillStyle = fill
      context.fillRect(0, 0, width, height)
    }
    context.drawImage(sourceCanvas, 0, 0, sourceWidth, sourceHeight, dx, dy, drawWidth, drawHeight)

    const blob = await new Promise<Blob>((resolve, reject) => {
      targetCanvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error('Failed to encode thumbnail.'))
            return
          }
          resolve(result)
        },
        'image/png',
        0.98
      )
    })

    return new File([blob], filename, { type: 'image/png' })
  }

  const copyCanvasFrame = (sourceCanvas: HTMLCanvasElement) => {
    const snapshotCanvas = document.createElement('canvas')
    snapshotCanvas.width = sourceCanvas.width
    snapshotCanvas.height = sourceCanvas.height
    const context = snapshotCanvas.getContext('2d')
    if (!context) {
      throw new Error('Failed to create 2D canvas for frame snapshot.')
    }

    context.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height)
    return snapshotCanvas
  }

  const handleCaptureThumbnail = () => {
    void Promise.resolve().then(async () => {
      try {
        const timestamp = Date.now()
        const sourceCanvas = captureRendererFrame()
        const background = { mode: backgroundMode, color: backgroundColor }
        const smallFile = await createResizedSnapshotFile({
          sourceCanvas,
          width: SMALL_THUMBNAIL_WIDTH,
          height: SMALL_THUMBNAIL_HEIGHT,
          filename: `vrm-thumbnail-small-${timestamp}.png`,
          background
        })
        const largeFile = await createResizedSnapshotFile({
          sourceCanvas,
          width: LARGE_THUMBNAIL_WIDTH,
          height: LARGE_THUMBNAIL_HEIGHT,
          filename: `vrm-thumbnail-${timestamp}.png`,
          background
        })

        capturedSmallFileRef.current = smallFile
        capturedLargeFileRef.current = largeFile

        setSelectedPreviewSize('large')
        onThumbnailGenerated(largeFile)

        const nextSmallUrl = URL.createObjectURL(smallFile)
        const nextLargeUrl = URL.createObjectURL(largeFile)

        setCapturedSmallUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
          }
          return nextSmallUrl
        })
        setCapturedLargeUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
          }
          return nextLargeUrl
        })
      } catch (error) {
        console.warn('[VrmLivePreview] Failed to capture thumbnail', error)
      }
    })
  }

  handleCaptureThumbnailRef.current = handleCaptureThumbnail

  useEffect(() => {
    if (captureRequestKey === 0 || captureRequestKey === lastCaptureRequestKeyRef.current) {
      return
    }

    lastCaptureRequestKeyRef.current = captureRequestKey
    handleCaptureThumbnailRef.current()
  }, [captureRequestKey])

  const handleSelectPreviewSize = (size: 'small' | 'large') => {
    setSelectedPreviewSize(size)
    const file = size === 'small' ? capturedSmallFileRef.current : capturedLargeFileRef.current
    if (file) {
      onThumbnailGenerated(file)
    }
  }

  const createFileFromUrl = async (url: string, filename: string) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch image source: ${response.status}`)
    }
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type || 'image/png' })
  }

  const createMirroredFile = async (file: File, filename: string) => {
    const sourceUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to decode image for mirror operation.'))
        img.src = sourceUrl
      })

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Failed to create 2D context for mirror operation.')
      }
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) {
            reject(new Error('Failed to encode mirrored image.'))
            return
          }
          resolve(result)
        }, 'image/png', 0.98)
      })

      return new File([blob], filename, { type: 'image/png' })
    } finally {
      URL.revokeObjectURL(sourceUrl)
    }
  }

  const handleMirrorPreviewSize = (size: 'small' | 'large') => {
    const sourceFile = size === 'small' ? capturedSmallFileRef.current : capturedLargeFileRef.current
    const fallbackUrl =
      size === 'small'
        ? (capturedSmallUrl ?? existingPreviewImageUrl ?? null)
        : (capturedLargeUrl ?? existingPreviewImageUrl ?? null)
    if (!sourceFile && !fallbackUrl) {
      return
    }
    if (size === 'small') setIsMirroringSmall(true)
    if (size === 'large') setIsMirroringLarge(true)
    void Promise.resolve().then(async () => {
      try {
        const baseFile =
          sourceFile ?? (await createFileFromUrl(fallbackUrl as string, `${size}-source-${Date.now()}.png`))
        const mirroredFile = await createMirroredFile(baseFile, `${size}-mirrored-${Date.now()}.png`)
        const mirroredUrl = URL.createObjectURL(mirroredFile)
        if (size === 'small') {
          capturedSmallFileRef.current = mirroredFile
          setCapturedSmallUrl((previousUrl) => {
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl)
            }
            return mirroredUrl
          })
        } else {
          capturedLargeFileRef.current = mirroredFile
          setCapturedLargeUrl((previousUrl) => {
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl)
            }
            return mirroredUrl
          })
        }

        if (selectedPreviewSize === size) {
          onThumbnailGenerated(mirroredFile)
        }
      } catch (error) {
        console.warn('[VrmLivePreview] Failed to mirror thumbnail', error)
      } finally {
        window.setTimeout(() => {
          if (size === 'small') setIsMirroringSmall(false)
          if (size === 'large') setIsMirroringLarge(false)
        }, 320)
      }
    })
  }

  const smallPreviewUrl = capturedSmallUrl ?? existingPreviewImageUrl ?? ''
  const largePreviewUrl = capturedLargeUrl ?? existingPreviewImageUrl ?? ''

  return (
    <div
      className={
        headless
          ? 'pointer-events-none absolute -left-[9999px] top-0 w-[360px] overflow-hidden opacity-0'
          : 'mt-6 rounded-md border border-white/10 bg-black/25 p-4 md:p-5'
      }
    >
      {!headless ? (
        <>
          <h3 className="text-center font-[family-name:var(--font-heading)] text-3xl font-normal italic text-ember-300">
            {debugViewport ? 'Reference Capture Viewport' : 'Live 3D Preview'}
          </h3>
          <p className="mt-1 text-center text-xs text-white/65">
            {debugViewport
              ? 'This is the exact viewport used for the hidden portrait reference capture.'
              : 'Drag to rotate. Scroll to zoom. A random pose previews automatically.'}
          </p>
        </>
      ) : null}

      <div
        className={`relative mx-auto ${headless ? '' : 'mt-4'} w-full overflow-hidden rounded-xl border border-white/15 bg-transparent ${previewFrameClassName}`}
        style={previewFrameStyle}
      >
        <div ref={containerRef} className="h-full w-full" />
        {isInteractiveViewport && !isModelLoading ? (
          <div className="absolute bottom-3 left-1 z-20 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleSetRotateMode}
              className={`inline-flex h-8 w-8 items-center justify-center transition ${controlMode === 'rotate'
                ? 'text-ember-400'
                : 'text-white/85 hover:text-white'
                }`}
              aria-label="Rotate mode"
              title="Rotate"
            >
              <RotateIcon />
            </button>
            <button
              type="button"
              onClick={handleSetMoveMode}
              className={`inline-flex h-8 w-8 items-center justify-center transition ${controlMode === 'move'
                ? 'text-ember-400'
                : 'text-white/85 hover:text-white'
                }`}
              aria-label="Move mode"
              title="Move"
            >
              <MoveIcon />
            </button>
            <button
              type="button"
              onClick={handleToggleCameraFollow}
              className={`inline-flex h-8 w-8 items-center justify-center transition ${isCameraFollowEnabled
                ? 'text-ember-400'
                : 'text-white/85 hover:text-white'
                }`}
              aria-label="Toggle camera follow"
              title={isCameraFollowEnabled ? 'Camera follow: on' : 'Camera follow: off'}
              aria-pressed={isCameraFollowEnabled}
            >
              <CameraIcon />
            </button>
            <button
              type="button"
              onClick={handleTogglePlayback}
              className={`inline-flex h-8 w-8 items-center justify-center transition ${isPlaying ? 'text-ember-400' : 'text-white/85 hover:text-white'
                }`}
              aria-label={isPlaying ? 'Pause animation' : 'Play animation'}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-pressed={isPlaying}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              onClick={handleCaptureThumbnail}
              className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-ember-400 text-white shadow-[0_10px_22px_rgba(0,0,0,0.45)] transition hover:brightness-110"
              aria-label="Capture thumbnail"
              title="Capture thumbnail"
            >
              <CaptureIcon />
            </button>
          </div>
        ) : null}
        {!headless && isModelLoading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_15%,rgba(244,99,19,0.14),rgba(13,21,38,0.96)_52%,rgba(9,14,27,0.98)_100%)] px-4 text-center">
            <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-ember-200/20 border-t-ember-400" />
            <p className="mt-4 text-lg font-semibold text-ember-300">Loading character model...</p>
            <p className="mt-1 text-sm text-white/65">Extracting geometry, skeleton, and animation.</p>
          </div>
        ) : null}
      </div>

      {isInteractiveViewport && hasModelSource && poseControls ? <div className={`mx-auto mt-2 w-full ${supportingPanelClassName}`}>{poseControls}</div> : null}

      {isInteractiveViewport && hasModelSource && (
        <>
          <div className="mt-3 w-full rounded-md border border-white/10 bg-black/25 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-[family-name:var(--font-heading)] text-xs font-semibold text-white">
                  Post-Processing
                </h3>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/70">
                    <span>Bloom Strength</span>
                    <span className="tabular-nums text-white/55">{bloomStrength.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={bloomStrength}
                    onChange={(event) => setBloomStrength(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-ember-300"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/70">
                    <span>Bloom Threshold</span>
                    <span className="tabular-nums text-white/55">{bloomThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={bloomThreshold}
                    onChange={(event) => setBloomThreshold(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-ember-300"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/70">
                    <span>Bloom Radius</span>
                    <span className="tabular-nums text-white/55">{bloomRadius.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={bloomRadius}
                    onChange={(event) => setBloomRadius(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-ember-300"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/70">
                    <span>Vignette Darkness</span>
                    <span className="tabular-nums text-white/55">{vignetteDarkness.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.01}
                    value={vignetteDarkness}
                    onChange={(event) => setVignetteDarkness(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-ember-300"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-md border border-white/10 bg-black/25 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300/20 bg-amber-300/5 px-3 py-2">
                <div>
                  <p className="text-[11px] font-semibold text-amber-200">Material Mode</p>
                  <p className="text-[10px] text-white/55">Light is default. Toggle unlit only for flat material checks.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUseUnlitDebug((previous) => !previous)}
                  className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${
                    useUnlitDebug
                      ? 'bg-amber-300 text-black'
                      : 'border border-white/15 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {useUnlitDebug ? 'Light' : 'Unlit'}
                </button>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/75">
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex h-3.5 w-3.5 cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-white/35">
                        <span className="absolute inset-0" style={{ backgroundColor: keyLightColor }} />
                        <input
                          type="color"
                          value={keyLightColor}
                          onChange={(event) => setKeyLightColor(event.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Key light color"
                        />
                      </label>
                      <span>Key Light</span>
                    </div>
                    <span className="tabular-nums text-ember-300">{keyLightIntensity.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    value={keyLightIntensity}
                    onChange={(event) => setKeyLightIntensity(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-700 accent-ember-300"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/75">
                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex h-3.5 w-3.5 cursor-pointer items-center justify-center overflow-hidden rounded-sm border border-white/35">
                        <span className="absolute inset-0" style={{ backgroundColor: fillLightColor }} />
                        <input
                          type="color"
                          value={fillLightColor}
                          onChange={(event) => setFillLightColor(event.target.value)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Fill light color"
                        />
                      </label>
                      <span>Fill Light</span>
                    </div>
                    <span className="tabular-nums text-ember-300">{fillLightIntensity.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={fillLightIntensity}
                    onChange={(event) => setFillLightIntensity(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer appearance-none rounded-full bg-neutral-700 accent-ember-300"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-black/25 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
              <h3 className="font-[family-name:var(--font-heading)] text-xs font-semibold text-ember-300">
                Background
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBackgroundMode('project')}
                className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${backgroundMode === 'project'
                  ? 'bg-ember-400 text-white'
                  : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
              >
                Project
              </button>
              <button
                type="button"
                onClick={() => setBackgroundMode('solid')}
                className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${backgroundMode === 'solid'
                  ? 'bg-ember-400 text-white'
                  : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
              >
                Solid
              </button>
              <button
                type="button"
                onClick={() => setBackgroundMode('transparent')}
                className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.08em] transition ${backgroundMode === 'transparent'
                  ? 'bg-ember-400 text-white'
                  : 'border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
              >
                Transparent
              </button>

              {backgroundMode === 'solid' ? (
                <div className="flex items-center gap-2 md:ml-auto">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Color</span>
                  <label className="relative inline-flex h-7 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15">
                    <span className="absolute inset-0" style={{ backgroundColor: backgroundColor }} />
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(event) => setBackgroundColor(event.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="Background color"
                    />
                  </label>
                  <span className="text-[11px] font-semibold text-white/70">{backgroundColor.toUpperCase()}</span>
                </div>
              ) : null}
            </div>
          </div>
          </div>
        </>
      )}

      {isInteractiveViewport && (capturedSmallUrl || capturedLargeUrl || existingPreviewImageUrl) ? (
        <div className={`mx-auto mt-4 w-full ${supportingPanelClassName}`}>
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55">Captured Thumbnails</p>
          <div className="mt-3 grid grid-cols-[1fr_1.4fr] items-end gap-4">
            <div className="flex min-w-0 flex-col justify-end">
              <p className="mb-2 text-center text-[11px] font-semibold text-white/70">
                Small ({SMALL_THUMBNAIL_WIDTH} x {SMALL_THUMBNAIL_HEIGHT})
              </p>
              <div
                className={`relative mx-auto w-full ${smallThumbnailClassName} overflow-hidden rounded-xl border ${selectedPreviewSize === 'small' ? 'border-ember-300/80' : 'border-white/15'
                  }`}
                onClick={() => handleSelectPreviewSize('small')}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleSelectPreviewSize('small')
                  }
                }}
                style={{
                  ...smallThumbnailStyle,
                  backgroundColor:
                    backgroundMode === 'transparent'
                      ? 'transparent'
                      : backgroundMode === 'project'
                        ? '#101722'
                        : backgroundColor
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={smallPreviewUrl}
                  alt="Captured small thumbnail preview"
                  className={`h-full w-full object-cover transition duration-300 ease-out ${isMirroringSmall ? 'scale-[0.97] opacity-75' : 'scale-100 opacity-100'
                    }`}
                />
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-2 text-center text-[11px] font-semibold text-white/70">
                Large ({LARGE_THUMBNAIL_WIDTH} x {LARGE_THUMBNAIL_HEIGHT})
              </p>
              <div
                className={`relative mx-auto w-full ${largeThumbnailClassName} overflow-hidden rounded-xl border shadow-[0_0_0_1px_rgba(244,99,19,0.12)] ${selectedPreviewSize === 'large' ? 'border-ember-300/80' : 'border-white/15'
                  }`}
                onClick={() => handleSelectPreviewSize('large')}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleSelectPreviewSize('large')
                  }
                }}
                style={{
                  ...largeThumbnailStyle,
                  backgroundColor:
                    backgroundMode === 'transparent'
                      ? 'transparent'
                      : backgroundMode === 'project'
                        ? '#101722'
                        : backgroundColor
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={largePreviewUrl}
                  alt="Captured large thumbnail preview"
                  className={`h-full w-full object-cover transition duration-300 ease-out ${isMirroringLarge ? 'scale-[0.97] opacity-75' : 'scale-100 opacity-100'
                    }`}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <a
              href={(selectedPreviewSize === 'small' ? smallPreviewUrl : largePreviewUrl) || undefined}
              download={selectedPreviewSize === 'small' ? 'thumbnail-small.png' : 'thumbnail.png'}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md border border-white/20 bg-white/5 text-white/85 transition hover:bg-white/10"
              aria-label="Download selected thumbnail"
              title="Download selected"
            >
              <DownloadIcon />
            </a>
            <button
              type="button"
              onClick={() => handleMirrorPreviewSize(selectedPreviewSize)}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md border border-white/20 bg-white/5 text-white/80 transition hover:bg-white/10"
              aria-label="Mirror selected thumbnail"
              title="Mirror selected"
            >
              <MirrorIcon />
            </button>
            <button
              type="button"
              onClick={() => handleSelectPreviewSize(selectedPreviewSize === 'small' ? 'large' : 'small')}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md border border-ember-300/60 bg-ember-400/15 text-ember-300 transition hover:brightness-110"
              aria-label="Switch selected thumbnail"
              title={selectedPreviewSize === 'small' ? 'Switch to large' : 'Switch to small'}
            >
              <SwitchIcon />
            </button>
          </div>
        </div>
      ) : null}

      {!headless && animationMessage ? (
        <p className={`mx-auto mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100 ${supportingPanelClassName}`}>
          {animationMessage}
        </p>
      ) : null}

      {!headless && hasModelSource && errorMessage ? (
        <p className={`mx-auto mt-3 rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100 ${supportingPanelClassName}`}>
          {errorMessage}
        </p>
      ) : null}

    </div>
  )
}

export default VrmLivePreview
