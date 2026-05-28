import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HELPER_GENERATION_PROFILES,
  resolveHelperGenerationSettings,
  resolveVisibleChatGenerationSettings
} from './chat-generation-settings'

const templateDerived = (requestId: string) => ({
  stop: ['</s>'],
  nKeep: 128,
  requestId
})

test('visible chat generation policy keeps sampling stable while reducing tag-syntax repetition pressure', () => {
  const settings = resolveVisibleChatGenerationSettings('normal', templateDerived('request-a'))

  assert.equal(settings.temperature, 0.9)
  assert.equal(settings.top_k, 50)
  assert.equal(settings.top_p, 0.93)
  assert.equal(settings.min_p, 0.05)
  assert.equal(settings.n_predict, 512)
  assert.equal(settings.repeat_penalty, 1.05)
  assert.equal(settings.repeat_last_n, 16)
  assert.equal(settings.penalize_nl, true)
  assert.equal(settings.presence_penalty, 0)
  assert.equal(settings.frequency_penalty, 0)
  assert.equal(settings.typical_p, 1)
  assert.equal(settings.mirostat, 0)
  assert.equal(settings.ignore_eos, false)
  assert.equal(settings.n_probs, 0)
  assert.equal(settings.cache_prompt, true)
})

test('visible chat generation seed is deterministic per request instead of globally fixed', () => {
  const first = resolveVisibleChatGenerationSettings('normal', templateDerived('request-a'))
  const repeat = resolveVisibleChatGenerationSettings('normal', templateDerived('request-a'))
  const second = resolveVisibleChatGenerationSettings('normal', templateDerived('request-b'))

  assert.equal(first.seed, repeat.seed)
  assert.notEqual(first.seed, second.seed)
  assert.notEqual(first.seed, 465527271)
  assert.ok(Number.isInteger(first.seed))
  assert.ok(first.seed >= 0)
  assert.ok(first.seed <= 0x7fffffff)
})

test('current one-shot helper profiles resolve fixed zero n_keep without tokenization policy', () => {
  for (const purpose of ['metadata_interpretation', 'sex_phrases', 'tts_emotion_decoration'] as const) {
    const settings = resolveHelperGenerationSettings(purpose, {
      nKeep: 0,
      templateStop: ['</s>']
    })

    assert.equal(settings.n_keep, 0)
    assert.equal(settings.cache_prompt, false)
  }
})

test('helper profiles must not expose provider sentinel n_keep values', () => {
  for (const [purpose, profile] of Object.entries(HELPER_GENERATION_PROFILES)) {
    assert.equal('n_keep' in profile, false, `${purpose} should use explicit nKeepPolicy`)
  }
})

test('non-caching helper profiles use fixed n_keep unless tokenization is intentionally documented', () => {
  for (const [purpose, profile] of Object.entries(HELPER_GENERATION_PROFILES)) {
    if (profile.cache_prompt === false) {
      assert.deepEqual(
        profile.nKeepPolicy,
        { kind: 'fixed', value: 0 },
        `${purpose} should avoid tokenizing one-shot helper prompts`
      )
    }
  }
})
