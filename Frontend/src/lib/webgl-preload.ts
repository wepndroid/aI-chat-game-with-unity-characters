import { buildApiUrl, getApiBaseUrl } from '@/lib/api-client'

type WebglPreloadAssetKind = 'script' | 'wasm' | 'data' | 'symbols'
type WebglPreloadAssetPriority = 'high' | 'medium'
type WebglPreloadMode = 'background' | 'intent' | 'launch'

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

type WebglPreloadPolicyInput = {
  mode: WebglPreloadMode
  visibilityState: DocumentVisibilityState | 'unknown'
  saveData: boolean
  effectiveType: string | null
  deviceMemory: number | null
}

type WebglPreloadOptions = {
  mode?: WebglPreloadMode
}

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
}

type NavigatorWithResourceHints = Navigator & {
  connection?: NetworkInformationLike
  deviceMemory?: number
}

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
}

type PublicGameReleasesPayload = {
  data?: {
    webgl?: {
      preloadManifest?: unknown
    } | null
  }
}

const uploadedWebglPathPrefix = '/uploads/game-releases/webgl/'
const blockedPreloadPathPrefixes = [
  '/api/auth/',
  '/api/sessions',
  '/api/characters/assets/vrm/',
  '/api/admin/',
  '/api/tts/',
  '/api/chat/'
]
const validAssetKinds = new Set<WebglPreloadAssetKind>(['script', 'wasm', 'data', 'symbols'])
const validAssetPriorities = new Set<WebglPreloadAssetPriority>(['high', 'medium'])
const preloadedReleaseKeys = new Set<string>()
const encodedPathBoundaryPattern = /%(?:2e|2f|5c)/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isPublicWebglPathShape = (value: string) => {
  if (!value.startsWith(uploadedWebglPathPrefix)) {
    return false
  }
  if (value.startsWith('//') || value.includes('\\') || value.includes('..') || value.includes('?') || value.includes('#')) {
    return false
  }
  if (blockedPreloadPathPrefixes.some((prefix) => value.startsWith(prefix))) {
    return false
  }

  return true
}

const isSafePublicWebglPath = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (!isPublicWebglPathShape(trimmed) || encodedPathBoundaryPattern.test(trimmed)) {
    return false
  }

  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(trimmed)
  } catch {
    return false
  }

  if (encodedPathBoundaryPattern.test(decodedPath) || !isPublicWebglPathShape(decodedPath)) {
    return false
  }

  return true
}

const normalizeWebglPreloadAsset = (value: unknown): WebglPreloadAsset | null => {
  if (!isRecord(value)) {
    return null
  }

  const url = typeof value.url === 'string' ? value.url.trim() : ''
  const kind = typeof value.kind === 'string' ? value.kind : ''
  const priority = typeof value.priority === 'string' ? value.priority : ''

  if (!isSafePublicWebglPath(url) || !validAssetKinds.has(kind as WebglPreloadAssetKind)) {
    return null
  }
  if (!isFiniteNonNegativeNumber(value.bytes) || !validAssetPriorities.has(priority as WebglPreloadAssetPriority)) {
    return null
  }

  return {
    url,
    kind: kind as WebglPreloadAssetKind,
    bytes: Math.round(value.bytes),
    priority: priority as WebglPreloadAssetPriority
  }
}

const normalizeWebglPreloadManifest = (value: unknown): WebglReleasePreloadManifest | null => {
  if (!isRecord(value)) {
    return null
  }

  const releaseId = typeof value.releaseId === 'string' ? value.releaseId.trim() : ''
  const versionLabel = typeof value.versionLabel === 'string' ? value.versionLabel.trim() : ''
  const runtimeUrl = typeof value.runtimeUrl === 'string' ? value.runtimeUrl.trim() : ''
  const rawAssets = Array.isArray(value.assets) ? value.assets : null

  if (!releaseId || !versionLabel || !isSafePublicWebglPath(runtimeUrl) || !rawAssets) {
    return null
  }
  if (!isFiniteNonNegativeNumber(value.totalBytes)) {
    return null
  }

  const assets = rawAssets.map(normalizeWebglPreloadAsset)
  if (assets.length === 0 || assets.some((asset) => asset === null)) {
    return null
  }

  return {
    releaseId,
    versionLabel,
    runtimeUrl,
    totalBytes: Math.round(value.totalBytes),
    assets: assets as WebglPreloadAsset[]
  }
}

const shouldStartWebglPreload = (policy: WebglPreloadPolicyInput) => {
  if (policy.mode === 'launch') {
    return true
  }
  if (policy.visibilityState === 'hidden') {
    return false
  }
  if (policy.saveData) {
    return false
  }
  if (policy.effectiveType === 'slow-2g' || policy.effectiveType === '2g') {
    return false
  }
  if (policy.deviceMemory !== null && policy.deviceMemory > 0 && policy.deviceMemory < 2) {
    return false
  }

  return true
}

