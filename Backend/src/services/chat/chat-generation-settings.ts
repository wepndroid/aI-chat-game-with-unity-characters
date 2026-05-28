import { createHash } from 'node:crypto'

type VisibleChatGenerationMode = 'normal' | 'gameplay'

type ChatGenerationSettings = {
  stream: true
  temperature: number
  top_k: number
  top_p: number
  min_p: number
  n_predict: number
  n_keep: number
  repeat_penalty: number
  repeat_last_n: number
  penalize_nl: boolean
  presence_penalty: number
  frequency_penalty: number
  typical_p: number
  mirostat: number
  mirostat_tau: number
  mirostat_eta: number
  seed: number
  ignore_eos: boolean
  n_probs: number
  cache_prompt: boolean
  stop: string[]
}

type HelperNKeepPolicy =
  | { kind: 'fixed'; value: number }
  | { kind: 'tokenize_first_message' }

type HelperGenerationProfile = Omit<ChatGenerationSettings, 'n_keep'> & {
  nKeepPolicy: HelperNKeepPolicy
}

const BASE_VISIBLE_CHAT_GENERATION_SETTINGS: Omit<ChatGenerationSettings, 'n_keep' | 'seed' | 'stop'> = {
  stream: true,
  temperature: 0.9,
  top_k: 50,
  top_p: 0.93,
  min_p: 0.05,
  n_predict: 512,
  repeat_penalty: 1.05,
  repeat_last_n: 16,
  penalize_nl: true,
  presence_penalty: 0,
  frequency_penalty: 0,
  typical_p: 1,
  mirostat: 0,
  mirostat_tau: 5,
  mirostat_eta: 0.1,
  ignore_eos: false,
  n_probs: 0,
  cache_prompt: true
}

const MAX_LLAMA_CPP_SIGNED_SEED = 0x7fffffff

/**
 * Derives a stable per-request seed so production replies do not share one
 * global sampling path while diagnostics remain reproducible from request ids.
 */
const deriveVisibleChatGenerationSeed = (requestId: string) => {
  const normalizedRequestId = requestId.trim() || 'missing-request-id'
  const digest = createHash('sha256').update(`visible-chat:${normalizedRequestId}`, 'utf8').digest()
  return digest.readUInt32BE(0) & MAX_LLAMA_CPP_SIGNED_SEED
}

/**
 * Backend-owned visible chat generation policy.
 * The current provider is llama.cpp-compatible, so the token cap is `n_predict`.
 * Do not translate or accept `max_tokens` here: that field is silently ignored
 * by the upstream completion endpoint and caused unbounded production runs.
 *
 * These values mirror the effective Unity `main` Chat.asset profile. Provider
 * template stop words and positive `n_keep` are injected after prompt rendering
 * because they depend on the active llama.cpp template and tokenization.
 * Unity's old `tfs_z` field is intentionally omitted: the current provider API
 * does not accept it and the GPU worker cannot forward it.
 */
const resolveVisibleChatGenerationSettings = (
  mode: VisibleChatGenerationMode,
  templateDerived: {
    stop: string[]
    nKeep: number
    requestId: string
  }
): ChatGenerationSettings => ({
  ...BASE_VISIBLE_CHAT_GENERATION_SETTINGS,
  n_predict: mode === 'gameplay' ? 512 : 512,
  n_keep: templateDerived.nKeep,
  seed: deriveVisibleChatGenerationSeed(templateDerived.requestId),
  stop: templateDerived.stop
})

const HELPER_GENERATION_PROFILES = {
  metadata_interpretation: {
    stream: true,
    temperature: 0.1,
    top_k: 20,
    top_p: 0.8,
    min_p: 0,
    n_predict: 512,
    nKeepPolicy: { kind: 'fixed', value: 0 },
    repeat_penalty: 1,
    repeat_last_n: 64,
    penalize_nl: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    typical_p: 1,
    mirostat: 0,
    mirostat_tau: 2,
    mirostat_eta: 0.1,
    seed: 1526471019,
    ignore_eos: false,
    n_probs: 0,
    cache_prompt: false,
    stop: []
  },
  sex_phrases: {
    stream: true,
    temperature: 1,
    top_k: 0,
    top_p: 1,
    min_p: 0,
    n_predict: 1024,
    nKeepPolicy: { kind: 'fixed', value: 0 },
    repeat_penalty: 1,
    repeat_last_n: 64,
    penalize_nl: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    typical_p: 1,
    mirostat: 0,
    mirostat_tau: 5,
    mirostat_eta: 0.1,
    seed: 228401393,
    ignore_eos: false,
    n_probs: 0,
    cache_prompt: false,
    stop: []
  },
  tts_emotion_decoration: {
    stream: true,
    temperature: 0.1,
    top_k: 20,
    top_p: 0.8,
    min_p: 0,
    n_predict: 512,
    nKeepPolicy: { kind: 'fixed', value: 0 },
    repeat_penalty: 1,
    repeat_last_n: 64,
    penalize_nl: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    typical_p: 1,
    mirostat: 0,
    mirostat_tau: 2,
    mirostat_eta: 0.1,
    seed: 1526471019,
    ignore_eos: false,
    n_probs: 0,
    cache_prompt: false,
    stop: []
  }
} satisfies Record<string, HelperGenerationProfile>

const resolveHelperGenerationSettings = (
  purpose: keyof typeof HELPER_GENERATION_PROFILES,
  templateDerived: {
    nKeep?: number
    templateStop: string[]
    profile?: HelperGenerationProfile
  }
): ChatGenerationSettings => {
  const profile = templateDerived.profile ?? HELPER_GENERATION_PROFILES[purpose]
  const { nKeepPolicy, ...settings } = profile
  const nKeep = (() => {
    switch (nKeepPolicy.kind) {
      case 'fixed':
        return nKeepPolicy.value
      case 'tokenize_first_message':
        if (templateDerived.nKeep === undefined) {
          throw new Error(`Helper profile ${purpose} requires first-message tokenization.`)
        }
        return templateDerived.nKeep
      default: {
        const exhaustive: never = nKeepPolicy
        throw new Error(`Unsupported helper n_keep policy: ${JSON.stringify(exhaustive)}`)
      }
    }
  })()

  return {
    ...settings,
    n_keep: nKeep,
    stop: settings.stop.length > 0 ? settings.stop : templateDerived.templateStop
  }
}

export {
  HELPER_GENERATION_PROFILES,
  resolveHelperGenerationSettings,
  resolveVisibleChatGenerationSettings
}
export type {
  ChatGenerationSettings,
  HelperGenerationProfile,
  HelperNKeepPolicy,
  VisibleChatGenerationMode
}
