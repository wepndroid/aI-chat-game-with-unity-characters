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

const backendPublicUrl = process.env.BACKEND_PUBLIC_URL?.trim() || 'http://127.0.0.1:4000'
const frontendPublicUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:5000'

const authConfig = {
  cookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'secretwaifu_auth',
  // Opaque session lifetime used for cookie + DB expiry.
  sessionTtlMs: parseDuration(process.env.AUTH_SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000),
  // One-time token lifetimes for email verification and password reset.
  emailVerificationTokenTtlMs: parseDuration(process.env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MS, 24 * 60 * 60 * 1000),
  passwordResetTokenTtlMs: parseDuration(process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MS, 60 * 60 * 1000),
  verifyEmailUrlBase: process.env.AUTH_VERIFY_EMAIL_URL_BASE?.trim() || `${backendPublicUrl}/api/auth/verify-email`,
  resetPasswordUrlBase: process.env.AUTH_RESET_PASSWORD_URL_BASE?.trim() || `${frontendPublicUrl}/auth/reset-password`
}

const emailConfig = {
  from: process.env.EMAIL_FROM?.trim() || 'SecretWaifu <no-reply@secretwaifu.local>',
  smtpHost: process.env.EMAIL_SMTP_HOST?.trim() || '',
  smtpPort: parseDuration(process.env.EMAIL_SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.EMAIL_SMTP_SECURE, false),
  smtpUser: process.env.EMAIL_SMTP_USER?.trim() || '',
  smtpPass: process.env.EMAIL_SMTP_PASS?.trim() || ''
}

const getIsSecureCookie = () => process.env.NODE_ENV === 'production'

export { authConfig, emailConfig, getIsSecureCookie }
