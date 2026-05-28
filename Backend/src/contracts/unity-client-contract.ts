import { z } from 'zod'

const UNITY_RUNTIME_DIRECTIVE_TEXT_TOTAL_MAX = 8000
const HELPER_MESSAGE_MAX_CHARS = 12_000
const HELPER_MESSAGE_TOTAL_MAX_CHARS = 32_000
const HELPER_GRAMMAR_MAX_CHARS = 24_000
const HELPER_JSON_SCHEMA_MAX_UTF8_BYTES = 24_000

const unityRuntimeDirectiveSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    scope: z.enum(['current_turn', 'session_state']),
    kind: z.enum(['fact', 'constraint', 'style_hint']),
    text: z.string().trim().min(1).max(1200)
  })
  .strict()

/**
 * Unity-owned prompt context accepted from public client requests.
 *
 * Backend owns authentication, membership lookup, provider credentials, and
 * private provider routing fields. Public Unity DTOs intentionally stay strict
 * so clients cannot provide trusted fields such as `player_id` or
 * `player_tier`; those values are derived after auth inside route handlers.
 */
const unityRuntimeContextSchema = z
  .object({
    contract_version: z.literal(2),
    directives: z.array(unityRuntimeDirectiveSchema).max(32)
  })
  .strict()
  .superRefine((value, ctx) => {
    const totalTextLength = value.directives.reduce((total, directive) => total + directive.text.length, 0)
    if (totalTextLength > UNITY_RUNTIME_DIRECTIVE_TEXT_TOTAL_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Unity runtime directive text exceeds the total prompt-context budget.',
        path: ['directives']
      })
    }
  })

const animationCapabilityEntrySchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    description: z.string().trim().max(512).optional()
  })
  .strict()

/**
 * Unity-owned animation vocabulary sent with each generated turn.
 *
 * The backend validates shape and size only; Unity remains the source of truth
 * for which mood and gesture IDs are currently playable by the client.
 */
const animationCapabilitiesSchema = z
  .object({
    contract_version: z.literal(1),
    moods: z.array(animationCapabilityEntrySchema).max(64),
    gestures: z.array(animationCapabilityEntrySchema).max(256),
    big_gestures: z.array(animationCapabilityEntrySchema).max(128),
    example_response: z.string().trim().max(4000).optional()
  })
  .strict()

/**
 * Public `/chat/send` request contract used by Unity.
 *
 * The schema is shared by route handlers and contract tests so cutover checks
 * exercise the same validator that rejects runtime traffic.
 */
const unityChatSendRequestSchema = z
  .object({
    session_id: z.string().trim().min(1),
    message: z.string().trim().min(1).max(8000),
    unity_runtime_context: unityRuntimeContextSchema,
    animation_capabilities: animationCapabilitiesSchema,
    voice_enabled: z.boolean().optional().default(false),
    stream: z.boolean().optional().default(false),
    debug_prompt: z.boolean().optional().default(false),
    client_message_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional()
  })
  .strict()

/**
 * Public `/chat/gameplay-send` request contract used by Unity.
 *
 * Gameplay events are non-quota but still enter the same trusted server path:
 * public data is validated here, then server-side auth state supplies provider
 * routing values later in the pipeline.
 */
const unityGameplaySendRequestSchema = z
  .object({
    session_id: z.string().trim().min(1),
    event_type: z.enum(['touch', 'undress', 'post_sex_return', 'sex_rejected', 'sex_postponed']),
    event_payload: z.record(z.string(), z.unknown()),
    event_display_text: z.string().trim().min(1).max(8000),
    unity_runtime_context: unityRuntimeContextSchema,
    animation_capabilities: animationCapabilitiesSchema,
    voice_enabled: z.boolean().optional().default(false),
    stream: z.boolean().optional().default(false),
    debug_prompt: z.boolean().optional().default(false),
    client_event_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional()
  })
  .strict()

