type WebglReleaseStaticHeaders = Record<string, string>

type HeaderSink = {
  setHeader: (name: string, value: string) => unknown
}

const webglReleaseBuildPathPattern = /^game-releases\/webgl\/[^/]+\/build(?:\/|$)/i
const webglReleaseIndexPathPattern = /^game-releases\/webgl\/[^/]+\/build\/index\.html$/i

const normalizeUploadRelativePath = (value: string) => value.replace(/\\/g, '/').replace(/^\/+/, '')

const stripCompressionExtension = (normalizedPath: string) => {
  if (normalizedPath.endsWith('.br')) {
    return {
      path: normalizedPath.slice(0, -3),
      encoding: 'br'
    }
  }
  if (normalizedPath.endsWith('.gz')) {
    return {
      path: normalizedPath.slice(0, -3),
      encoding: 'gzip'
    }
  }

  return {
    path: normalizedPath,
    encoding: null
  }
}

const resolveContentType = (uncompressedPath: string) => {
  if (uncompressedPath.endsWith('.wasm')) {
    return 'application/wasm'
  }
  if (uncompressedPath.endsWith('.js')) {
    return 'application/javascript; charset=utf-8'
  }
  if (uncompressedPath.endsWith('.data')) {
    return 'application/octet-stream'
  }
  if (uncompressedPath.endsWith('.json')) {
    return 'application/json; charset=utf-8'
  }
  if (uncompressedPath.endsWith('.html')) {
    return 'text/html; charset=utf-8'
  }

  return null
}

const resolveWebglReleaseStaticHeaders = (uploadRelativePath: string): WebglReleaseStaticHeaders => {
  const normalizedPath = normalizeUploadRelativePath(uploadRelativePath).toLowerCase()
  if (!webglReleaseBuildPathPattern.test(normalizedPath)) {
    return {}
  }

  if (webglReleaseIndexPathPattern.test(normalizedPath)) {
    return {
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8'
    }
  }

  const stripped = stripCompressionExtension(normalizedPath)
  const contentType = resolveContentType(stripped.path)
  const headers: WebglReleaseStaticHeaders = {
    'Cache-Control': 'public, max-age=31536000, immutable'
  }

  if (stripped.encoding) {
    headers['Content-Encoding'] = stripped.encoding
    headers.Vary = 'Accept-Encoding'
  }
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  return headers
}

const applyWebglReleaseStaticHeaders = (response: HeaderSink, uploadRelativePath: string) => {
  const headers = resolveWebglReleaseStaticHeaders(uploadRelativePath)
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value)
  }
}

export { applyWebglReleaseStaticHeaders, resolveWebglReleaseStaticHeaders }
export type { HeaderSink, WebglReleaseStaticHeaders }
