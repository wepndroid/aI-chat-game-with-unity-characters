import fs from 'node:fs/promises'
import path from 'node:path'
import {
  extractLoaderScriptPath,
  extractUnityConfigObjectLiteral
} from './webgl-index-instrumentation'

type WebglPreloadAssetKind = 'script' | 'wasm' | 'data' | 'symbols'
type WebglPreloadAssetPriority = 'high' | 'medium'

type WebglPreloadAsset = {
  url: string
  kind: WebglPreloadAssetKind
  bytes: number
  priority: WebglPreloadAssetPriority
}

type WebglReleasePreloadManifest = {
  releaseId: string
  versionLabel: string
  runtimeUrl: string
  totalBytes: number
  assets: WebglPreloadAsset[]
}

type BuildWebglReleasePreloadManifestOptions = {
  releaseId: string
  versionLabel: string
  runtimeUrl: string
  storagePath: string | null
  uploadsRoot?: string
}

type WebglAssetCandidate = {
  rawPath: string
  kind: WebglPreloadAssetKind
  priority: WebglPreloadAssetPriority
  required: boolean
}

const defaultUploadsRoot = path.resolve(path.join(process.cwd(), 'uploads'))
const absoluteUrlPattern = /^[a-z][a-z0-9+.-]*:/i
const encodedPathBoundaryPattern = /%(?:2e|2f|5c)/i

const assertSafeEncodedPathText = (value: string, message: string) => {
  let decodedValue: string
  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    throw new Error(message)
  }

  if (
    encodedPathBoundaryPattern.test(value) ||
    encodedPathBoundaryPattern.test(decodedValue) ||
    decodedValue.includes('?') ||
    decodedValue.includes('#') ||
    decodedValue.includes('\\')
  ) {
    throw new Error(message)
  }

  return decodedValue
}

const normalizeRuntimeUrlPath = (runtimeUrl: string) => {
  const trimmed = runtimeUrl.trim()
  if (!trimmed) {
    throw new Error('WebGL runtime URL is required before creating a preload manifest.')
  }
  assertSafeEncodedPathText(trimmed, 'WebGL runtime URL must point to a public uploaded WebGL release.')

  const parsed = new URL(trimmed, 'https://secretwaifu.local')
  if (parsed.search || parsed.hash || !parsed.pathname.startsWith('/uploads/game-releases/webgl/') || parsed.pathname.includes('..')) {
    throw new Error('WebGL runtime URL must point to a public uploaded WebGL release.')
  }

  return parsed.pathname
}

const assertPathInsideRoot = (root: string, target: string, message: string) => {
  const relativePath = path.relative(root, target)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(message)
  }
}

const resolveBuildRoot = (uploadsRoot: string, storagePath: string | null) => {
  if (!storagePath?.trim()) {
    throw new Error('WebGL release storage path is required before creating a preload manifest.')
  }

  const normalizedStoragePath = storagePath.trim().replace(/\\/g, '/')
  assertSafeEncodedPathText(normalizedStoragePath, 'WebGL release storage path resolved outside uploads.')
  if (
    absoluteUrlPattern.test(normalizedStoragePath) ||
    normalizedStoragePath.startsWith('//') ||
    normalizedStoragePath.startsWith('/') ||
    normalizedStoragePath.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('WebGL release storage path resolved outside uploads.')
  }

  const resolvedUploadsRoot = path.resolve(uploadsRoot)
  const releaseRoot = path.resolve(path.join(resolvedUploadsRoot, normalizedStoragePath))
  assertPathInsideRoot(resolvedUploadsRoot, releaseRoot, 'WebGL release storage path resolved outside uploads.')

  return path.join(releaseRoot, 'build')
}

const normalizeUnityAssetPath = (rawPath: string) => {
  const trimmed = rawPath.trim()
  if (!trimmed) {
    throw new Error('Unity WebGL asset path is empty.')
  }
  if (absoluteUrlPattern.test(trimmed) || trimmed.startsWith('//')) {
    throw new Error('WebGL preload manifest cannot include external URLs.')
  }

  const normalizedSlashes = trimmed.replace(/\\/g, '/')
  const decodedSlashes = assertSafeEncodedPathText(normalizedSlashes, 'Unity WebGL asset path resolved outside the WebGL release.')
  if (
    normalizedSlashes.startsWith('/') ||
    normalizedSlashes.includes('?') ||
    normalizedSlashes.includes('#') ||
    normalizedSlashes.split('/').some((segment) => segment === '' || segment === '.' || segment === '..') ||
    decodedSlashes.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('Unity WebGL asset path resolved outside the WebGL release.')
  }

  return path.posix.normalize(normalizedSlashes)
}

