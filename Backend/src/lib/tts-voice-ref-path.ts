import { isDevLoopbackSelfHostedUpload, isTrustedSelfHostedAssetUrl } from './character-asset-url'
import { resolveUploadedVoiceProviderAliasForRuntime } from './tts-provider-uploaded-voice-alias'
import { getUploadRelativePathFromUrl, normalizeUploadRelativePath, resolveUploadPath } from './upload-paths'

type ResolvedTtsProviderVoiceRef = {
  voiceRefPath: string
  uploadedVoiceRegistrationId: string | null
  providerVoiceAlias: string | null
  canRefreshProviderAlias: boolean
}

class TtsVoiceReferenceError extends Error {
  constructor(
    public readonly code:
      | 'UNSUPPORTED_HTTP_VOICE_REFERENCE'
      | 'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED'
      | 'UPLOADED_VOICE_NOT_READY'
      | 'UPLOADED_VOICE_REGISTRATION_FAILED',
    message: string
  ) {
    super(message)
    this.name = 'TtsVoiceReferenceError'
  }
}

const normalizeProviderPath = (value: string) => {
  const withForwardSlashes = value.replace(/\\/g, '/')
  const windowsDriveMatch = /^([a-zA-Z]):\/(.*)$/.exec(withForwardSlashes)

  if (!windowsDriveMatch) {
    return withForwardSlashes
  }

  return `/mnt/${windowsDriveMatch[1].toLowerCase()}/${windowsDriveMatch[2]}`
}

const joinProviderUploadPath = (providerUploadsRoot: string, relativePath: string) => {
  const normalizedRoot = normalizeProviderPath(providerUploadsRoot).replace(/\/+$/, '')
  const normalizedRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')

  return `${normalizedRoot}/${normalizedRelativePath}`
}

const resolveProviderLocalUploadPath = (relativePath: string | null | undefined) => {
  const normalizedRelativePath = normalizeUploadRelativePath(relativePath)
  if (!normalizedRelativePath) {
    return null
  }

  const providerUploadsRoot = process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT?.trim()
  if (providerUploadsRoot) {
    return joinProviderUploadPath(providerUploadsRoot, normalizedRelativePath)
  }

  const backendUploadPath = resolveUploadPath(normalizedRelativePath)
  return backendUploadPath ? normalizeProviderPath(backendUploadPath) : null
}

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const resolveTtsProviderVoiceRefPath = async (rawVoiceRefPath: string | null | undefined) => {
  const trimmed = rawVoiceRefPath?.trim()
  if (!trimmed) {
    return null
  }

  const isSelfHostedUpload = isTrustedSelfHostedAssetUrl(trimmed) || isDevLoopbackSelfHostedUpload(trimmed)
  if (!isSelfHostedUpload) {
    if (isHttpUrl(trimmed)) {
      throw new TtsVoiceReferenceError(
        'UNSUPPORTED_HTTP_VOICE_REFERENCE',
        'HTTP voice URLs are not accepted by the TTS provider. Upload the WAV through SecretWaifu first.'
      )
    }

    return {
      voiceRefPath: trimmed,
      uploadedVoiceRegistrationId: null,
      providerVoiceAlias: null,
      canRefreshProviderAlias: false
    }
  }

  const relativePath = getUploadRelativePathFromUrl(trimmed)
  const providerLocalPath = resolveProviderLocalUploadPath(relativePath)

  if (providerLocalPath && process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT?.trim()) {
    return {
      voiceRefPath: providerLocalPath,
      uploadedVoiceRegistrationId: null,
      providerVoiceAlias: null,
      canRefreshProviderAlias: false
    }
  }

  if (!relativePath) {
    throw new TtsVoiceReferenceError('UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED', 'Uploaded voice URL is invalid.')
  }

  try {
    const registered = await resolveUploadedVoiceProviderAliasForRuntime(relativePath)
    return {
      voiceRefPath: registered.providerVoiceRefPath,
      uploadedVoiceRegistrationId: registered.id,
      providerVoiceAlias: registered.providerAlias,
      canRefreshProviderAlias: true
    }
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : 'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED'
    throw new TtsVoiceReferenceError(
      code === 'UPLOADED_VOICE_NOT_READY' || code === 'UPLOADED_VOICE_REGISTRATION_FAILED'
        ? code
        : 'UPLOADED_VOICE_ALIAS_REGISTRATION_FAILED',
      error instanceof Error ? error.message : 'Uploaded voice could not be registered with the TTS provider.'
    )
  }
}

const resolveTtsProviderVoiceReference = async (
  rawVoiceRefPath: string | null | undefined
): Promise<ResolvedTtsProviderVoiceRef | null> => {
  return resolveTtsProviderVoiceRefPath(rawVoiceRefPath)
}

export {
  resolveProviderLocalUploadPath,
  resolveTtsProviderVoiceReference,
  resolveTtsProviderVoiceRefPath,
  TtsVoiceReferenceError
}
export type { ResolvedTtsProviderVoiceRef }
