import { Router } from 'express'
import { unityTtsSegmentRequestSchema } from '../contracts/unity-client-contract'
import { sendApiData, sendApiError } from '../lib/api-contract'
import { getRequiredGameAccessContext } from '../lib/game-access'
import { requireAuth } from '../middleware/auth-middleware'
import { requireGameAccess } from '../middleware/game-access-middleware'
import { toAiProviderPlayerTier } from '../services/ai-provider-player-tier'
import { requestTtsSegment } from '../services/tts/tts-segment-service'

const ttsRoutes = Router()

/**
 * Runtime TTS segment request. Unity owns sentence/chunk orchestration and calls
 * this endpoint while the visible chat turn is still in flight; the backend owns
 * parent-turn authorization, voice quota gate, provider credentials, and
 * task-scoped stream-token issuance.
 */
ttsRoutes.post('/tts/request', requireAuth, requireGameAccess, async (request, response, next) => {
  try {
    const authUser = request.authUser
    if (!authUser) {
      sendApiError(response, 401, 'AUTH_REQUIRED', 'Authentication required.')
      return
    }

    const payload = unityTtsSegmentRequestSchema.parse(request.body ?? {})
    const providerPlayerTier = toAiProviderPlayerTier(getRequiredGameAccessContext(request).effectiveTierCode)
    const baseRequest = {
      parentKind: payload.parent_kind,
      sessionId: payload.session_id,
      segmentId: payload.segment_id,
      sequenceIndex: payload.sequence_index,
      role: payload.role,
      text: payload.text,
      voiceRef: payload.voice_ref,
      voiceRefPath: payload.voice_ref_path,
      emotion: payload.emotion,
      emoText: payload.emo_text,
      emoAlpha: payload.emo_alpha,
      emotionVector: payload.emotion_vector,
      providerPlayerTier
    } as const

    const result =
      payload.parent_kind === 'visible_turn'
        ? await requestTtsSegment(authUser, {
            ...baseRequest,
            parentKind: 'visible_turn',
            clientTurnId: payload.client_turn_id
          })
        : await requestTtsSegment(authUser, {
            ...baseRequest,
            parentKind: 'session_voice',
            clientRequestId: payload.client_request_id,
            usageKind: payload.usage_kind
          })

    if (result.ok) {
      sendApiData(response, result.data, { status: result.status })
      return
    }

    if (result.data) {
      sendApiData(response, result.data, { status: result.status })
      return
    }

    sendApiError(response, result.status, result.code, result.message, result.details)
  } catch (error) {
    next(error)
  }
})

export default ttsRoutes
