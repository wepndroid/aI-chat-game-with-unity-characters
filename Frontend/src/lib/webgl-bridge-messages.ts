const WEBGL_AUTH_TOKEN_MAX_CHARS = 4096
const WEBGL_ERROR_CODE_MAX_CHARS = 64
const WEBGL_ERROR_MESSAGE_MAX_CHARS = 180

const WEBGL_BRIDGE_MESSAGE_TYPES = {
  progress: 'secretwaifu-webgl:progress',
  ready: 'secretwaifu-webgl:ready',
  error: 'secretwaifu-webgl:error',
  authSessionReady: 'secretwaifu-webgl:auth-session-ready',
  apiToken: 'secretwaifu-auth:api-token',
  apiTokenRefresh: 'secretwaifu-auth:api-token-refresh',
  launchToken: 'secretwaifu-webgl:launch-token'
} as const

type WebglBridgeMessageType = (typeof WEBGL_BRIDGE_MESSAGE_TYPES)[keyof typeof WEBGL_BRIDGE_MESSAGE_TYPES]

type WebglProgressMessage = {
  type: typeof WEBGL_BRIDGE_MESSAGE_TYPES.progress
  progress: number
  downloadedBytes?: number
  totalBytes?: number
}

type WebglReadyMessage = {
  type: typeof WEBGL_BRIDGE_MESSAGE_TYPES.ready
  progress?: number
  totalBytes?: number
}

type WebglLoaderErrorMessage = {
  type: typeof WEBGL_BRIDGE_MESSAGE_TYPES.error
  code: string
  message: string
}

type WebglApiTokenPayload = {
  token: string
  expiresAt: string
  tokenType: 'Bearer'
}

type WebglAuthSessionReadyMessage = {
  type: typeof WEBGL_BRIDGE_MESSAGE_TYPES.authSessionReady
  expiresAt: string
}

type WebglLaunchTokenPayload = {
  launchToken: string
  expiresAt: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isWebglProgressMessage = (value: unknown): value is WebglProgressMessage => {
  if (!isRecord(value)) {
    return false
  }

  return value.type === WEBGL_BRIDGE_MESSAGE_TYPES.progress && isFiniteNumber(value.progress)
}

const isWebglReadyMessage = (value: unknown): value is WebglReadyMessage => {
  if (!isRecord(value)) {
    return false
  }

  return value.type === WEBGL_BRIDGE_MESSAGE_TYPES.ready
}

const isSafeWebglErrorCode = (value: unknown) => {
  return typeof value === 'string' && value.length > 0 && value.length <= WEBGL_ERROR_CODE_MAX_CHARS && /^[a-z0-9-]+$/.test(value)
}

const isSafeWebglErrorMessage = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > WEBGL_ERROR_MESSAGE_MAX_CHARS) {
    return false
  }

  return !/[\r\n]|https?:\/\/|bearer|token|stack/i.test(value)
}

const isWebglLoaderErrorMessage = (value: unknown): value is WebglLoaderErrorMessage => {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.type === WEBGL_BRIDGE_MESSAGE_TYPES.error &&
    isSafeWebglErrorCode(value.code) &&
    isSafeWebglErrorMessage(value.message)
  )
}

const isWebglAuthSessionReadyMessage = (value: unknown): value is WebglAuthSessionReadyMessage => {
  if (!isRecord(value)) {
    return false
  }

  return value.type === WEBGL_BRIDGE_MESSAGE_TYPES.authSessionReady && typeof value.expiresAt === 'string' && value.expiresAt.trim().length > 0
}

const isKnownWebglIframeMessage = (
  value: unknown
): value is WebglProgressMessage | WebglReadyMessage | WebglLoaderErrorMessage | WebglAuthSessionReadyMessage => {
  return (
    isWebglProgressMessage(value) ||
    isWebglReadyMessage(value) ||
    isWebglLoaderErrorMessage(value) ||
    isWebglAuthSessionReadyMessage(value)
  )
}

const assertWebglApiTokenPayload = (payload: WebglApiTokenPayload) => {
  if (!payload.token || payload.token.length > WEBGL_AUTH_TOKEN_MAX_CHARS) {
    throw new Error('Invalid WebGL API token payload.')
  }
  if (!payload.expiresAt || payload.tokenType !== 'Bearer') {
    throw new Error('Invalid WebGL API token payload.')
  }
}

const postWebglApiTokenMessage = (
  targetWindow: Window,
  targetOrigin: string,
  payload: WebglApiTokenPayload,
  type: typeof WEBGL_BRIDGE_MESSAGE_TYPES.apiToken | typeof WEBGL_BRIDGE_MESSAGE_TYPES.apiTokenRefresh
) => {
  assertWebglApiTokenPayload(payload)

  targetWindow.postMessage(
    {
      type,
      token: payload.token,
      expiresAt: payload.expiresAt,
      tokenType: payload.tokenType
    },
    targetOrigin
  )
}

const postWebglApiToken = (targetWindow: Window, targetOrigin: string, payload: WebglApiTokenPayload) => {
  postWebglApiTokenMessage(targetWindow, targetOrigin, payload, WEBGL_BRIDGE_MESSAGE_TYPES.apiToken)
}

const postWebglApiTokenRefresh = (targetWindow: Window, targetOrigin: string, payload: WebglApiTokenPayload) => {
  postWebglApiTokenMessage(targetWindow, targetOrigin, payload, WEBGL_BRIDGE_MESSAGE_TYPES.apiTokenRefresh)
}

const postWebglLaunchToken = (targetWindow: Window, targetOrigin: string, payload: WebglLaunchTokenPayload) => {
  if (!payload.launchToken || payload.launchToken.length > WEBGL_AUTH_TOKEN_MAX_CHARS) {
    throw new Error('Invalid WebGL launch token payload.')
  }

  targetWindow.postMessage(
    {
      type: WEBGL_BRIDGE_MESSAGE_TYPES.launchToken,
      token: payload.launchToken,
      expiresAt: payload.expiresAt
    },
    targetOrigin
  )
}

export {
  WEBGL_BRIDGE_MESSAGE_TYPES,
  isKnownWebglIframeMessage,
  isWebglAuthSessionReadyMessage,
  isWebglLoaderErrorMessage,
  isWebglProgressMessage,
  isWebglReadyMessage,
  postWebglApiToken,
  postWebglApiTokenRefresh,
  postWebglLaunchToken
}
export type {
  WebglApiTokenPayload,
  WebglAuthSessionReadyMessage,
  WebglBridgeMessageType,
  WebglLaunchTokenPayload,
  WebglLoaderErrorMessage,
  WebglProgressMessage,
  WebglReadyMessage
}
