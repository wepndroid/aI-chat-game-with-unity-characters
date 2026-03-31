import { prisma } from './prisma'

type UploadLimitsSettings = {
  maxVrmSizeMb: number
  maxPreviewImageSizeMb: number
  allowedPreviewMimeTypes: string[]
}

type RequestLimitsSettings = {
  generalPerMinute: number
  authPerMinute: number
  uploadPerMinute: number
}

type SessionLoginSettings = {
  sessionTtlMinutes: number
}

type FeatureSwitchesSettings = {
  publicUploadsEnabled: boolean
  communityPageEnabled: boolean
}

type MaintenanceSettings = {
  enabled: boolean
  message: string
  startAtIso: string | null
  endAtIso: string | null
  adminBypass: boolean
  readOnlyMode: boolean
  blockedRoutePrefixes: string[]
}

export type ApiKeysSettings = {
  googleClientId: string
  googleClientSecret: string
  googleRedirectUri: string
  patreonClientId: string
  patreonClientSecret: string
  patreonRedirectUri: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
}

type RuntimeAdminSettings = {
  uploadLimits: UploadLimitsSettings
  requestLimits: RequestLimitsSettings
  sessionLogin: SessionLoginSettings
  featureSwitches: FeatureSwitchesSettings
  maintenance: MaintenanceSettings
  apiKeys: ApiKeysSettings
}

const SETTINGS_SINGLETON_ID = 'singleton'

const envApiKeyDefaults: ApiKeysSettings = {
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '',
  googleRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || '',
  patreonClientId: process.env.PATREON_CLIENT_ID?.trim() || '',
  patreonClientSecret: process.env.PATREON_CLIENT_SECRET?.trim() || '',
  patreonRedirectUri: process.env.PATREON_REDIRECT_URI?.trim() || '',
  smtpHost: process.env.EMAIL_SMTP_HOST?.trim() || '',
  smtpPort: Number(process.env.EMAIL_SMTP_PORT || 587),
  smtpUser: process.env.EMAIL_SMTP_USER?.trim() || '',
  smtpPass: process.env.EMAIL_SMTP_PASS?.trim() || '',
  smtpFrom: process.env.EMAIL_FROM?.trim() || ''
}

const getApiKeysFromEnvExact = (): ApiKeysSettings => ({
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '',
  googleRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || '',
  patreonClientId: process.env.PATREON_CLIENT_ID?.trim() || '',
  patreonClientSecret: process.env.PATREON_CLIENT_SECRET?.trim() || '',
  patreonRedirectUri: process.env.PATREON_REDIRECT_URI?.trim() || '',
  smtpHost: process.env.EMAIL_SMTP_HOST?.trim() || '',
  smtpPort: Number(process.env.EMAIL_SMTP_PORT || 587),
  smtpUser: process.env.EMAIL_SMTP_USER?.trim() || '',
  smtpPass: process.env.EMAIL_SMTP_PASS?.trim() || '',
  smtpFrom: process.env.EMAIL_FROM?.trim() || ''
})

const mergeApiKeysDbWithEnv = (dbApiKeys: ApiKeysSettings): ApiKeysSettings => {
  const env = getApiKeysFromEnvExact()
  const pick = (dbVal: string, envVal: string) => (dbVal.trim().length > 0 ? dbVal : envVal)
  const smtpTouchedInDb =
    dbApiKeys.smtpHost.trim().length > 0 ||
    dbApiKeys.smtpUser.trim().length > 0 ||
    dbApiKeys.smtpFrom.trim().length > 0 ||
    dbApiKeys.smtpPass.trim().length > 0

  return {
    googleClientId: pick(dbApiKeys.googleClientId, env.googleClientId),
    googleClientSecret: pick(dbApiKeys.googleClientSecret, env.googleClientSecret),
    googleRedirectUri: pick(dbApiKeys.googleRedirectUri, env.googleRedirectUri),
    patreonClientId: pick(dbApiKeys.patreonClientId, env.patreonClientId),
    patreonClientSecret: pick(dbApiKeys.patreonClientSecret, env.patreonClientSecret),
    patreonRedirectUri: pick(dbApiKeys.patreonRedirectUri, env.patreonRedirectUri),
    smtpHost: pick(dbApiKeys.smtpHost, env.smtpHost),
    smtpPort: smtpTouchedInDb ? dbApiKeys.smtpPort : env.smtpPort,
    smtpUser: pick(dbApiKeys.smtpUser, env.smtpUser),
    smtpPass: pick(dbApiKeys.smtpPass, env.smtpPass),
    smtpFrom: pick(dbApiKeys.smtpFrom, env.smtpFrom)
  }
}

