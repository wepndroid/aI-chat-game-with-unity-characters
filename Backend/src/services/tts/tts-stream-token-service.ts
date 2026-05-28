import { generateSecureToken, hashSecureToken } from '../../lib/secure-token'
import { addVoiceTaskStreamTokenHash, consumeVoiceTaskStreamTokenHash } from './tts-voice-task-store'

const STREAM_TOKEN_TTL_MS = 2 * 60 * 1000

/**
 * Issues single-use, task-scoped stream tokens for WebSocket attach. WebGL
 * cannot send custom Authorization headers on `new WebSocket(...)`, so the
 * public socket uses a short-lived query token while the backend stores only a
 * SHA-256 hash and keeps the full provider bearer token server-side.
 */
const issueVoiceTaskStreamToken = (voiceTaskId: string) => {
  const rawToken = generateSecureToken()
  const tokenHash = hashSecureToken(rawToken)
  const expiresAtMs = Date.now() + STREAM_TOKEN_TTL_MS

  const registered = addVoiceTaskStreamTokenHash(voiceTaskId, tokenHash, expiresAtMs)
  if (!registered) {
    return null
  }

  return {
    streamToken: rawToken,
    expiresAtMs
  }
}

const consumeVoiceTaskStreamToken = (voiceTaskId: string, rawToken: string) => {
  return consumeVoiceTaskStreamTokenHash(voiceTaskId, hashSecureToken(rawToken))
}

export { consumeVoiceTaskStreamToken, issueVoiceTaskStreamToken, STREAM_TOKEN_TTL_MS }
