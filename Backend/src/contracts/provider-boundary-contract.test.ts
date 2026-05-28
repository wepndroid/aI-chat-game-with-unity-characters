import assert from 'node:assert/strict'
import test from 'node:test'

import { buildLlamaCompletionRequestBody } from '../services/chat/llama-completion-stream-adapter'
import { type ChatGenerationSettings } from '../services/chat/chat-generation-settings'
import { buildProviderTtsGenerateMessage } from '../services/tts/provider-tts-websocket-adapter'

const makeSettings = (): ChatGenerationSettings => ({
  stream: true,
  temperature: 0.85,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  n_predict: 512,
  n_keep: 128,
  repeat_penalty: 1.1,
  repeat_last_n: 64,
  penalize_nl: true,
  presence_penalty: 0.1,
  frequency_penalty: 0.2,
  typical_p: 1,
  mirostat: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  seed: 1234,
  ignore_eos: false,
  n_probs: 0,
  cache_prompt: true,
  stop: ['</s>']
})

test('provider completion payload contains only provider routing and generation fields', () => {
  const jsonSchema = {
    type: 'object',
    properties: {
      mood: { type: 'string' }
    }
  }
  const body = buildLlamaCompletionRequestBody({
    requestId: 'request-1',
    prompt: 'Rendered provider prompt.',
    userId: 'user-1',
    playerTier: 'premium',
    settings: makeSettings(),
    structuredOutput: {
      grammar: 'root ::= "ok"',
      jsonSchema
    }
  })

  assert.equal(body.prompt, 'Rendered provider prompt.')
  assert.equal(body.player_id, 'user-1')
  assert.equal(body.player_tier, 'premium')
  assert.equal(body.temperature, 0.85)
  assert.equal(body.n_predict, 512)
  assert.equal(body.grammar, 'root ::= "ok"')
  assert.deepEqual(body.json_schema, jsonSchema)

  for (const unityOnlyField of [
    'session_id',
    'client_message_id',
    'unity_runtime_context',
    'animation_capabilities'
  ]) {
    assert.equal(unityOnlyField in body, false, `${unityOnlyField} leaked into provider completion payload`)
  }
})
test('provider TTS websocket frame contains private routing fields and excludes public Unity task fields', () => {
  const message = buildProviderTtsGenerateMessage({
    text: 'Hello from a trusted backend task.',
    voiceRefPath: 'voices/character.wav',
    emotion: null,
    emoText: 'softly',
    emoAlpha: 0.5,
    emotionVector: '0.1,0.2',
    userId: 'user-1',
    providerPlayerTier: 'basic'
  })

  assert.equal(message.action, 'generate')
  assert.equal(message.raw_text, 'Hello from a trusted backend task.')
  assert.equal(message.voice_ref_path, 'voices/character.wav')
  assert.equal(message.emotion, 'neutral')
  assert.equal(message.emo_text, 'softly')
  assert.equal(message.emo_alpha, 0.5)
  assert.equal(message.emotion_vector, '0.1,0.2')
  assert.equal(message.player_id, 'user-1')
  assert.equal(message.player_tier, 'basic')

  for (const publicUnityField of ['stream_token', 'voice_task_id', 'session_id', 'client_turn_id']) {
    assert.equal(publicUnityField in message, false, `${publicUnityField} leaked into provider TTS frame`)
  }
})
