import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeCharacterAssetUrls, CharacterAssetUrlValidationError } from './character-asset-url'

test('voice file URL accepts SecretWaifu-hosted uploads', () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    assert.doesNotThrow(() => {
      assertSafeCharacterAssetUrls({
        voiceFileUrl: 'http://127.0.0.1:4000/uploads/voice-clips/sample.wav'
      })
    })
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previousNodeEnv
    }
  }
})

test('voice file URL rejects external WAVs before they can become runtime TTS refs', () => {
  assert.throws(
    () => {
      assertSafeCharacterAssetUrls({
        voiceFileUrl: 'https://cdn.example.com/voice.wav'
      })
    },
    (error) =>
      error instanceof CharacterAssetUrlValidationError &&
      error.fieldKey === 'voiceFileUrl' &&
      error.message.includes('SecretWaifu-hosted upload')
  )
})