const ttsSharedSegmentFields = {
  session_id: z.string().trim().min(1),
  segment_id: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9._:-]+$/),
  sequence_index: z.coerce.number().int().min(0).max(10_000),
  role: z.enum(['character', 'narrator']),
  text: z.string().trim().min(1).max(8000),
  voice_ref: z.string().trim().min(1).max(512).optional(),
  voice_ref_path: z.string().trim().min(1).max(512).optional(),
  emotion: z.string().trim().min(1).max(128).optional(),
  emo_text: z.string().trim().min(1).max(2000).optional(),
  emo_alpha: z.coerce.number().finite().min(0).max(5).optional(),
  emotion_vector: z.string().trim().min(1).max(8000).optional()
} as const

const visibleTurnTtsSegmentRequestSchema = z
  .object({
    parent_kind: z.literal('visible_turn'),
    ...ttsSharedSegmentFields,
    client_turn_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/)
  })
  .strict()

const sessionVoiceTtsSegmentRequestSchema = z
  .object({
    parent_kind: z.literal('session_voice'),
    ...ttsSharedSegmentFields,
    client_request_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/),
    usage_kind: z.literal('sex_phrase')
  })
  .strict()

/**
 * Public `/tts/request` request contract used by Unity.
 *
 * Stream tokens, provider task IDs, and provider tier routing are never accepted
 * from this DTO. The route mints task-scoped stream credentials only after
 * ownership, quota, and membership checks pass.
 */
const unityTtsSegmentRequestSchema = z.discriminatedUnion('parent_kind', [
  visibleTurnTtsSegmentRequestSchema,
  sessionVoiceTtsSegmentRequestSchema
])

const unityStructuredHelperPurposeSchema = z.enum([
  'metadata_interpretation',
  'sex_phrases',
  'tts_emotion_decoration'
])

const structuredHelperMessageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string().min(1).max(HELPER_MESSAGE_MAX_CHARS)
  })
  .strict()

/**
 * Public `/unity/llm/structured-generate` request contract used by Unity.
 *
 * This endpoint accepts helper prompts and grammar/JSON-schema constraints, but
 * it remains a backend-owned provider call. Authenticated server state supplies
 * the private provider routing fields after this public contract is validated.
 */
const unityStructuredHelperRequestSchema = z
  .object({
    session_id: z.string().trim().min(1),
    client_request_id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9._:-]+$/)
      .optional(),
    purpose: unityStructuredHelperPurposeSchema,
    messages: z.array(structuredHelperMessageSchema).min(2).max(8),
    ai_name: z.string().trim().min(1).max(128).optional(),
    grammar: z.string().min(1).max(HELPER_GRAMMAR_MAX_CHARS).optional(),
    json_schema: z.record(z.string(), z.unknown()).optional(),
    debug_prompt: z.boolean().optional().default(false)
  })
  .strict()
  .superRefine((value, ctx) => {
    const totalMessageChars = value.messages.reduce((total, message) => total + message.content.length, 0)
    if (totalMessageChars > HELPER_MESSAGE_TOTAL_MAX_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Helper message content exceeds the total prompt budget.',
        path: ['messages']
      })
    }

    if (value.json_schema) {
      const schemaBytes = Buffer.byteLength(JSON.stringify(value.json_schema), 'utf8')
      if (schemaBytes > HELPER_JSON_SCHEMA_MAX_UTF8_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Helper JSON schema exceeds the serialized size budget.',
          path: ['json_schema']
        })
      }
    }
  })

export {
  unityChatSendRequestSchema,
  unityGameplaySendRequestSchema,
  unityStructuredHelperPurposeSchema,
  unityStructuredHelperRequestSchema,
  unityTtsSegmentRequestSchema
}

export type UnityAnimationCapabilities = z.infer<typeof animationCapabilitiesSchema>
export type UnityChatSendRequest = z.infer<typeof unityChatSendRequestSchema>
export type UnityGameplaySendRequest = z.infer<typeof unityGameplaySendRequestSchema>
export type UnityRuntimeContext = z.infer<typeof unityRuntimeContextSchema>
export type UnityStructuredHelperPurpose = z.infer<typeof unityStructuredHelperPurposeSchema>
