/**
 * VRM loading for this app: three.js GLTFLoader + @pixiv/three-vrm VRMLoaderPlugin.
 * All VRM preview / viewer paths should go through here so the stack stays consistent.
 */
import type { Object3D } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { VRM } from '@pixiv/three-vrm'

export type { VRM }

export type VrmLoadedGltf = GLTF & {
  userData: {
    vrm?: VRM
  }
}

export type VrmRuntime = {
  GLTFLoader: typeof import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader
  MToonMaterialLoaderPlugin: typeof import('@pixiv/three-vrm').MToonMaterialLoaderPlugin
  VRMUtils: typeof import('@pixiv/three-vrm').VRMUtils
  VRMLoaderPlugin: typeof import('@pixiv/three-vrm').VRMLoaderPlugin
}

/**
 * Dynamic imports for three + @pixiv/three-vrm (keeps initial bundle small).
 */
export async function loadVrmRuntime(): Promise<VrmRuntime> {
  const [{ GLTFLoader }, { MToonMaterialLoaderPlugin, VRMUtils, VRMLoaderPlugin }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm')
  ])

  return { GLTFLoader, MToonMaterialLoaderPlugin, VRMUtils, VRMLoaderPlugin }
}

/**
 * Creates a GLTFLoader registered with VRMLoaderPlugin so .vrm (GLB+VRM) parses correctly.
 */
export function createVrmGLTFLoader(runtime: VrmRuntime) {
  const loader = new runtime.GLTFLoader()
  loader.crossOrigin = 'anonymous'
  loader.register((parser) => {
    const mtoonMaterialPlugin = new runtime.MToonMaterialLoaderPlugin(parser, {
      // VRoid exports frequently rely on the older VRM0 shade behavior.
      // Enabling this keeps the live preview closer to what users see in VRoid.
      v0CompatShade: true
    })

    return new runtime.VRMLoaderPlugin(parser, {
      mtoonMaterialPlugin
    })
  })
  return loader
}

/**
 * Mesh/skeleton optimization via @pixiv/three-vrm VRMUtils (combineSkeletons replaces deprecated removeUnnecessaryJoints).
 */
export function optimizeVrmSceneForRendering(runtime: VrmRuntime, root: Object3D) {
  try {
    runtime.VRMUtils.removeUnnecessaryVertices(root)
  } catch (error) {
    console.warn('[vrm-three] Skipped removeUnnecessaryVertices for this VRM', error)
  }

  try {
    runtime.VRMUtils.combineSkeletons(root)
  } catch (error) {
    console.warn('[vrm-three] Skipped combineSkeletons for this VRM', error)
  }
}

export function getVrmFromGltfUserData(gltf: VrmLoadedGltf): VRM | null {
  return gltf.userData.vrm ?? null
}
