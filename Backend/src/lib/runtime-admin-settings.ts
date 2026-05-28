import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { createRuntimeAdminSettingsRefreshCache } from './runtime-admin-settings-cache'

type UploadLimitsSettings = {
  maxVrmSizeMb: number
  maxPreviewImageSizeMb: number
  allowedPreviewMimeTypes: string[]
}

type CharacterFieldLimitsSettings = {
  nameMaxLength: number
  tagLineMaxLength: number
  descriptionMaxLength: number
  personalityMaxLength: number
  scenarioMaxLength: number
  exampleDialogsMaxLength: number
  firstMessageMaxLength: number
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

type ThumbnailGenerationSettings = {
  prompt: string
  negativePrompt: string
  width: number
  height: number
  steps: number
  cfgScale: number
  seed: number
  samplerName: string
  denoisingStrength: number
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
  emailProvider: 'smtp' | 'mailgun'
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  mailgunDomain: string
  mailgunApiKey: string
  mailgunRegion: 'us' | 'eu'
}

type RuntimeAdminSettings = {
  uploadLimits: UploadLimitsSettings
  characterFieldLimits: CharacterFieldLimitsSettings
  requestLimits: RequestLimitsSettings
  sessionLogin: SessionLoginSettings
  featureSwitches: FeatureSwitchesSettings
  thumbnailGeneration: ThumbnailGenerationSettings
  maintenance: MaintenanceSettings
  apiKeys: ApiKeysSettings
}

const SETTINGS_SINGLETON_ID = 'singleton'

const getApiKeysFromEnvExact = (): ApiKeysSettings => ({
  googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || '',
  googleClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || '',
  googleRedirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || '',
  patreonClientId: process.env.PATREON_CLIENT_ID?.trim() || '',
  patreonClientSecret: process.env.PATREON_CLIENT_SECRET?.trim() || '',
  patreonRedirectUri: process.env.PATREON_REDIRECT_URI?.trim() || '',
  emailProvider: process.env.EMAIL_PROVIDER?.trim().toLowerCase() === 'mailgun' ? 'mailgun' : 'smtp',
  smtpHost: process.env.EMAIL_SMTP_HOST?.trim() || '',
  smtpPort: Number(process.env.EMAIL_SMTP_PORT || 587),
  smtpUser: process.env.EMAIL_SMTP_USER?.trim() || '',
  smtpPass: process.env.EMAIL_SMTP_PASS?.trim() || '',
  smtpFrom: process.env.EMAIL_FROM?.trim() || '',
  mailgunDomain: process.env.MAILGUN_DOMAIN?.trim() || '',
  mailgunApiKey: process.env.MAILGUN_API_KEY?.trim() || '',
  mailgunRegion: process.env.MAILGUN_REGION?.trim().toLowerCase() === 'eu' ? 'eu' : 'us'
})

const buildSanitizedApiKeysForPersistence = (): ApiKeysSettings => ({
  googleClientId: '',
  googleClientSecret: '',
  googleRedirectUri: '',
  patreonClientId: '',
  patreonClientSecret: '',
  patreonRedirectUri: '',
  emailProvider: 'smtp',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailgunDomain: '',
  mailgunApiKey: '',
  mailgunRegion: 'us'
})

const defaultRuntimeAdminSettings: RuntimeAdminSettings = {
  uploadLimits: {
    maxVrmSizeMb: 100,
    maxPreviewImageSizeMb: 10,
    allowedPreviewMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  },
  characterFieldLimits: {
    nameMaxLength: 120,
    tagLineMaxLength: 160,
    descriptionMaxLength: 5000,
    personalityMaxLength: 8000,
    scenarioMaxLength: 8000,
    exampleDialogsMaxLength: 12000,
    firstMessageMaxLength: 50000
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
  thumbnailGeneration: {
    prompt: '1girl, anime, playful selfie, sticking out tongue, eyes half closed, masterpiece, best quality',
    negativePrompt: 'blurry, low quality, deformed, ugly',
    width: 832,
    height: 1216,
    steps: 50,
    cfgScale: 20,
    seed: -1,
    samplerName: 'DPM++ 2M Karras',
    denoisingStrength: 0.6
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
    ...buildSanitizedApiKeysForPersistence()
  }
}

const parseRuntimeSettingsCacheTtlMs = () => {
  const raw = process.env.RUNTIME_SETTINGS_CACHE_TTL_MS
  if (!raw) {
    return 15000
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) {
    return 15000
  }

  return Math.max(1000, Math.min(parsed, 300000))
}

const runtimeSettingsCacheTtlMs = parseRuntimeSettingsCacheTtlMs()

const cloneRuntimeAdminSettings = (value: RuntimeAdminSettings): RuntimeAdminSettings =>
  JSON.parse(JSON.stringify(value)) as RuntimeAdminSettings

const runtimeAdminSettingsCache = createRuntimeAdminSettingsRefreshCache<RuntimeAdminSettings>({
  clone: cloneRuntimeAdminSettings,
  ttlMs: runtimeSettingsCacheTtlMs,
  onStaleFallback: (error) => {
    console.warn('[runtime-settings] serving stale cached settings after DB read failure', error)
  }
})

const safeJsonValue = <T>(value: unknown, fallback: T) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  if (value && typeof value === 'object') {
    return value as T
  }

  return fallback
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const normalize = (input: Partial<RuntimeAdminSettings>): RuntimeAdminSettings => {
  const upload: Partial<UploadLimitsSettings> = input.uploadLimits ?? {}
  const characterFieldLimits: Partial<CharacterFieldLimitsSettings> = input.characterFieldLimits ?? {}
  const request: Partial<RequestLimitsSettings> = input.requestLimits ?? {}
  const session: Partial<SessionLoginSettings> = input.sessionLogin ?? {}
  const feature: Partial<FeatureSwitchesSettings> = input.featureSwitches ?? {}
  const thumbnailGeneration: Partial<ThumbnailGenerationSettings> = input.thumbnailGeneration ?? {}
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
    characterFieldLimits: {
      nameMaxLength: clamp(
        Number(characterFieldLimits.nameMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.nameMaxLength),
        2,
        500
      ),
      tagLineMaxLength: clamp(
        Number(characterFieldLimits.tagLineMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.tagLineMaxLength),
        1,
        1000
      ),
      descriptionMaxLength: clamp(
        Number(characterFieldLimits.descriptionMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.descriptionMaxLength),
        1,
        50000
      ),
      personalityMaxLength: clamp(
        Number(characterFieldLimits.personalityMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.personalityMaxLength),
        1,
        50000
      ),
      scenarioMaxLength: clamp(
        Number(characterFieldLimits.scenarioMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.scenarioMaxLength),
        1,
        50000
      ),
      exampleDialogsMaxLength: clamp(
        Number(
          characterFieldLimits.exampleDialogsMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.exampleDialogsMaxLength
        ),
        1,
        50000
      ),
      firstMessageMaxLength: clamp(
        Number(characterFieldLimits.firstMessageMaxLength ?? defaultRuntimeAdminSettings.characterFieldLimits.firstMessageMaxLength),
        1,
        50000
      )
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
    thumbnailGeneration: {
      prompt:
        typeof thumbnailGeneration.prompt === 'string' && thumbnailGeneration.prompt.trim().length > 0
          ? thumbnailGeneration.prompt.trim()
          : defaultRuntimeAdminSettings.thumbnailGeneration.prompt,
      negativePrompt:
        typeof thumbnailGeneration.negativePrompt === 'string'
          ? thumbnailGeneration.negativePrompt.trim()
          : defaultRuntimeAdminSettings.thumbnailGeneration.negativePrompt,
      width: clamp(Number(thumbnailGeneration.width ?? defaultRuntimeAdminSettings.thumbnailGeneration.width), 64, 2048),
      height: clamp(Number(thumbnailGeneration.height ?? defaultRuntimeAdminSettings.thumbnailGeneration.height), 64, 2048),
      steps: clamp(Number(thumbnailGeneration.steps ?? defaultRuntimeAdminSettings.thumbnailGeneration.steps), 1, 150),
      cfgScale: clamp(Number(thumbnailGeneration.cfgScale ?? defaultRuntimeAdminSettings.thumbnailGeneration.cfgScale), 1, 30),
      seed: clamp(Number(thumbnailGeneration.seed ?? defaultRuntimeAdminSettings.thumbnailGeneration.seed), -1, 2147483647),
      samplerName:
        typeof thumbnailGeneration.samplerName === 'string' && thumbnailGeneration.samplerName.trim().length > 0
          ? thumbnailGeneration.samplerName.trim()
          : defaultRuntimeAdminSettings.thumbnailGeneration.samplerName,
      denoisingStrength: clamp(
        Number(thumbnailGeneration.denoisingStrength ?? defaultRuntimeAdminSettings.thumbnailGeneration.denoisingStrength),
        0,
        1
      )
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
      emailProvider: apiKeys.emailProvider === 'mailgun' ? 'mailgun' : 'smtp',
      smtpHost: typeof apiKeys.smtpHost === 'string' ? apiKeys.smtpHost.trim() : defaultRuntimeAdminSettings.apiKeys.smtpHost,
      smtpPort: clamp(Number(apiKeys.smtpPort ?? defaultRuntimeAdminSettings.apiKeys.smtpPort), 1, 65535),
      smtpUser: typeof apiKeys.smtpUser === 'string' ? apiKeys.smtpUser.trim() : defaultRuntimeAdminSettings.apiKeys.smtpUser,
      smtpPass: typeof apiKeys.smtpPass === 'string' ? apiKeys.smtpPass.trim() : defaultRuntimeAdminSettings.apiKeys.smtpPass,
      smtpFrom: typeof apiKeys.smtpFrom === 'string' ? apiKeys.smtpFrom.trim() : defaultRuntimeAdminSettings.apiKeys.smtpFrom,
      mailgunDomain:
        typeof apiKeys.mailgunDomain === 'string' ? apiKeys.mailgunDomain.trim() : defaultRuntimeAdminSettings.apiKeys.mailgunDomain,
      mailgunApiKey:
        typeof apiKeys.mailgunApiKey === 'string' ? apiKeys.mailgunApiKey.trim() : defaultRuntimeAdminSettings.apiKeys.mailgunApiKey,
      mailgunRegion: apiKeys.mailgunRegion === 'eu' ? 'eu' : 'us'
    }
  }
}

const withEnvironmentApiKeys = (settings: RuntimeAdminSettings): RuntimeAdminSettings => ({
  ...settings,
  apiKeys: getApiKeysFromEnvExact()
})

const toPrismaJson = <T>(value: T): Prisma.InputJsonValue => value as Prisma.InputJsonValue

const persistRuntimeAdminSettings = async (settings: RuntimeAdminSettings) => {
  const sanitizedSettings = {
    ...settings,
    apiKeys: buildSanitizedApiKeysForPersistence()
  }
  const updatedAt = new Date()

  await prisma.runtimeAdminSettings.upsert({
    where: {
      id: SETTINGS_SINGLETON_ID
    },
    create: {
      id: SETTINGS_SINGLETON_ID,
      uploadLimits: toPrismaJson(sanitizedSettings.uploadLimits),
      characterFieldLimits: toPrismaJson(sanitizedSettings.characterFieldLimits),
      thumbnailGeneration: toPrismaJson(sanitizedSettings.thumbnailGeneration),
      requestLimits: toPrismaJson(sanitizedSettings.requestLimits),
      sessionLogin: toPrismaJson(sanitizedSettings.sessionLogin),
      featureSwitches: toPrismaJson(sanitizedSettings.featureSwitches),
      maintenance: toPrismaJson(sanitizedSettings.maintenance),
      apiKeys: toPrismaJson(sanitizedSettings.apiKeys),
      updatedAt
    },
    update: {
      uploadLimits: toPrismaJson(sanitizedSettings.uploadLimits),
      characterFieldLimits: toPrismaJson(sanitizedSettings.characterFieldLimits),
      thumbnailGeneration: toPrismaJson(sanitizedSettings.thumbnailGeneration),
      requestLimits: toPrismaJson(sanitizedSettings.requestLimits),
      sessionLogin: toPrismaJson(sanitizedSettings.sessionLogin),
      featureSwitches: toPrismaJson(sanitizedSettings.featureSwitches),
      maintenance: toPrismaJson(sanitizedSettings.maintenance),
      apiKeys: toPrismaJson(sanitizedSettings.apiKeys),
      updatedAt
    }
  })
}

const readRuntimeAdminSettingsFromDatabase = async (): Promise<RuntimeAdminSettings> => {
  const row = await prisma.runtimeAdminSettings.findUnique({
    where: {
      id: SETTINGS_SINGLETON_ID
    }
  })

  if (!row) {
    const defaults = normalize(defaultRuntimeAdminSettings)
    await persistRuntimeAdminSettings(defaults)
    return withEnvironmentApiKeys(defaults)
  }

  const normalized = normalize({
    uploadLimits: safeJsonValue(row.uploadLimits, defaultRuntimeAdminSettings.uploadLimits),
    characterFieldLimits: safeJsonValue(row.characterFieldLimits, defaultRuntimeAdminSettings.characterFieldLimits),
    thumbnailGeneration: safeJsonValue(row.thumbnailGeneration, defaultRuntimeAdminSettings.thumbnailGeneration),
    requestLimits: safeJsonValue(row.requestLimits, defaultRuntimeAdminSettings.requestLimits),
    sessionLogin: safeJsonValue(row.sessionLogin, defaultRuntimeAdminSettings.sessionLogin),
    featureSwitches: safeJsonValue(row.featureSwitches, defaultRuntimeAdminSettings.featureSwitches),
    maintenance: safeJsonValue(row.maintenance, defaultRuntimeAdminSettings.maintenance),
    apiKeys: buildSanitizedApiKeysForPersistence()
  })

  return withEnvironmentApiKeys(normalized)
}

const getRuntimeAdminSettings = async () => {
  return runtimeAdminSettingsCache.get(readRuntimeAdminSettingsFromDatabase)
}

const updateRuntimeAdminSettings = async (nextSettingsInput: Partial<RuntimeAdminSettings>) => {
  const nextSettings = normalize(nextSettingsInput)
  await persistRuntimeAdminSettings(nextSettings)

  const runtimeSettings = withEnvironmentApiKeys(nextSettings)
  runtimeAdminSettingsCache.set(runtimeSettings)

  return runtimeSettings
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
    smtpPass: mask(apiKeys.smtpPass),
    mailgunApiKey: mask(apiKeys.mailgunApiKey)
  }
}

export {
  defaultRuntimeAdminSettings,
  getRuntimeAdminSettings,
  toMaskedApiKeys,
  updateRuntimeAdminSettings
}
export type { RuntimeAdminSettings }
