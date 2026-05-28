const DEFAULT_TEXT_MAX_LENGTH = 191
const LANDING_PAGE_KEY_MAX_LENGTH = 80
const LANDING_PAGE_PATH_MAX_LENGTH = 255

/**
 * Normalizes bounded public/admin text before persistence or query matching.
 * This is syntactic cleanup only; callers must still decide whether the value
 * is authoritative for the aggregate they are writing.
 */
const normalizeLandingPageOptionalText = (value: string | null | undefined, maxLength = DEFAULT_TEXT_MAX_LENGTH) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, maxLength)
}

/**
 * Converts user-facing identifiers into the canonical landing-page key shape.
 * Public tracking may use the result for lookup and diagnostics, never as
 * permission to create or rewrite catalog rows.
 */
const normalizeLandingPageKey = (value: string | null | undefined, fallback: string) => {
  const normalized = normalizeLandingPageOptionalText(value, LANDING_PAGE_KEY_MAX_LENGTH)
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || fallback
}

/**
 * Normalizes route-like values to a leading-slash path and strips query/hash
 * fragments so tracked diagnostics never persist credential-bearing URLs.
 */
const normalizeLandingPagePath = (value: string | null | undefined) => {
  const normalized = normalizeLandingPageOptionalText(value, LANDING_PAGE_PATH_MAX_LENGTH)

  if (!normalized) {
    return '/'
  }

  const pathOnly = normalized.split(/[?#]/, 1)[0]?.trim() || '/'
  const withLeadingSlash = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`

  return withLeadingSlash.slice(0, LANDING_PAGE_PATH_MAX_LENGTH)
}

/**
 * Stores only the host component for attribution reporting.
 * The full referrer URL can contain query parameters or fragments that are not
 * needed for analytics and should not be persisted.
 */
const toLandingPageReferrerHost = (value: string | null | undefined) => {
  const normalized = normalizeLandingPageOptionalText(value, 1000)

  if (!normalized) {
    return null
  }

  try {
    return new URL(normalized).host.slice(0, DEFAULT_TEXT_MAX_LENGTH) || null
  } catch {
    return null
  }
}

export {
  LANDING_PAGE_KEY_MAX_LENGTH,
  LANDING_PAGE_PATH_MAX_LENGTH,
  normalizeLandingPageKey,
  normalizeLandingPageOptionalText,
  normalizeLandingPagePath,
  toLandingPageReferrerHost
}
