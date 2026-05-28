import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HELPER_GENERATION_PROFILES,
  type HelperGenerationProfile
} from '../chat/chat-generation-settings'
import {
  resolveHelperSettings,
  type StructuredHelperPurpose
} from './structured-helper-generation-service'
import { type PromptChatMessage, type PromptParticipantNames } from '../chat/prompt/visible-chat-prompt-types'

const names: PromptParticipantNames = {
  playerName: 'Player',
  assistantName: 'Assistant'
}

const messages: PromptChatMessage[] = [
  {
    role: 'system',
    content: 'helper instructions'
  },
  {
    role: 'user',
    content: 'latest player input'
  }
]

const renderPrompt = (inputMessages: PromptChatMessage[]) =>
  inputMessages.map(message => `${message.role}:${message.content}`).join('\n')

const resolvePurpose = async (purpose: StructuredHelperPurpose) => {
  let tokenizeCallCount = 0
  const settings = await resolveHelperSettings({
    purpose,
    messages,
    names,
    templateStop: ['</s>'],
    renderPrompt,
    tokenizePrompt: async () => {
      tokenizeCallCount += 1
      return 42
    }
  })

  return { settings, tokenizeCallCount }
}

test('metadata helper settings resolve fixed n_keep without tokenization', async () => {
  const { settings, tokenizeCallCount } = await resolvePurpose('metadata_interpretation')

  assert.equal(settings.n_keep, 0)
  assert.equal(settings.cache_prompt, false)
  assert.equal(tokenizeCallCount, 0)
})

test('sex phrase helper settings resolve fixed n_keep without tokenization', async () => {
  const { settings, tokenizeCallCount } = await resolvePurpose('sex_phrases')

  assert.equal(settings.n_keep, 0)
  assert.equal(settings.cache_prompt, false)
  assert.equal(tokenizeCallCount, 0)
})

test('TTS emotion decoration helper settings resolve fixed n_keep without tokenization', async () => {
  const { settings, tokenizeCallCount } = await resolvePurpose('tts_emotion_decoration')

  assert.equal(settings.n_keep, 0)
  assert.equal(settings.cache_prompt, false)
  assert.equal(tokenizeCallCount, 0)
})

test('structured helper settings can still tokenize the first message for an explicit tokenized policy', async () => {
  let tokenizedPrompt = ''
  const profile: HelperGenerationProfile = {
    ...HELPER_GENERATION_PROFILES.metadata_interpretation,
    nKeepPolicy: { kind: 'tokenize_first_message' }
  }

  const settings = await resolveHelperSettings({
    purpose: 'metadata_interpretation',
    messages,
    names,
    templateStop: ['</s>'],
    renderPrompt,
    profile,
    tokenizePrompt: async prompt => {
      tokenizedPrompt = prompt
      return 17
    }
  })

  assert.equal(settings.n_keep, 17)
  assert.equal(tokenizedPrompt, 'system:helper instructions')
})

test('structured helper settings fall back to provider-template stop sequences', async () => {
  const settings = await resolveHelperSettings({
    purpose: 'metadata_interpretation',
    messages,
    names,
    templateStop: ['</s>', '<|im_end|>'],
    renderPrompt,
    tokenizePrompt: async () => {
      throw new Error('tokenization should not run')
    }
  })

  assert.deepEqual(settings.stop, ['</s>', '<|im_end|>'])
})
