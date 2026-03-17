const parseDuration = (value: string | undefined, fallbackValue: number) => {
  const parsed = Number.parseInt(value ?? '', 10)

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallbackValue
  }

  return parsed
}

const parseBoolean = (value: string | undefined, fallbackValue: boolean) => {
  if (!value) {
    return fallbackValue
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false
  }

  return fallbackValue
}

const frontendPublicUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:5000'
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || ''
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || ''
const googleRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || ''
const hasGoogleOAuthCredentials = Boolean(googleClientId && googleClientSecret && googleRedirectUri)
const googleOAuthEnabled = parseBoolean(process.env.GOOGLE_OAUTH_ENABLED, hasGoogleOAuthCredentials)

const oauthConfig = {
  stateCookieName: process.env.AUTH_OAUTH_STATE_COOKIE_NAME?.trim() || 'secretwaifu_oauth_state',
  stateTtlMs: parseDuration(process.env.AUTH_OAUTH_STATE_TTL_MS, 10 * 60 * 1000),
  defaultRedirectAfter: process.env.AUTH_OAUTH_DEFAULT_REDIRECT_AFTER?.trim() || '/profile',
  frontendPublicUrl
}

const googleOAuthConfig = {
  enabled: googleOAuthEnabled,
  clientId: googleClientId,
  clientSecret: googleClientSecret,
  redirectUri: googleRedirectUri,
  scopes: (process.env.GOOGLE_OAUTH_SCOPES?.trim() || 'openid email profile').split(/\s+/).filter(Boolean)
}

export { googleOAuthConfig, oauthConfig }
