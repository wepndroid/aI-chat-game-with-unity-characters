import type { UserRole } from '@prisma/client'

type PasswordHashAlgorithm = 'argon2' | 'scrypt'
type EmailProvider = 'smtp' | 'mailgun'

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

const parsePasswordHashAlgorithm = (value: string | undefined, fallbackValue: PasswordHashAlgorithm): PasswordHashAlgorithm => {
  const normalized = value?.trim().toLowerCase()

  if (normalized === 'argon2' || normalized === 'scrypt') {
    return normalized
  }

  return fallbackValue
}

/** When true, session + API expose every user as ADMIN (DB rows unchanged). Default false so real DB roles apply. */
const forceAllUsersAdminForTesting = parseBoolean(process.env.FORCE_ALL_USERS_ADMIN, false)

const backendPublicUrl = process.env.BACKEND_PUBLIC_URL?.trim() || 'http://127.0.0.1:4000'
const frontendPublicUrl = process.env.FRONTEND_URL?.trim() || 'http://127.0.0.1:7000'
const defaultPasswordHashAlgorithm: PasswordHashAlgorithm = process.env.NODE_ENV === 'production' ? 'argon2' : 'scrypt'

const authConfig = {
  cookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'secretwaifu_auth',
  // Opaque session lifetime used for cookie + DB expiry.
  sessionTtlMs: parseDuration(process.env.AUTH_SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000),
  /** Short-lived session rows minted for Unity WebGL (Bearer); default 15 minutes. */
  webglSessionTtlMs: parseDuration(process.env.AUTH_WEBGL_SESSION_TTL_MS, 15 * 60 * 1000),
  // One-time token lifetimes for email verification and password reset.
  emailVerificationTokenTtlMs: parseDuration(process.env.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_MS, 24 * 60 * 60 * 1000),
  passwordResetTokenTtlMs: parseDuration(process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MS, 60 * 60 * 1000),
  passwordHashAlgorithm: parsePasswordHashAlgorithm(process.env.AUTH_PASSWORD_HASH_ALGORITHM, defaultPasswordHashAlgorithm),
  verifyEmailUrlBase: process.env.AUTH_VERIFY_EMAIL_URL_BASE?.trim() || `${frontendPublicUrl}/auth/verify-email`,
  resetPasswordUrlBase: process.env.AUTH_RESET_PASSWORD_URL_BASE?.trim() || `${frontendPublicUrl}/auth/reset-password`
}

type EmailConfig = {
  provider: EmailProvider
  from: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPass: string
  mailgunDomain: string
  mailgunApiKey: string
  mailgunRegion: 'us' | 'eu'
}

const getEmailProvider = (): EmailProvider => {
  const configuredProvider = process.env.EMAIL_PROVIDER?.trim().toLowerCase()

  if (configuredProvider === 'smtp' || configuredProvider === 'mailgun') {
    return configuredProvider
  }

  const hasMailgunConfig = Boolean(process.env.MAILGUN_DOMAIN?.trim() && process.env.MAILGUN_API_KEY?.trim())
  return hasMailgunConfig ? 'mailgun' : 'smtp'
}

const getEmailConfig = (): EmailConfig => ({
  provider: getEmailProvider(),
  from: process.env.EMAIL_FROM?.trim() || 'SecretWaifu <no-reply@secretwaifu.local>',
  smtpHost: process.env.EMAIL_SMTP_HOST?.trim() || '',
  smtpPort: parseDuration(process.env.EMAIL_SMTP_PORT, 587),
  smtpSecure: parseBoolean(process.env.EMAIL_SMTP_SECURE, false),
  smtpUser: process.env.EMAIL_SMTP_USER?.trim() || '',
  smtpPass: process.env.EMAIL_SMTP_PASS?.trim() || '',
  mailgunDomain: process.env.MAILGUN_DOMAIN?.trim() || '',
  mailgunApiKey: process.env.MAILGUN_API_KEY?.trim() || '',
  mailgunRegion: process.env.MAILGUN_REGION?.trim().toLowerCase() === 'eu' ? 'eu' : 'us'
})

const getIsSecureCookie = () => process.env.NODE_ENV === 'production'

const getEffectiveUserRoleForTesting = (role: UserRole): UserRole => {
  return forceAllUsersAdminForTesting ? 'ADMIN' : role
}

export { authConfig, forceAllUsersAdminForTesting, getEffectiveUserRoleForTesting, getEmailConfig, getIsSecureCookie }
export type { EmailConfig, EmailProvider, PasswordHashAlgorithm }
