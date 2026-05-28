import assert from 'node:assert/strict'
import test from 'node:test'

import {
  unityChatSendRequestSchema,
  unityGameplaySendRequestSchema,
  unityStructuredHelperRequestSchema,
  unityTtsSegmentRequestSchema
} from './unity-client-contract'

const validUnityRuntimeContext = {
  contract_version: 2,
  directives: [
    {
      id: 'turn-tone',
      scope: 'current_turn',
      kind: 'style_hint',
      text: 'Speak warmly.'
    }
  ]
} as const

const validAnimationCapabilities = {
  contract_version: 1,
  moods: [{ id: 'happy', description: 'Happy expression.' }],
  gestures: [{ id: 'wave', description: 'Small wave.' }],
  big_gestures: [{ id: 'spin', description: 'Full-body spin.' }],
  example_response: '{"mood":"happy","gesture":"wave"}'
} as const

const validChatSendRequest = {
  session_id: 'session-1',
  message: 'Hello there.',
  unity_runtime_context: validUnityRuntimeContext,
  animation_capabilities: validAnimationCapabilities,
  voice_enabled: true,
  stream: true,
  debug_prompt: false,
  client_message_id: 'client-message-1'
} as const

const validGameplaySendRequest = {
  session_id: 'session-1',
  event_type: 'touch',
  event_payload: { body_part: 'hand' },
  event_display_text: 'The player touches her hand.',
  unity_runtime_context: validUnityRuntimeContext,
  animation_capabilities: validAnimationCapabilities,
  voice_enabled: false,
  stream: true,
  debug_prompt: false,
  client_event_id: 'client-event-1'
} as const

const validVisibleTurnTtsRequest = {
  parent_kind: 'visible_turn',
  session_id: 'session-1',
  segment_id: 'segment-1',
  sequence_index: 0,
  role: 'character',
  text: 'Visible turn speech.',
  voice_ref_path: 'voices/character.wav',
  emotion: 'happy',
  client_turn_id: 'client-turn-1'
} as const

const validSessionVoiceTtsRequest = {
  parent_kind: 'session_voice',
  session_id: 'session-1',
  segment_id: 'session-voice-segment-1',
  sequence_index: 0,
  role: 'character',
  text: 'Session voice phrase.',
  voice_ref_path: 'voices/character.wav',
  client_request_id: 'session-voice-request-1',
  usage_kind: 'sex_phrase'
} as const

const validStructuredHelperRequest = {
  session_id: 'session-1',
  client_request_id: 'helper-request-1',
  purpose: 'metadata_interpretation',
  messages: [
    { role: 'system', content: 'Return metadata JSON.' },
    { role: 'user', content: 'Analyze this turn.' }
  ],
  ai_name: 'Mika',
  grammar: 'root ::= "ok"',
  json_schema: {
    type: 'object',
    properties: {
      mood: { type: 'string' }
    }
  },
  debug_prompt: false
} as const

const publicRequestCases = [
  ['chat send', unityChatSendRequestSchema, validChatSendRequest],
  ['gameplay send', unityGameplaySendRequestSchema, validGameplaySendRequest],
  ['visible-turn TTS', unityTtsSegmentRequestSchema, validVisibleTurnTtsRequest],
  ['session-voice TTS', unityTtsSegmentRequestSchema, validSessionVoiceTtsRequest],
  ['structured helper', unityStructuredHelperRequestSchema, validStructuredHelperRequest]
] as const

test('Unity public request schemas accept the cutover-critical client payloads', () => {
  for (const [, schema, fixture] of publicRequestCases) {
    assert.equal(schema.safeParse(fixture).success, true)
  }
})

test('Unity public request schemas reject client-supplied provider routing fields', () => {
  for (const [name, schema, fixture] of publicRequestCases) {
    assert.equal(
      schema.safeParse({ ...fixture, player_tier: 'premium' }).success,
      false,
      `${name} accepted player_tier`
    )
    assert.equal(
      schema.safeParse({ ...fixture, player_id: 'user-1' }).success,
      false,
      `${name} accepted player_id`
    )
  }
})

test('Unity chat payloads reject old or foreign runtime-context field names', () => {
  assert.equal(
    unityChatSendRequestSchema.safeParse({
      ...validChatSendRequest,
      unity_system_context: { text: 'legacy prompt context' }
    }).success,
    false
  )
  assert.equal(
    unityGameplaySendRequestSchema.safeParse({
      ...validGameplaySendRequest,
      unity_system_context: { text: 'legacy prompt context' }
    }).success,
    false
  )
})
test('Unity runtime and animation contract versions stay pinned', () => {
  assert.equal(
    unityChatSendRequestSchema.safeParse({
      ...validChatSendRequest,
      unity_runtime_context: { ...validUnityRuntimeContext, contract_version: 1 }
    }).success,
    false
  )
  assert.equal(
    unityChatSendRequestSchema.safeParse({
      ...validChatSendRequest,
      animation_capabilities: { ...validAnimationCapabilities, contract_version: 2 }
    }).success,
    false
  )
})

test('Unity gameplay events accept only the known game event vocabulary', () => {
  for (const eventType of ['touch', 'undress', 'post_sex_return', 'sex_rejected', 'sex_postponed']) {
    assert.equal(
      unityGameplaySendRequestSchema.safeParse({
        ...validGameplaySendRequest,
        event_type: eventType
      }).success,
      true,
      `${eventType} should be accepted`
    )
  }

  assert.equal(
    unityGameplaySendRequestSchema.safeParse({
      ...validGameplaySendRequest,
      event_type: 'groping'
    }).success,
    false
  )
})
