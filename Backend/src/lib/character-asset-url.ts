import { isIP } from 'node:net'

const UPLOAD_PATH_PREFIX = '/uploads/'

const normalizeTrustedOrigins = (): string[] => {
  const raw = process.env.PUBLIC_ASSET_BASE_URL?.trim()
  if (raw) {
    return raw
      .split(',')
      .map((value) => value.trim().replace(/\/+$/, ''))
      .filter((value) => value.length > 0)
  }

  const backendPublic = process.env.BACKEND_PUBLIC_URL?.trim().replace(/\/+$/, '')
  if (backendPublic) {
    return [backendPublic]
  }

  if (process.env.NODE_ENV !== 'production') {
    const parsedPort = Number.parseInt(process.env.PORT ?? '4000', 10)
    const port = Number.isNaN(parsedPort) ? 4000 : parsedPort
    return [`http://127.0.0.1:${port}`]
  }

  return []
}

const isSafeExternalUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }

    const hostname = parsed.hostname.toLowerCase()

    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return false
    }

    if (parsed.username || parsed.password) {
      return false
    }

    const ipType = isIP(hostname)

    if (ipType === 4) {
      const [firstOctet, secondOctet] = hostname.split('.').map((segment) => Number.parseInt(segment, 10))

      if (
        Number.isNaN(firstOctet) ||
        Number.isNaN(secondOctet) ||
        firstOctet === 10 ||
        firstOctet === 127 ||
        firstOctet === 0 ||
        (firstOctet === 169 && secondOctet === 254) ||
        (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
        (firstOctet === 192 && secondOctet === 168)
      ) {
        return false
      }
    }

    if (ipType === 6) {
      if (hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * URLs served by this API under /uploads/* (see character asset upload + static middleware).
 */
const isTrustedSelfHostedAssetUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl)
    const origins = normalizeTrustedOrigins()

    if (origins.length === 0) {
      return false
    }

    const origin = `${parsed.protocol}//${parsed.host}`
    if (!origins.some((allowed) => allowed === origin)) {
      return false
    }

    if (!parsed.pathname.startsWith(UPLOAD_PATH_PREFIX)) {
      return false
    }

    return true
  } catch {
    return false
  }
}

const assertSafeAssetUrl = (rawUrl: string | null | undefined, fieldLabel: string, allowedExtensions: string[]) => {
  if (!rawUrl) {
    return
  }

  const normalizedUrl = rawUrl.trim()

  if (isTrustedSelfHostedAssetUrl(normalizedUrl)) {
    const parsedUrl = new URL(normalizedUrl)
    const normalizedPath = parsedUrl.pathname.toLowerCase()

    if (!allowedExtensions.some((extension) => normalizedPath.endsWith(extension))) {
      throw new Error(`${fieldLabel} must use one of: ${allowedExtensions.join(', ')}`)
    }

    return
  }

  if (!isSafeExternalUrl(normalizedUrl)) {
    throw new Error(`${fieldLabel} must be a safe public http(s) URL.`)
  }

  const parsedUrl = new URL(normalizedUrl)
  const normalizedPath = parsedUrl.pathname.toLowerCase()

  if (!allowedExtensions.some((extension) => normalizedPath.endsWith(extension))) {
    throw new Error(`${fieldLabel} must use one of: ${allowedExtensions.join(', ')}`)
  }
}

const assertSafeCharacterAssetUrls = (payload: {
  vroidFileUrl?: string | null
  previewImageUrl?: string | null
  screenshotUrls?: string[]
}) => {
  assertSafeAssetUrl(payload.vroidFileUrl, 'VRM file URL', ['.vrm'])
  assertSafeAssetUrl(payload.previewImageUrl, 'Preview image URL', ['.png', '.jpg', '.jpeg', '.webp', '.gif'])

  for (const screenshotUrl of payload.screenshotUrls ?? []) {
    assertSafeAssetUrl(screenshotUrl, 'Screenshot URL', ['.png', '.jpg', '.jpeg', '.webp', '.gif'])
  }
}

export { assertSafeCharacterAssetUrls, isSafeExternalUrl, isTrustedSelfHostedAssetUrl, normalizeTrustedOrigins, UPLOAD_PATH_PREFIX }
