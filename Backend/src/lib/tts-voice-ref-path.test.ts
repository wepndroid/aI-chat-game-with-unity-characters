import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTtsProviderHttpUrl } from './tts-provider-config'
import { resolveTtsProviderVoiceRefPath, TtsVoiceReferenceError } from './tts-voice-ref-path'

test('keeps provider aliases unchanged', async () => {
  assert.equal((await resolveTtsProviderVoiceRefPath('default'))?.voiceRefPath, 'default')
  assert.equal((await resolveTtsProviderVoiceRefPath('narrator'))?.voiceRefPath, 'narrator')
})

test('converts trusted uploaded voice URL into provider-local path when deployment override is configured', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousProviderUploadsRoot = process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT

  process.env.NODE_ENV = 'development'
  process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT = '/srv/secretwaifu/uploads'

  try {
    assert.equal(
      (await resolveTtsProviderVoiceRefPath('http://127.0.0.1:4000/uploads/voice-clips/sample.wav'))?.voiceRefPath,
      '/srv/secretwaifu/uploads/voice-clips/sample.wav'
    )
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }

    if (previousProviderUploadsRoot === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT
    } else {
      process.env.CHAT_TTS_PROVIDER_UPLOADS_ROOT = previousProviderUploadsRoot
    }
  }
})

test('rejects external HTTP voice URLs instead of forwarding them as provider aliases', async () => {
  await assert.rejects(
    resolveTtsProviderVoiceRefPath('https://cdn.example.com/voice.wav'),
    (error) =>
      error instanceof TtsVoiceReferenceError &&
      error.code === 'UNSUPPORTED_HTTP_VOICE_REFERENCE'
  )
})

test('derives provider HTTP endpoint from websocket URL', () => {
  const previousWsUrl = process.env.CHAT_TTS_PROVIDER_WS_URL
  const previousHttpBaseUrl = process.env.CHAT_TTS_PROVIDER_HTTP_BASE_URL

  process.env.CHAT_TTS_PROVIDER_WS_URL = 'wss://api2.squirclesystem.com/api/tts/ws'
  delete process.env.CHAT_TTS_PROVIDER_HTTP_BASE_URL

  try {
    assert.equal(buildTtsProviderHttpUrl('/tts/upload-voice/'), 'https://api2.squirclesystem.com/api/tts/upload-voice/')
  } finally {
    if (previousWsUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_WS_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_WS_URL = previousWsUrl
    }

    if (previousHttpBaseUrl === undefined) {
      delete process.env.CHAT_TTS_PROVIDER_HTTP_BASE_URL
    } else {
      process.env.CHAT_TTS_PROVIDER_HTTP_BASE_URL = previousHttpBaseUrl
    }
  }
})
