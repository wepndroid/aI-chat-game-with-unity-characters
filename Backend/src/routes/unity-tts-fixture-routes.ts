import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { isDevLoopbackSelfHostedUpload, isTrustedSelfHostedAssetUrl } from '../lib/character-asset-url'
import { tryDeleteTrustedUploadFile } from '../lib/delete-local-upload-file'
import { getUploadedVoiceProviderRegistrationStatus } from '../lib/tts-provider-uploaded-voice-alias'
import { getUploadRelativePathFromUrl } from '../lib/upload-paths'
import { requireAdmin } from '../middleware/auth-middleware'

const unityTtsFixtureRoutes = Router()

const voiceFixtureQuerySchema = z
  .object({
    voice_file_url: z.string().url()
  })
  .strict()

const voiceFixtureCleanupSchema = z
  .object({
    voice_file_url: z.string().url()
  })
  .strict()

const b_ttsFixturesEnabled = () => process.env.UNITY_QUOTA_TEST_FIXTURES_ENABLED?.trim().toLowerCase() === 'true'

const requireTtsFixturesEnabled = (_request: Request, response: Response, next: NextFunction) => {
  if (!b_ttsFixturesEnabled()) {
    sendApiError(response, 404, 'NOT_FOUND', 'Route not found.')
    return
  }

  next()
}

const resolveTrustedVoiceUpload = (voiceFileUrl: string) => {
  if (!isTrustedSelfHostedAssetUrl(voiceFileUrl) && !isDevLoopbackSelfHostedUpload(voiceFileUrl)) {
    return null
  }

  const relativePath = getUploadRelativePathFromUrl(voiceFileUrl)
  if (!relativePath || !relativePath.replace(/\\/g, '/').startsWith('voice-clips/')) {
    return null
  }

  return relativePath
}

/**
 * Admin-only fixture support for the production uploaded-voice probe. It is
 * intentionally env-gated and scoped to uploaded voice clips so validation can
 * clean up its synthetic WAV without gaining any character/story delete power.
 */
unityTtsFixtureRoutes.get(
  '/admin/unity/tts-uploaded-voice-fixtures/status',
  requireTtsFixturesEnabled,
  requireAdmin,
  async (request, response, next) => {
    try {
      const query = voiceFixtureQuerySchema.parse(request.query)
      const relativePath = resolveTrustedVoiceUpload(query.voice_file_url)
      if (!relativePath) {
        sendApiError(response, 400, 'BAD_REQUEST', 'Voice file URL must be a SecretWaifu voice upload.')
        return
      }

      sendApiData(response, {
        voice_file_url: query.voice_file_url,
        relative_path: relativePath,
        registration: await getUploadedVoiceProviderRegistrationStatus(relativePath)
      })
    } catch (error) {
      next(error)
    }
  }
)

unityTtsFixtureRoutes.post(
  '/admin/unity/tts-uploaded-voice-fixtures/cleanup',
  requireTtsFixturesEnabled,
  requireAdmin,
  async (request, response, next) => {
    try {
      const payload = voiceFixtureCleanupSchema.parse(request.body ?? {})
      const relativePath = resolveTrustedVoiceUpload(payload.voice_file_url)
      if (!relativePath) {
        sendApiError(response, 400, 'BAD_REQUEST', 'Voice file URL must be a SecretWaifu voice upload.')
        return
      }

      await tryDeleteTrustedUploadFile(payload.voice_file_url)
      sendApiData(response, {
        cleaned: true,
        relative_path: relativePath
      })
    } catch (error) {
      next(error)
    }
  }
)

export default unityTtsFixtureRoutes