const resolveCurrentPreloadPolicy = (mode: WebglPreloadMode): WebglPreloadPolicyInput | null => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof navigator === 'undefined') {
    return null
  }

  const navigatorWithHints = navigator as NavigatorWithResourceHints

  return {
    mode,
    visibilityState: document.visibilityState ?? 'unknown',
    saveData: Boolean(navigatorWithHints.connection?.saveData),
    effectiveType: navigatorWithHints.connection?.effectiveType ?? null,
    deviceMemory: typeof navigatorWithHints.deviceMemory === 'number' ? navigatorWithHints.deviceMemory : null
  }
}

const resolveApiOrigin = () => new URL(getApiBaseUrl()).origin

const resolvePublicPreloadUrl = (url: string) => new URL(url, resolveApiOrigin()).toString()

const resolveAssetFetchType = (asset: WebglPreloadAsset) => {
  switch (asset.kind) {
    case 'script':
      return 'script'
    case 'wasm':
    case 'data':
    case 'symbols':
      return 'fetch'
  }
}

const resolveAssetMimeType = (asset: WebglPreloadAsset) => {
  if (asset.kind === 'script') {
    return 'application/javascript'
  }
  if (asset.kind === 'wasm') {
    return 'application/wasm'
  }
  if (asset.kind === 'data') {
    return 'application/octet-stream'
  }
  return 'application/json'
}

const appendPreloadLink = (asset: WebglPreloadAsset, mode: WebglPreloadMode) => {
  const href = resolvePublicPreloadUrl(asset.url)
  const existingLink = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-secretwaifu-webgl-preload]')).find(
    (link) => link.dataset.secretwaifuWebglPreload === href
  )
  if (existingLink) {
    return
  }

  const link = document.createElement('link')
  link.rel = 'preload'
  link.href = href
  link.as = resolveAssetFetchType(asset)
  link.type = resolveAssetMimeType(asset)
  link.crossOrigin = 'anonymous'
  link.dataset.secretwaifuWebglPreload = href
  ;(link as HTMLLinkElement & { fetchPriority?: string }).fetchPriority = mode === 'background' ? 'low' : 'high'
  document.head.appendChild(link)
}

const warmFetchCache = (url: string) => {
  void fetch(resolvePublicPreloadUrl(url), {
    method: 'GET',
    credentials: 'omit',
    cache: 'force-cache',
    mode: 'cors'
  }).catch(() => undefined)
}

const startWebglReleasePreload = (manifest: WebglReleasePreloadManifest | null, options: WebglPreloadOptions = {}) => {
  const normalizedManifest = normalizeWebglPreloadManifest(manifest)
  if (!normalizedManifest || typeof document === 'undefined') {
    return false
  }

  const mode = options.mode ?? 'background'
  const currentPolicy = resolveCurrentPreloadPolicy(mode)
  if (!currentPolicy || !shouldStartWebglPreload(currentPolicy)) {
    return false
  }

  const releaseKey = `${normalizedManifest.releaseId}:${normalizedManifest.runtimeUrl}:${normalizedManifest.totalBytes}:${normalizedManifest.assets.length}`
  if (preloadedReleaseKeys.has(releaseKey)) {
    return true
  }
  preloadedReleaseKeys.add(releaseKey)

  warmFetchCache(normalizedManifest.runtimeUrl)
  for (const asset of normalizedManifest.assets) {
    appendPreloadLink(asset, mode)
    warmFetchCache(asset.url)
  }

  return true
}

const scheduleWebglReleasePreload = (manifest: WebglReleasePreloadManifest | null, options: WebglPreloadOptions = {}) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const mode = options.mode ?? 'background'
  const currentPolicy = resolveCurrentPreloadPolicy(mode)
  if (!currentPolicy || !shouldStartWebglPreload(currentPolicy)) {
    return () => {}
  }

  const windowWithIdleCallback = window as WindowWithIdleCallback
  let cancelled = false
  let timeoutId: number | null = null
  let idleCallbackId: number | null = null
  const runPreload = () => {
    if (!cancelled) {
      startWebglReleasePreload(manifest, { mode })
    }
  }

  if (mode === 'background' && windowWithIdleCallback.requestIdleCallback) {
    idleCallbackId = windowWithIdleCallback.requestIdleCallback(runPreload, { timeout: 2500 })
  } else {
    timeoutId = window.setTimeout(runPreload, mode === 'background' ? 800 : 0)
  }

  return () => {
    cancelled = true
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
    if (idleCallbackId !== null && windowWithIdleCallback.cancelIdleCallback) {
      windowWithIdleCallback.cancelIdleCallback(idleCallbackId)
    }
  }
}

const fetchPublicWebglPreloadManifest = async () => {
  const response = await fetch(buildApiUrl('/game-releases/public'), {
    method: 'GET',
    credentials: 'omit'
  })

  if (!response.ok) {
    return null
  }

  const payload = (await response.json().catch(() => null)) as PublicGameReleasesPayload | null
  return normalizeWebglPreloadManifest(payload?.data?.webgl?.preloadManifest ?? null)
}

export {
  fetchPublicWebglPreloadManifest,
  normalizeWebglPreloadManifest,
  scheduleWebglReleasePreload,
  shouldStartWebglPreload,
  startWebglReleasePreload
}
export type {
  WebglPreloadAsset,
  WebglPreloadAssetKind,
  WebglPreloadAssetPriority,
  WebglPreloadMode,
  WebglPreloadPolicyInput,
  WebglReleasePreloadManifest
}
