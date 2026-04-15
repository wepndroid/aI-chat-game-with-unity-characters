'use client'

import { createVrmGLTFLoader, getVrmFromGltfUserData, loadVrmRuntime, optimizeVrmSceneForRendering } from '@/lib/vrm-three'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { VRM, VrmLoadedGltf } from '@/lib/vrm-three'

type VrmLivePreviewProps = {
  selectedFile: File | null
  existingVrmUrl?: string | null
  existingPreviewImageUrl?: string | null
  onThumbnailGenerated: (file: File) => void
}

const DANCE_FBX_URL = '/animations/dance.fbx'
const ENABLE_HIPS_TRANSLATION = false
const MAX_HIPS_Y_OFFSET_METERS = 0.015

const MIXAMO_TO_VRM_BONE: Record<string, string> = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'chest',
  spine2: 'upperChest',
  neck: 'neck',
  head: 'head',
  leftshoulder: 'leftShoulder',
  leftarm: 'leftUpperArm',
  leftforearm: 'leftLowerArm',
  lefthand: 'leftHand',
  leftupleg: 'leftUpperLeg',
  leftleg: 'leftLowerLeg',
  leftfoot: 'leftFoot',
  lefttoebase: 'leftToes',
  rightshoulder: 'rightShoulder',
  rightarm: 'rightUpperArm',
  rightforearm: 'rightLowerArm',
  righthand: 'rightHand',
  rightupleg: 'rightUpperLeg',
  rightleg: 'rightLowerLeg',
  rightfoot: 'rightFoot',
  righttoebase: 'rightToes'
}

const normalizeMixamoBoneName = (rawName: string) => {
  return rawName
    .replace(/^mixamorig[:_]?/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
}

const disposeMaterial = (material: THREE.Material) => {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}

/** Resolve Mixamo FBX bones when track path and node.name differ slightly. */
const findSourceBoneByName = (sourceRoot: THREE.Object3D, rawTrackBoneName: string) => {
  const exact = sourceRoot.getObjectByName(rawTrackBoneName)
  if (exact) {
    return exact
  }

  const normalizedTrackName = normalizeMixamoBoneName(rawTrackBoneName)
  let matched: THREE.Object3D | null = null
  sourceRoot.traverse((node) => {
    if (matched) {
      return
    }
    if (normalizeMixamoBoneName(node.name) === normalizedTrackName) {
      matched = node
    }
  })
  return matched
}

/**
 * Pure quaternion retarget: align Mixamo bind pose to VRM bind pose per bone, then apply
 * animated local quaternions. This is the closest “1:1 quaternion” mapping without a full
 * skeleton IK solver (still not identical to Mixamo preview on a different rig).
 */
const createRetargetedClipForVrm = (
  sourceClip: THREE.AnimationClip,
  sourceRoot: THREE.Object3D,
  vrm: VRM
) => {
  const tracks: THREE.KeyframeTrack[] = []

  let skippedUnknownBone = 0
  let skippedMissingTarget = 0
  let skippedMissingSource = 0
  let skippedUnsupportedTrack = 0
  let mappedQuaternionTracks = 0
  let mappedPositionTracks = 0

  for (const track of sourceClip.tracks) {
    const trackMatch = track.name.match(/^([^.]*)\.(quaternion|position)$/)
    if (!trackMatch) {
      skippedUnsupportedTrack += 1
      continue
    }

    const sourceBoneRaw = trackMatch[1]
    const property = trackMatch[2]
    const normalizedSourceBone = normalizeMixamoBoneName(sourceBoneRaw)
    const vrmBoneName = MIXAMO_TO_VRM_BONE[normalizedSourceBone]

    if (!vrmBoneName) {
      skippedUnknownBone += 1
      continue
    }

    const targetBone = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as never)
    if (!targetBone) {
      skippedMissingTarget += 1
      continue
    }

    const sourceBone = findSourceBoneByName(sourceRoot, sourceBoneRaw)
    if (!sourceBone) {
      skippedMissingSource += 1
      continue
    }

    if (property === 'quaternion' && track instanceof THREE.QuaternionKeyframeTrack) {
      const sourceRestQuat = sourceBone.quaternion.clone().normalize()
      const targetRestQuat = targetBone.quaternion.clone().normalize()
      const restOffsetQuat = targetRestQuat.clone().multiply(sourceRestQuat.clone().invert()).normalize()
      const correctedValues = [...track.values]

      const sourceKeyQuat = new THREE.Quaternion()
      const correctedKeyQuat = new THREE.Quaternion()

      for (let index = 0; index < correctedValues.length; index += 4) {
        sourceKeyQuat.set(
          correctedValues[index],
          correctedValues[index + 1],
          correctedValues[index + 2],
          correctedValues[index + 3]
        ).normalize()

        correctedKeyQuat.copy(restOffsetQuat).multiply(sourceKeyQuat).normalize()

        correctedValues[index] = correctedKeyQuat.x
        correctedValues[index + 1] = correctedKeyQuat.y
        correctedValues[index + 2] = correctedKeyQuat.z
        correctedValues[index + 3] = correctedKeyQuat.w
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${targetBone.name}.quaternion`,
          [...track.times],
          correctedValues
        )
      )

      mappedQuaternionTracks += 1
      continue
    }

    if (property === 'position' && normalizedSourceBone === 'hips' && track instanceof THREE.VectorKeyframeTrack) {
      if (!ENABLE_HIPS_TRANSLATION) {
        continue
      }

      const values = [...track.values]
      for (let index = 0; index < values.length; index += 3) {
        values[index] = 0
        values[index + 1] = THREE.MathUtils.clamp(values[index + 1] * 0.01, -MAX_HIPS_Y_OFFSET_METERS, MAX_HIPS_Y_OFFSET_METERS)
        values[index + 2] = 0
      }

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${targetBone.name}.position`,
          [...track.times],
          values
        )
      )

      mappedPositionTracks += 1
      continue
    }
  }

  console.info('[VrmLivePreview] Retarget summary', {
    clipName: sourceClip.name,
    sourceTrackCount: sourceClip.tracks.length,
    outputTrackCount: tracks.length,
    mappedQuaternionTracks,
    mappedPositionTracks,
    hipsTranslationEnabled: ENABLE_HIPS_TRANSLATION,
    skippedUnknownBone,
    skippedMissingTarget,
    skippedMissingSource,
    skippedUnsupportedTrack
  })

  return new THREE.AnimationClip(
    `${sourceClip.name || 'dance'}-retargeted`,
    sourceClip.duration,
    tracks
  )
}

