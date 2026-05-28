import assert from 'node:assert/strict'
import test from 'node:test'

import { buildProviderTtsGenerateMessage } from './provider-tts-websocket-adapter'

test('provider TTS generate message includes the trusted provider player tier beside player id', () => {
  const message = buildProviderTtsGenerateMessage({
    text: 'Hello from the character.',
    voiceRefPath: 'voices/character.wav',
    emotion: 'happy',
    emoText: 'cheerful delivery',
    emoAlpha: 0.75,
    emotionVector: null,
    userId: 'user-1',
    providerPlayerTier: 'premium'
  })

  assert.equal(message.action, 'generate')
  assert.equal(message.raw_text, 'Hello from the character.')
  assert.equal(message.voice_ref_path, 'voices/character.wav')
  assert.equal(message.emotion, 'happy')
  assert.equal(message.emo_text, 'cheerful delivery')
  assert.equal(message.emo_alpha, 0.75)
  assert.equal(message.player_id, 'user-1')
  assert.equal(message.player_tier, 'premium')
})

test('provider TTS generate message keeps neutral emotion default while preserving tier routing', () => {
  const message = buildProviderTtsGenerateMessage({
    text: 'Neutral line.',
    voiceRefPath: 'voices/neutral.wav',
    emotion: null,
    emoText: null,
    emoAlpha: null,
    emotionVector: null,
    userId: 'user-2',
    providerPlayerTier: 'basic'
  })

  assert.equal(message.emotion, 'neutral')
  assert.equal(message.player_id, 'user-2')
  assert.equal(message.player_tier, 'basic')
})