const defaultRuntimeAdminSettings: RuntimeAdminSettings = {
  uploadLimits: {
    maxVrmSizeMb: 100,
    maxPreviewImageSizeMb: 10,
    allowedPreviewMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  },
  requestLimits: {
    generalPerMinute: 240,
    authPerMinute: 60,
    uploadPerMinute: 40
  },
  sessionLogin: {
    sessionTtlMinutes: 60 * 24 * 7
  },
  featureSwitches: {
    publicUploadsEnabled: true,
    communityPageEnabled: true
  },
  maintenance: {
    enabled: false,
    message: 'The platform is temporarily under maintenance. Please try again soon.',
    startAtIso: null,
    endAtIso: null,
    adminBypass: true,
    readOnlyMode: false,
    blockedRoutePrefixes: []
  },
  apiKeys: {
    ...envApiKeyDefaults
  }
}

let tableEnsured = false

const ensureSettingsTable = async () => {
  if (tableEnsured) {
    return
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS RuntimeAdminSettings (
      id TEXT PRIMARY KEY NOT NULL,
      uploadLimitsJson TEXT NOT NULL,
      requestLimitsJson TEXT NOT NULL,
      sessionLoginJson TEXT NOT NULL,
      featureSwitchesJson TEXT NOT NULL,
      maintenanceJson TEXT NOT NULL,
      apiKeysJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  tableEnsured = true
}

const safeJsonParse = <T>(value: string, fallback: T) => {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalize = (input: Partial<RuntimeAdminSettings>): RuntimeAdminSettings => {
  const upload: Partial<UploadLimitsSettings> = input.uploadLimits ?? {}
  const request: Partial<RequestLimitsSettings> = input.requestLimits ?? {}
  const session: Partial<SessionLoginSettings> = input.sessionLogin ?? {}
  const feature: Partial<FeatureSwitchesSettings> = input.featureSwitches ?? {}
  const maintenance: Partial<MaintenanceSettings> = input.maintenance ?? {}
  const apiKeys: Partial<ApiKeysSettings> = input.apiKeys ?? {}

  return {
    uploadLimits: {
      maxVrmSizeMb: clamp(Number(upload.maxVrmSizeMb ?? defaultRuntimeAdminSettings.uploadLimits.maxVrmSizeMb), 1, 1024),
      maxPreviewImageSizeMb: clamp(Number(upload.maxPreviewImageSizeMb ?? defaultRuntimeAdminSettings.uploadLimits.maxPreviewImageSizeMb), 1, 100),
      allowedPreviewMimeTypes: Array.isArray(upload.allowedPreviewMimeTypes)
        ? upload.allowedPreviewMimeTypes.filter((row: unknown): row is string => typeof row === 'string' && row.trim().length > 0)
        : defaultRuntimeAdminSettings.uploadLimits.allowedPreviewMimeTypes
    },
    requestLimits: {
      generalPerMinute: clamp(Number(request.generalPerMinute ?? defaultRuntimeAdminSettings.requestLimits.generalPerMinute), 10, 10000),
      authPerMinute: clamp(Number(request.authPerMinute ?? defaultRuntimeAdminSettings.requestLimits.authPerMinute), 5, 5000),
      uploadPerMinute: clamp(Number(request.uploadPerMinute ?? defaultRuntimeAdminSettings.requestLimits.uploadPerMinute), 1, 5000)
    },
    sessionLogin: {
      sessionTtlMinutes: clamp(Number(session.sessionTtlMinutes ?? defaultRuntimeAdminSettings.sessionLogin.sessionTtlMinutes), 10, 60 * 24 * 90)
    },
    featureSwitches: {
      publicUploadsEnabled: feature.publicUploadsEnabled ?? defaultRuntimeAdminSettings.featureSwitches.publicUploadsEnabled,
      communityPageEnabled: feature.communityPageEnabled ?? defaultRuntimeAdminSettings.featureSwitches.communityPageEnabled
    },
    maintenance: {
      enabled: maintenance.enabled ?? defaultRuntimeAdminSettings.maintenance.enabled,
      message:
        typeof maintenance.message === 'string' && maintenance.message.trim().length > 0
          ? maintenance.message.trim()
          : defaultRuntimeAdminSettings.maintenance.message,
      startAtIso: typeof maintenance.startAtIso === 'string' && maintenance.startAtIso.trim().length > 0 ? maintenance.startAtIso.trim() : null,
      endAtIso: typeof maintenance.endAtIso === 'string' && maintenance.endAtIso.trim().length > 0 ? maintenance.endAtIso.trim() : null,
      adminBypass: maintenance.adminBypass ?? defaultRuntimeAdminSettings.maintenance.adminBypass,
      readOnlyMode: maintenance.readOnlyMode ?? defaultRuntimeAdminSettings.maintenance.readOnlyMode,
      blockedRoutePrefixes: Array.isArray(maintenance.blockedRoutePrefixes)
        ? maintenance.blockedRoutePrefixes.filter((row: unknown): row is string => typeof row === 'string' && row.trim().length > 0)
        : []
    },
    apiKeys: {
      googleClientId: typeof apiKeys.googleClientId === 'string' ? apiKeys.googleClientId.trim() : defaultRuntimeAdminSettings.apiKeys.googleClientId,
      googleClientSecret:
        typeof apiKeys.googleClientSecret === 'string' ? apiKeys.googleClientSecret.trim() : defaultRuntimeAdminSettings.apiKeys.googleClientSecret,
      googleRedirectUri:
        typeof apiKeys.googleRedirectUri === 'string' ? apiKeys.googleRedirectUri.trim() : defaultRuntimeAdminSettings.apiKeys.googleRedirectUri,
      patreonClientId:
        typeof apiKeys.patreonClientId === 'string' ? apiKeys.patreonClientId.trim() : defaultRuntimeAdminSettings.apiKeys.patreonClientId,
      patreonClientSecret:
        typeof apiKeys.patreonClientSecret === 'string' ? apiKeys.patreonClientSecret.trim() : defaultRuntimeAdminSettings.apiKeys.patreonClientSecret,
      patreonRedirectUri:
        typeof apiKeys.patreonRedirectUri === 'string' ? apiKeys.patreonRedirectUri.trim() : defaultRuntimeAdminSettings.apiKeys.patreonRedirectUri,
      smtpHost: typeof apiKeys.smtpHost === 'string' ? apiKeys.smtpHost.trim() : defaultRuntimeAdminSettings.apiKeys.smtpHost,
      smtpPort: clamp(Number(apiKeys.smtpPort ?? defaultRuntimeAdminSettings.apiKeys.smtpPort), 1, 65535),
      smtpUser: typeof apiKeys.smtpUser === 'string' ? apiKeys.smtpUser.trim() : defaultRuntimeAdminSettings.apiKeys.smtpUser,
      smtpPass: typeof apiKeys.smtpPass === 'string' ? apiKeys.smtpPass.trim() : defaultRuntimeAdminSettings.apiKeys.smtpPass,
      smtpFrom: typeof apiKeys.smtpFrom === 'string' ? apiKeys.smtpFrom.trim() : defaultRuntimeAdminSettings.apiKeys.smtpFrom
    }
  }
}

const getRuntimeAdminSettings = async () => {
  await ensureSettingsTable()

  const rows = await prisma.$queryRaw<
    Array<{
      uploadLimitsJson: string
      requestLimitsJson: string
      sessionLoginJson: string
      featureSwitchesJson: string
      maintenanceJson: string
      apiKeysJson: string
    }>
  >`SELECT uploadLimitsJson, requestLimitsJson, sessionLoginJson, featureSwitchesJson, maintenanceJson, apiKeysJson
    FROM RuntimeAdminSettings
    WHERE id = ${SETTINGS_SINGLETON_ID}
    LIMIT 1`

  if (!rows[0]) {
    await updateRuntimeAdminSettings(defaultRuntimeAdminSettings)
    return defaultRuntimeAdminSettings
  }

  const row = rows[0]
  const normalized = normalize({
    uploadLimits: safeJsonParse(row.uploadLimitsJson, defaultRuntimeAdminSettings.uploadLimits),
    requestLimits: safeJsonParse(row.requestLimitsJson, defaultRuntimeAdminSettings.requestLimits),
    sessionLogin: safeJsonParse(row.sessionLoginJson, defaultRuntimeAdminSettings.sessionLogin),
    featureSwitches: safeJsonParse(row.featureSwitchesJson, defaultRuntimeAdminSettings.featureSwitches),
    maintenance: safeJsonParse(row.maintenanceJson, defaultRuntimeAdminSettings.maintenance),
    apiKeys: safeJsonParse(row.apiKeysJson, defaultRuntimeAdminSettings.apiKeys)
  })

  return {
    ...normalized,
    apiKeys: mergeApiKeysDbWithEnv(normalized.apiKeys)
  }
}

const updateRuntimeAdminSettings = async (nextSettingsInput: Partial<RuntimeAdminSettings>) => {
  await ensureSettingsTable()
  const nextSettings = normalize(nextSettingsInput)
  const updatedAt = new Date().toISOString()

  await prisma.$executeRaw`INSERT INTO RuntimeAdminSettings
    (id, uploadLimitsJson, requestLimitsJson, sessionLoginJson, featureSwitchesJson, maintenanceJson, apiKeysJson, updatedAt)
    VALUES (
      ${SETTINGS_SINGLETON_ID},
      ${JSON.stringify(nextSettings.uploadLimits)},
      ${JSON.stringify(nextSettings.requestLimits)},
      ${JSON.stringify(nextSettings.sessionLogin)},
      ${JSON.stringify(nextSettings.featureSwitches)},
      ${JSON.stringify(nextSettings.maintenance)},
      ${JSON.stringify(nextSettings.apiKeys)},
      ${updatedAt}
    )
    ON CONFLICT(id) DO UPDATE SET
      uploadLimitsJson = excluded.uploadLimitsJson,
      requestLimitsJson = excluded.requestLimitsJson,
      sessionLoginJson = excluded.sessionLoginJson,
      featureSwitchesJson = excluded.featureSwitchesJson,
      maintenanceJson = excluded.maintenanceJson,
      apiKeysJson = excluded.apiKeysJson,
      updatedAt = excluded.updatedAt`

  return nextSettings
}

const toMaskedApiKeys = (apiKeys: ApiKeysSettings) => {
  const mask = (value: string) => {
    if (!value) {
      return ''
    }
    if (value.length <= 4) {
      return '****'
    }
    return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`
  }

  return {
    ...apiKeys,
    googleClientSecret: mask(apiKeys.googleClientSecret),
    patreonClientSecret: mask(apiKeys.patreonClientSecret),
    smtpPass: mask(apiKeys.smtpPass)
  }
}

export {
  defaultRuntimeAdminSettings,
  getRuntimeAdminSettings,
  toMaskedApiKeys,
  updateRuntimeAdminSettings
}
export type { RuntimeAdminSettings }
