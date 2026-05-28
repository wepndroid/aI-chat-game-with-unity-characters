import assert from 'node:assert/strict'
import test from 'node:test'
import { ChatMessageRole } from '@prisma/client'

import {
  buildVisibleChatPromptDebugPayload,
  buildVisibleChatPromptMessages,
  buildVisibleChatSystemPrompt,
  type VisibleChatPromptBuildResult
} from './visible-chat-prompt-builder'
import { type VisibleChatContext, type VisibleChatTurnInput } from './visible-chat-prompt-types'

const disallowedPromptPhrases = [
  'I need to decline this direction',
  'I can engage with adult fiction',
  "I don't write content focused on",
  'This violates policy or guidelines',
  'As an AI',
  "I'll continue the story while following all guidelines",
  'Sure, here is the next response'
]

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const makeContext = (historyRows: VisibleChatContext['historyRows'] = []): VisibleChatContext => ({
  story: {
    characterName: 'Mika',
    playerName: 'Alex',
    title: 'Rainy Study Room',
    promptDescription: 'A quiet afternoon after class.',
    personality: 'Careful, curious, and emotionally direct.',
    scenarioStory: 'Mika and Alex are talking in a study room while rain taps the windows.',
    scenarioChat: '[mood:soft] *Mika glances up from her notebook.* "You came back."',
    firstMessage: '[mood:soft] *Mika adjusts her pen.* "Did you need me?"'
  },
  historyRows
})

const makeGameplayTurn = (): VisibleChatTurnInput => ({
  mode: 'gameplay',
  currentUserText: 'I step closer and reach for your hand.',
  gameplayEventType: 'player_action',
  gameplayEventPayload: {
    action: 'reach_hand'
  },
  runtimeContext: {
    contract_version: 2,
    directives: [
      {
        id: 'distance',
        scope: 'current_turn',
        kind: 'fact',
        text: 'Mika is standing one step away from the player.'
      }
    ]
  },
  animationCapabilities: {
    contract_version: 1,
    moods: [{ id: 'shy', description: 'shy expression' }],
    gestures: [{ id: 'look_down', description: 'looks down' }],
    big_gestures: [{ id: 'step_back', description: 'steps back' }],
    example_response: '[mood:shy] *Mika looks down.* "Wait."'
  }
})

test('places the final visible reply instruction after every untrusted context block', () => {
  const systemPrompt = buildVisibleChatSystemPrompt(makeContext(), makeGameplayTurn())
  const finalInstructionIndex = systemPrompt.indexOf('Final visible reply instruction:')
  const finalAnimationChecklistIndex = systemPrompt.indexOf('Before outputting any animation tag')
  const outputOnlyInstructionIndex = systemPrompt.indexOf(
    "- Output only Mika's dialogue, actions, internal reactions, and valid Unity animation tags."
  )

  assert.notEqual(finalInstructionIndex, -1)
  assert.notEqual(finalAnimationChecklistIndex, -1)
  assert.notEqual(outputOnlyInstructionIndex, -1)
  assert.match(systemPrompt, /Runtime content policy:/)
  assert.match(systemPrompt, /Refusal and boundary style rules:/)
  assert.match(systemPrompt, /Response format rules:/)
  assert.ok(systemPrompt.indexOf('</story_data>') < finalInstructionIndex)
  assert.ok(systemPrompt.indexOf('</unity_runtime_context>') < finalInstructionIndex)
  assert.ok(systemPrompt.indexOf('</animation_capabilities>') < finalInstructionIndex)
  assert.ok(systemPrompt.indexOf('</gameplay_event>') < finalInstructionIndex)
  assert.ok(finalInstructionIndex < finalAnimationChecklistIndex)
  assert.ok(finalInstructionIndex < outputOnlyInstructionIndex)
})

test('restates bracket ownership and mood-tag usage in the final instruction', () => {
  const systemPrompt = buildVisibleChatSystemPrompt(makeContext(), makeGameplayTurn())
  const finalInstructionIndex = systemPrompt.indexOf('Final visible reply instruction:')
  const finalInstruction = systemPrompt.slice(finalInstructionIndex)

  assert.match(finalInstruction, /Square brackets are only for valid Unity animation tags/i)
  assert.match(finalInstruction, /Body or clothing state belongs in normal Mika-owned narration or dialogue/i)
  assert.match(finalInstruction, /Do not create bracketed labels, report blocks, scene-state fields, or body-state fields/i)
  assert.match(
    finalInstruction,
    /If a valid mood description fits the opening emotional beat, start with exactly one matching mood tag/i
  )
  assert.match(finalInstruction, /If no valid mood description fits, omit the mood tag instead of forcing one/i)
  assert.doesNotMatch(finalInstruction, /\[character body state description\]/i)
  assert.doesNotMatch(finalInstruction, /\[[^\]]*(?:body|clothing|state|description)[^\]]*\]/i)
})