const readExistingFileSize = async (absolutePath: string, required: boolean) => {
  try {
    const stats = await fs.stat(absolutePath)
    if (!stats.isFile()) {
      throw new Error('not a file')
    }
    return stats.size
  } catch (error) {
    if (!required) {
      return null
    }
    throw new Error(`A required WebGL preload asset is missing: ${absolutePath}`)
  }
}

const extractUnityConfigStringValue = (unityConfigObjectLiteral: string, propertyName: string) => {
  const propertyPattern = new RegExp(`(?:^|[,{])\\s*["']?${propertyName}["']?\\s*:\\s*(["'\`])([\\s\\S]*?)\\1`, 'm')
  const match = unityConfigObjectLiteral.match(propertyPattern)
  return match?.[2]?.trim() ?? null
}

const buildUnityAssetCandidates = (indexHtml: string): WebglAssetCandidate[] => {
  const loaderScriptPath = extractLoaderScriptPath(indexHtml)
  const unityConfigObjectLiteral = extractUnityConfigObjectLiteral(indexHtml)
  const dataUrl = extractUnityConfigStringValue(unityConfigObjectLiteral, 'dataUrl')
  const frameworkUrl = extractUnityConfigStringValue(unityConfigObjectLiteral, 'frameworkUrl')
  const codeUrl = extractUnityConfigStringValue(unityConfigObjectLiteral, 'codeUrl')
  const symbolsUrl = extractUnityConfigStringValue(unityConfigObjectLiteral, 'symbolsUrl')

  if (!dataUrl || !frameworkUrl || !codeUrl) {
    throw new Error('The Unity WebGL config must include dataUrl, frameworkUrl, and codeUrl.')
  }

  return [
    { rawPath: loaderScriptPath, kind: 'script', priority: 'high', required: true },
    { rawPath: frameworkUrl, kind: 'script', priority: 'high', required: true },
    { rawPath: codeUrl, kind: 'wasm', priority: 'high', required: true },
    { rawPath: dataUrl, kind: 'data', priority: 'high', required: true },
    ...(symbolsUrl ? [{ rawPath: symbolsUrl, kind: 'symbols' as const, priority: 'medium' as const, required: false }] : [])
  ]
}

const toAssetPublicUrl = (runtimeUrlPath: string, normalizedAssetPath: string) => {
  const runtimeDirectory = runtimeUrlPath.replace(/\/[^/]*$/, '')
  return `${runtimeDirectory}/${normalizedAssetPath}`.replace(/\/{2,}/g, '/')
}

const buildWebglReleasePreloadManifest = async (
  options: BuildWebglReleasePreloadManifestOptions
): Promise<WebglReleasePreloadManifest> => {
  const uploadsRoot = path.resolve(options.uploadsRoot ?? defaultUploadsRoot)
  const buildRoot = resolveBuildRoot(uploadsRoot, options.storagePath)
  const indexHtmlPath = path.join(buildRoot, 'index.html')
  assertPathInsideRoot(uploadsRoot, indexHtmlPath, 'WebGL index path resolved outside uploads.')

  const indexHtml = await fs.readFile(indexHtmlPath, 'utf8')
  const runtimeUrlPath = normalizeRuntimeUrlPath(options.runtimeUrl)
  const assetCandidates = buildUnityAssetCandidates(indexHtml)
  const assets: WebglPreloadAsset[] = []

  for (const candidate of assetCandidates) {
    const normalizedAssetPath = normalizeUnityAssetPath(candidate.rawPath)
    const absoluteAssetPath = path.resolve(path.join(buildRoot, normalizedAssetPath))
    assertPathInsideRoot(buildRoot, absoluteAssetPath, 'Unity WebGL asset path resolved outside the WebGL release.')

    const bytes = await readExistingFileSize(absoluteAssetPath, candidate.required)
    if (bytes === null) {
      continue
    }

    assets.push({
      url: toAssetPublicUrl(runtimeUrlPath, normalizedAssetPath),
      kind: candidate.kind,
      bytes,
      priority: candidate.priority
    })
  }

  return {
    releaseId: options.releaseId,
    versionLabel: options.versionLabel,
    runtimeUrl: runtimeUrlPath,
    totalBytes: assets.reduce((totalBytes, asset) => totalBytes + asset.bytes, 0),
    assets
  }
}

export { buildWebglReleasePreloadManifest }
export type {
  BuildWebglReleasePreloadManifestOptions,
  WebglPreloadAsset,
  WebglPreloadAssetKind,
  WebglPreloadAssetPriority,
  WebglReleasePreloadManifest
}