const VrmLivePreview = ({
  selectedFile,
  existingVrmUrl,
  existingPreviewImageUrl,
  onThumbnailGenerated
}: VrmLivePreviewProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)
  const clipRef = useRef<THREE.AnimationClip | null>(null)
  const loadGenerationRef = useRef(0)
  const isPlayingRef = useRef(true)
  const initialCameraRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [animationMessage, setAnimationMessage] = useState<string | null>(null)
  const hasModelSource = Boolean(selectedFile || existingVrmUrl?.trim())
  const [isPlaying, setIsPlaying] = useState(true)
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl)
      }
    }
  }, [capturedPreviewUrl])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const fallbackUrl = existingVrmUrl?.trim() || null
    const modelUrl = selectedFile ? URL.createObjectURL(selectedFile) : fallbackUrl
    if (!modelUrl) {
      return () => undefined
    }

    let disposed = false
    let frameId = 0
    const clock = new THREE.Clock()
    isPlayingRef.current = true
    const loadGeneration = ++loadGenerationRef.current

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#101b30')

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200)
    camera.position.set(0, 1.35, 2.2)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.innerHTML = ''
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer
    sceneRef.current = scene

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.2, 0)
    controls.enableDamping = true
    controls.minDistance = 1.3
    controls.maxDistance = 3.4
    controls.update()
    controlsRef.current = controls
    cameraRef.current = camera
    initialCameraRef.current = {
      position: camera.position.clone(),
      target: controls.target.clone()
    }

    const hemiLight = new THREE.HemisphereLight('#cfe6ff', '#273244', 0.95)
    scene.add(hemiLight)

    const keyLight = new THREE.DirectionalLight('#ffffff', 1.35)
    keyLight.position.set(2.2, 3.4, 2.8)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight('#6ba7ff', 0.4)
    fillLight.position.set(-2.6, 1.4, -2.1)
    scene.add(fillLight)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 48),
      new THREE.MeshStandardMaterial({ color: '#0b1628', roughness: 0.92, metalness: 0.03 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    scene.add(floor)

    const resize = () => {
      const nextWidth = Math.max(container.clientWidth, 240)
      const nextHeight = Math.max(container.clientHeight, 280)
      renderer.setSize(nextWidth, nextHeight, false)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    }

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
      rendererRef.current?.dispose()
      controlsRef.current = null
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      mixerRef.current = null
      actionRef.current = null
      clipRef.current = null
      container.innerHTML = ''
    }

    const animate = (vrm: VRM) => {
      const delta = clock.getDelta()
      if (isPlayingRef.current) {
        mixerRef.current?.update(delta)
      }
      vrm.update(delta)
      controls.update()
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(() => animate(vrm))
    }

    resize()
    window.addEventListener('resize', resize)

    void Promise.resolve().then(async () => {
      try {
        const runtime = await loadVrmRuntime()
        if (disposed) {
          return
        }

        const loader = createVrmGLTFLoader(runtime)
        loader.load(
          modelUrl,
          (loadedGltf) => {
            if (disposed || loadGenerationRef.current !== loadGeneration) {
              return
            }
            setIsPlaying(true)

            const gltf = loadedGltf as VrmLoadedGltf
            const vrm = getVrmFromGltfUserData(gltf)
            if (!vrm) {
              setErrorMessage('Failed to read VRM data for preview.')
              return
            }

            optimizeVrmSceneForRendering(runtime, vrm.scene)
            vrm.scene.traverse((node) => {
              if ('castShadow' in node) {
                ;(node as THREE.Mesh).castShadow = true
              }
            })
            vrm.scene.rotation.y = Math.PI
            scene.add(vrm.scene)
            isPlayingRef.current = true
            setIsPlaying(true)

            actionRef.current?.stop()
            actionRef.current = null

            mixerRef.current?.stopAllAction()
            mixerRef.current = null
            setErrorMessage(null)

            const fitBox = new THREE.Box3().setFromObject(vrm.scene)
            const fitSize = fitBox.getSize(new THREE.Vector3())
            const fitCenter = fitBox.getCenter(new THREE.Vector3())
            controls.target.copy(new THREE.Vector3(fitCenter.x, fitCenter.y + fitSize.y * 0.1, fitCenter.z))
            const maxDim = Math.max(fitSize.x, fitSize.y, fitSize.z)
            const fovRadians = (camera.fov * Math.PI) / 180
            const fitDistance = Math.max(1.2, (maxDim / 2) / Math.tan(fovRadians / 2) * 1.25)
            camera.near = Math.max(0.01, fitDistance / 200)
            camera.far = Math.max(200, fitDistance * 20)
            camera.position.set(fitCenter.x, fitCenter.y + fitSize.y * 0.45, fitCenter.z + fitDistance)
            camera.updateProjectionMatrix()
            controls.update()
            initialCameraRef.current = {
              position: camera.position.clone(),
              target: controls.target.clone()
            }

            // Prefer real dance clip from bundled FBX (fallback is non-blocking preview).
            void Promise.resolve().then(async () => {
              try {
                const fbxLoader = new FBXLoader()
                const fbx = await fbxLoader.loadAsync(DANCE_FBX_URL)
                if (disposed || loadGenerationRef.current !== loadGeneration) {
                  return
                }
                const sourceClip = fbx.animations?.[0]
                if (!sourceClip) {
                  console.warn('[VrmLivePreview] No animation clips found in dance.fbx')
                  setAnimationMessage('Dance file found, but no clip was inside it. You can still capture thumbnails.')
                  return
                }

                const retargetedClip = createRetargetedClipForVrm(sourceClip, fbx, vrm)
                if (retargetedClip.tracks.length === 0) {
                  console.warn('[VrmLivePreview] Retargeting produced zero tracks')
                  setAnimationMessage('Dance retarget failed. Preview is still available for capture.')
                  return
                }

                mixerRef.current = new THREE.AnimationMixer(vrm.scene)
                const action = mixerRef.current.clipAction(retargetedClip)
                action.setLoop(THREE.LoopRepeat, Infinity)
                action.clampWhenFinished = false
                action.paused = !isPlayingRef.current
                action.play()
                actionRef.current = action
                clipRef.current = retargetedClip
                setAnimationMessage(null)
              } catch (error) {
                console.warn('[VrmLivePreview] Failed to load/retarget dance.fbx', error)
                setAnimationMessage('Dance animation unavailable right now. Preview and capture still work.')
              }
            })

            animate(vrm)
          },
          undefined,
          () => {
            setErrorMessage('Could not load this VRM file for preview.')
          }
        )
      } catch {
        setErrorMessage('Could not initialize the 3D preview.')
      }
    })

    return () => {
      disposed = true
      window.removeEventListener('resize', resize)
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      cleanupRenderer()
      if (selectedFile) {
        URL.revokeObjectURL(modelUrl)
      }
    }
  }, [existingVrmUrl, selectedFile])

  const handleTogglePlayback = () => {
    const nextIsPlaying = !isPlayingRef.current
    isPlayingRef.current = nextIsPlaying
    setIsPlaying(nextIsPlaying)
    if (actionRef.current) {
      actionRef.current.paused = !nextIsPlaying
    }
  }

  const handleResetCamera = () => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const initialCamera = initialCameraRef.current
    if (!camera || !controls || !initialCamera) {
      return
    }
    camera.position.copy(initialCamera.position)
    controls.target.copy(initialCamera.target)
    controls.update()
  }

  const handleCaptureThumbnail = () => {
    const renderer = rendererRef.current
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!renderer) {
      return
    }
    if (scene && camera && controls) {
      controls.update()
      renderer.render(scene, camera)
    }
    renderer.domElement.toBlob(
      (blob) => {
        if (!blob) {
          return
        }
        const file = new File([blob], `vrm-thumbnail-${Date.now()}.png`, { type: 'image/png' })
        onThumbnailGenerated(file)
        const nextUrl = URL.createObjectURL(file)
        setCapturedPreviewUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl)
          }
          return nextUrl
        })
      },
      'image/png',
      0.98
    )
  }

  return (
    <div className="mt-6 rounded-md border border-white/10 bg-[#101722]/95 p-4 md:p-5">
      <h3 className="text-center font-[family-name:var(--font-heading)] text-3xl font-normal italic text-ember-300">Live 3D Preview</h3>
      <p className="mt-1 text-center text-sm text-white/70">Drag to rotate. Scroll to zoom. Dance auto-plays from bundled animation.</p>

      <div className="mx-auto mt-4 aspect-[3/4] w-full max-w-[330px] overflow-hidden rounded-xl border border-white/15 bg-[#0d1526]">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div className="mx-auto mt-3 flex max-w-[330px] flex-wrap gap-2">
        <button
          type="button"
          onClick={handleTogglePlayback}
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/25 bg-white/5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 transition hover:bg-white/10"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={handleResetCamera}
          className="inline-flex h-9 items-center justify-center rounded-md border border-white/25 bg-white/5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 transition hover:bg-white/10"
        >
          Reset Camera
        </button>
        <button
          type="button"
          onClick={handleCaptureThumbnail}
          className="inline-flex h-9 items-center justify-center rounded-md bg-gradient-to-r from-ember-400 to-ember-500 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition hover:brightness-110"
        >
          Capture Thumbnail
        </button>
      </div>

      {(capturedPreviewUrl || existingPreviewImageUrl) ? (
        <div className="mx-auto mt-3 max-w-[330px]">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/50">Thumbnail preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedPreviewUrl ?? existingPreviewImageUrl ?? ''}
            alt="Generated thumbnail preview"
            className="h-28 w-28 rounded-md border border-white/15 object-cover object-top"
          />
        </div>
      ) : null}

      {animationMessage ? (
        <p className="mx-auto mt-3 max-w-[330px] rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
          {animationMessage}
        </p>
      ) : null}

      {hasModelSource && errorMessage ? (
        <p className="mx-auto mt-3 max-w-[330px] rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}

export default VrmLivePreview