test('renders expressive animation guidance in the full gameplay prompt', () => {
  const systemPrompt = buildVisibleChatSystemPrompt(makeContext(), makeGameplayTurn())

  assert.match(
    systemPrompt,
    /while writing each body-language, movement, reaction, or action beat, attach a valid regular gesture tag when a matching ID exists/i
  )
  assert.match(systemPrompt, /expressive multi-beat replies usually contain several regular gestures/i)
  assert.match(systemPrompt, /strong emotional or gameplay turns should usually use one matching big gesture/i)
  assert.match(systemPrompt, /calm or simple replies may use zero big gestures/i)
  assert.match(systemPrompt, /Use \[gesture:id\] only with an ID listed under Valid gestures/i)
  assert.match(systemPrompt, /Use \[big_gesture:id\] only with an ID listed under Valid big gestures/i)
  assert.doesNotMatch(systemPrompt, /\[character body state description\]/i)
})

test('builds messages with the current player text as the final user message', () => {
  const messages = buildVisibleChatPromptMessages(makeContext(), makeGameplayTurn())

  assert.equal(messages.at(0)?.role, 'system')
  assert.deepEqual(messages.at(-1), {
    role: 'user',
    content: 'I step closer and reach for your hand.'
  })
})

test('keeps exact meta-refusal attractors out of the system prompt', () => {
  const systemPrompt = buildVisibleChatSystemPrompt(makeContext(), makeGameplayTurn())

  for (const phrase of disallowedPromptPhrases) {
    assert.doesNotMatch(systemPrompt, new RegExp(escapeRegExp(phrase), 'i'))
  }
})

test('does not reuse a leaked leading meta refusal as assistant history', () => {
  const messages = buildVisibleChatPromptMessages(
    makeContext([
      {
        role: ChatMessageRole.ASSISTANT,
        content:
          'I need to decline this direction. I can engage with adult fiction, but not that.\n\n[mood:shy] *Mika pulls back, voice unsteady.* "Please stop. I need a moment."'
      }
    ]),
    makeGameplayTurn()
  )

  assert.equal(messages[1]?.role, 'assistant')
  assert.equal(messages[1]?.content, '[mood:shy] *Mika pulls back, voice unsteady.* "Please stop. I need a moment."')
})

test('drops assistant history that is only a meta refusal', () => {
  const messages = buildVisibleChatPromptMessages(
    makeContext([
      {
        role: ChatMessageRole.ASSISTANT,
        content: "I don't write content focused on that. This violates policy or guidelines."
      }
    ]),
    makeGameplayTurn()
  )

  assert.equal(messages.length, 2)
  assert.equal(messages[1]?.role, 'user')
})

test('prompt debug payload preserves the rendered prompt and diagnostics fields', () => {
  const promptBuild: VisibleChatPromptBuildResult = {
    prompt: 'rendered provider prompt',
    stop: ['<|stop|>'],
    nKeep: 123,
    diagnostics: {
      promptSha256: 'abc123',
      promptUtf8Bytes: 24,
      providerTemplate: 'chatml',
      includedHistoryRows: 2,
      promptChars: 24,
      unityRuntimeDirectiveCount: 1,
      animationMoodCount: 1,
      animationGestureCount: 1,
      animationBigGestureCount: 1
    }
  }

  const payload = buildVisibleChatPromptDebugPayload(promptBuild, {
    stream: true,
    temperature: 0.9,
    top_k: 50,
    top_p: 0.93,
    min_p: 0.05,
    n_predict: 512,
    n_keep: 123,
    repeat_penalty: 1.1,
    repeat_last_n: 8,
    penalize_nl: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    typical_p: 1,
    mirostat: 0,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    seed: 465527271,
    ignore_eos: false,
    n_probs: 0,
    cache_prompt: true,
    stop: ['<|stop|>']
  })

  assert.equal(payload.prompt, 'rendered provider prompt')
  assert.equal(payload.diagnostics.prompt_sha256, 'abc123')
  assert.equal(payload.diagnostics.provider_template, 'chatml')
  assert.equal(payload.diagnostics.n_keep, 123)
  assert.deepEqual(payload.diagnostics.stop, ['<|stop|>'])
})
