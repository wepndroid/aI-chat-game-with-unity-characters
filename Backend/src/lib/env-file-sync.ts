import fs from 'node:fs'
import path from 'node:path'
import type { ApiKeysSettings } from './runtime-admin-settings'

const MANAGED_ENV_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'PATREON_CLIENT_ID',
  'PATREON_CLIENT_SECRET',
  'PATREON_REDIRECT_URI',
  'EMAIL_SMTP_HOST',
  'EMAIL_SMTP_PORT',
  'EMAIL_SMTP_USER',
  'EMAIL_SMTP_PASS',
  'EMAIL_FROM'
] as const

const apiKeysToEnvPairs = (apiKeys: ApiKeysSettings): Record<string, string> => ({
  GOOGLE_OAUTH_CLIENT_ID: apiKeys.googleClientId,
  GOOGLE_OAUTH_CLIENT_SECRET: apiKeys.googleClientSecret,
  GOOGLE_OAUTH_REDIRECT_URI: apiKeys.googleRedirectUri,
  PATREON_CLIENT_ID: apiKeys.patreonClientId,
  PATREON_CLIENT_SECRET: apiKeys.patreonClientSecret,
  PATREON_REDIRECT_URI: apiKeys.patreonRedirectUri,
  EMAIL_SMTP_HOST: apiKeys.smtpHost,
  EMAIL_SMTP_PORT: String(apiKeys.smtpPort),
  EMAIL_SMTP_USER: apiKeys.smtpUser,
  EMAIL_SMTP_PASS: apiKeys.smtpPass,
  EMAIL_FROM: apiKeys.smtpFrom
})

const quoteEnvValue = (value: string): string => {
  if (value === '') {
    return '""'
  }
  if (/[\r\n"#$\\]/.test(value) || /^\s/.test(value) || /\s$/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

const resolveEnvFilePath = (): string => {
  const cwd = process.cwd()
  const candidates = [path.join(cwd, '.env'), path.join(cwd, '..', '.env')]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return path.join(cwd, '.env')
}

const upsertEnvLines = (content: string, pairs: Record<string, string>): string => {
  const keys = new Set(Object.keys(pairs))
  const lines = content.split(/\r?\n/)
  const output: string[] = []
  const handled = new Set<string>()

  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (match && keys.has(match[1])) {
      const key = match[1]
      output.push(`${key}=${quoteEnvValue(pairs[key] ?? '')}`)
      handled.add(key)
    } else {
      output.push(line)
    }
  }

  for (const key of keys) {
    if (!handled.has(key)) {
      output.push(`${key}=${quoteEnvValue(pairs[key] ?? '')}`)
    }
  }

  return output.join('\n')
}

const applyApiKeysToProcessEnv = (apiKeys: ApiKeysSettings) => {
  const pairs = apiKeysToEnvPairs(apiKeys)
  for (const key of MANAGED_ENV_KEYS) {
    process.env[key] = pairs[key] ?? ''
  }
}

const writeApiKeysToEnvFile = (apiKeys: ApiKeysSettings) => {
  const envPath = resolveEnvFilePath()
  const previous = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const pairs = apiKeysToEnvPairs(apiKeys)
  const next = upsertEnvLines(previous, pairs)
  const endsWithNewline = next === '' || next.endsWith('\n')
  fs.writeFileSync(envPath, endsWithNewline ? next : `${next}\n`, 'utf8')
}

export { applyApiKeysToProcessEnv, writeApiKeysToEnvFile }
