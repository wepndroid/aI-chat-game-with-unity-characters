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
  VRMUtils: typeof import('@pixiv/three-vrm').VRMUtils
  VRMLoaderPlugin: typeof import('@pixiv/three-vrm').VRMLoaderPlugin
}

/**
 * Dynamic imports for three + @pixiv/three-vrm (keeps initial bundle small).
 */
export async function loadVrmRuntime(): Promise<VrmRuntime> {
  const [{ GLTFLoader }, { VRMUtils, VRMLoaderPlugin }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm')
  ])

  return { GLTFLoader, VRMUtils, VRMLoaderPlugin }
}

/**
 * Creates a GLTFLoader registered with VRMLoaderPlugin so .vrm (GLB+VRM) parses correctly.
 */
export function createVrmGLTFLoader(runtime: VrmRuntime) {
  const loader = new runtime.GLTFLoader()
  loader.crossOrigin = 'anonymous'
  loader.register((parser) => new runtime.VRMLoaderPlugin(parser))
  return loader
}

/**
 * Mesh/skeleton optimization via @pixiv/three-vrm VRMUtils (combineSkeletons replaces deprecated removeUnnecessaryJoints).
 */
export function optimizeVrmSceneForRendering(runtime: VrmRuntime, root: Object3D) {
  runtime.VRMUtils.removeUnnecessaryVertices(root)
  runtime.VRMUtils.combineSkeletons(root)
}

export function getVrmFromGltfUserData(gltf: VrmLoadedGltf): VRM | null {
  return gltf.userData.vrm ?? null
}
