import { ChatAiProviderError } from '../chat-ai-error'
import { type PromptChatMessage, type PromptParticipantNames } from './visible-chat-prompt-types'

type TemplateParts = {
  name: string
  promptPrefix?: string
  systemPrefix?: string
  systemSuffix?: string
  playerPrefix?: (playerName: string) => string
  assistantPrefix?: (assistantName: string) => string
  prefixMessageSeparator?: string
  requestPrefix?: string
  requestSuffix?: string
  pairSuffix?: string
  stops: (names: PromptParticipantNames) => string[]
}

type ProviderTemplateRenderer = {
  name: string
  renderPrompt: (messages: PromptChatMessage[], names: PromptParticipantNames) => string
  getStop: (names: PromptParticipantNames) => string[]
}

const addStopNewlines = (stop: string[]) => {
  const result: string[] = []
  for (const stopword of stop) {
    result.push(stopword)
    result.push(`\n${stopword}`)
  }
  return [...new Set(result)]
}

const renderWithParts = (parts: TemplateParts): ProviderTemplateRenderer => ({
  name: parts.name,
  renderPrompt: (messages, names) => {
    const chunks: string[] = []
    chunks.push(parts.promptPrefix ?? '')

    for (const message of messages) {
      if (message.role === 'system') {
        chunks.push(parts.requestPrefix ?? '')
        chunks.push(parts.systemPrefix ?? '')
        chunks.push(message.content)
        chunks.push(parts.systemSuffix ?? '')
      } else if (message.role === 'assistant') {
        chunks.push(parts.assistantPrefix?.(names.assistantName) ?? '')
        chunks.push(parts.prefixMessageSeparator ?? '')
        chunks.push(message.content)
        chunks.push(parts.pairSuffix ?? '')
      } else {
        chunks.push(parts.playerPrefix?.(names.playerName) ?? '')
        chunks.push(parts.prefixMessageSeparator ?? '')
        chunks.push(message.content)
        chunks.push(parts.requestSuffix ?? '')
      }
    }

    chunks.push(parts.assistantPrefix?.(names.assistantName) ?? '')
    return chunks.join('')
  },
  getStop: (names) => addStopNewlines(parts.stops(names))
})

const templateDefinitions: Record<string, ProviderTemplateRenderer> = {
  chatml: renderWithParts({
    name: 'chatml',
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    playerPrefix: (playerName) => `<|im_start|>${playerName}\n`,
    assistantPrefix: (assistantName) => `<|im_start|>${assistantName}\n`,
    requestSuffix: '<|im_end|>\n',
    pairSuffix: '<|im_end|>\n',
    stops: () => ['<|im_start|>', '<|im_end|>']
  }),
  qwen3: renderWithParts({
    name: 'qwen3',
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    playerPrefix: () => '<|im_start|>user\n',
    assistantPrefix: () => '<|im_start|>assistant\n',
    requestSuffix: '<|im_end|>\n',
    pairSuffix: '<|im_end|>\n',
    stops: () => ['<|im_start|>', '<|im_end|>', '</think>']
  }),
  'llama3 chat': renderWithParts({
    name: 'llama3 chat',
    systemPrefix: '<|start_header_id|>system<|end_header_id|>\n\n',
    systemSuffix: '<|eot_id|>',
    playerPrefix: (playerName) => `<|start_header_id|>${playerName}<|end_header_id|>\n\n`,
    assistantPrefix: (assistantName) => `<|start_header_id|>${assistantName}<|end_header_id|>\n\n`,
    requestSuffix: '<|eot_id|>',
    pairSuffix: '<|eot_id|>',
    stops: () => ['<|eot_id|>']
  }),
  'mistral v7 chat': renderWithParts({
    name: 'mistral v7 chat',
    systemPrefix: '[SYSTEM_PROMPT] ',
    systemSuffix: ' [/SYSTEM_PROMPT]',
    playerPrefix: (playerName) => `[INST] ${playerName}: `,
    assistantPrefix: () => ' ',
    requestSuffix: ' [/INST]',
    pairSuffix: '</s>',
    stops: () => ['</s>', '[INST]', '[/INST]', '[SYSTEM_PROMPT]', '[/SYSTEM_PROMPT]']
  }),
  'mistral chat': renderWithParts({
    name: 'mistral chat',
    systemSuffix: '\n\n',
    requestPrefix: '[INST] ',
    requestSuffix: ' [/INST]',
    playerPrefix: (playerName) => `### ${playerName}:`,
    assistantPrefix: (assistantName) => `### ${assistantName}:`,
    prefixMessageSeparator: ' ',
    pairSuffix: '</s>',
    stops: () => ['</s>', '[INST]', '[/INST]', '###']
  }),
  'mistral instruct': renderWithParts({
    name: 'mistral instruct',
    systemSuffix: '\n\n',
    requestPrefix: '[INST] ',
    requestSuffix: ' [/INST]',
    pairSuffix: '</s>',
    stops: () => ['</s>', '[INST]', '[/INST]']
  }),
  'llama chat': renderWithParts({
    name: 'llama chat',
    requestPrefix: '<s>[INST] ',
    systemPrefix: '<<SYS>>\n',
    systemSuffix: '\n<</SYS>> ',
    requestSuffix: ' [/INST]',
    playerPrefix: (playerName) => `### ${playerName}:`,
    assistantPrefix: (assistantName) => `### ${assistantName}:`,
    prefixMessageSeparator: ' ',
    pairSuffix: ' </s>',
    stops: () => ['[INST]', '[/INST]', '###']
  }),
  llama: renderWithParts({
    name: 'llama',
    requestPrefix: '<s>[INST] ',
    systemPrefix: '<<SYS>>\n',
    systemSuffix: '\n<</SYS>> ',
    requestSuffix: ' [/INST]',
    pairSuffix: ' </s>',
    stops: () => ['[INST]', '[/INST]']
  }),
  gemma: renderWithParts({
    name: 'gemma',
    playerPrefix: () => '<start_of_turn>user\n',
    assistantPrefix: () => '<start_of_turn>model\n',
    requestSuffix: '<end_of_turn>\n',
    pairSuffix: '<end_of_turn>\n',
    stops: () => ['<start_of_turn>', '<end_of_turn>']
  }),
  alpaca: renderWithParts({
    name: 'alpaca',
    systemSuffix: '\n\n',
    requestSuffix: '\n',
    playerPrefix: (playerName) => `### ${playerName}:`,
    assistantPrefix: (assistantName) => `### ${assistantName}:`,
    prefixMessageSeparator: ' ',
    pairSuffix: '\n',
    stops: () => ['###']
  }),
  vicuna: renderWithParts({
    name: 'vicuna',
    systemSuffix: '\n',
    playerPrefix: (playerName) => `\n${playerName}:`,
    assistantPrefix: (assistantName) => `\n${assistantName}:`,
    prefixMessageSeparator: ' ',
    stops: (names) => [`${names.playerName}:`, `${names.assistantName}:`]
  }),
  phi: renderWithParts({
    name: 'phi',
    systemSuffix: '\n\n',
    requestSuffix: '\n',
    playerPrefix: (playerName) => `${playerName}:`,
    assistantPrefix: (assistantName) => `${assistantName}:`,
    prefixMessageSeparator: ' ',
    pairSuffix: '\n',
    stops: (names) => [`${names.playerName}:`, `${names.assistantName}:`]
  }),
  'phi-3': renderWithParts({
    name: 'phi-3',
    playerPrefix: () => '<|user|>\n',
    assistantPrefix: () => '<|assistant|>\n',
    requestSuffix: '<|end|>\n',
    pairSuffix: '<|end|>\n',
    stops: () => ['<|end|>', '<|user|>', '<|assistant|>']
  }),
  'phi-3.5': renderWithParts({
    name: 'phi-3.5',
    systemPrefix: '<|system|>\n',
    systemSuffix: '<|end|>\n',
    playerPrefix: () => '<|user|>\n',
    assistantPrefix: () => '<|assistant|>\n',
    requestSuffix: '<|end|>\n',
    pairSuffix: '<|end|>\n',
    stops: () => ['<|end|>', '<|user|>', '<|assistant|>']
  }),
  'phi-4-mini': renderWithParts({
    name: 'phi-4-mini',
    systemPrefix: '<|system|>',
    systemSuffix: '<|end|>',
    playerPrefix: () => '<|user|>',
    assistantPrefix: () => '<|assistant|>',
    requestSuffix: '<|end|>',
    pairSuffix: '<|end|>',
    stops: () => ['<|end|>', '<|user|>', '<|assistant|>']
  }),
  'phi-4': renderWithParts({
    name: 'phi-4',
    systemPrefix: '<|im_start|>system<|im_sep|>',
    systemSuffix: '<|im_end|>',
    playerPrefix: () => '<|im_start|>user<|im_sep|>',
    assistantPrefix: () => '<|im_start|>assistant<|im_sep|>',
    requestSuffix: '<|im_end|>',
    pairSuffix: '<|im_end|>',
    stops: () => ['<|im_end|>', '<|im_start|>']
  }),
  zephyr: renderWithParts({
    name: 'zephyr',
    systemPrefix: '<|system|>\n',
    systemSuffix: '</s>\n',
    playerPrefix: () => '<|user|>\n',
    assistantPrefix: () => '<|assistant|>\n',
    requestSuffix: '</s>\n',
    pairSuffix: '</s>\n',
    stops: () => ['<|user|>', '<|assistant|>']
  }),
  'deepseek-v2': renderWithParts({
    name: 'deepseek-v2',
    promptPrefix: '<｜begin of sentence｜>',
    systemSuffix: '\n\n',
    playerPrefix: () => 'User:',
    assistantPrefix: () => 'Assistant:',
    prefixMessageSeparator: ' ',
    requestSuffix: '\n\n',
    pairSuffix: '<｜end of sentence｜>',
    stops: () => ['<｜end of sentence｜>', 'User:', 'Assistant:']
  }),
  'deepseek-v3': renderWithParts({
    name: 'deepseek-v3',
    playerPrefix: () => '<｜User｜>',
    assistantPrefix: () => '<｜Assistant｜>',
    requestSuffix: '',
    pairSuffix: '<｜end of sentence｜>',
    stops: () => ['<｜end of sentence｜>', '<｜User｜>', '<｜Assistant｜>']
  }),
  'deepseek-r1': renderWithParts({
    name: 'deepseek-r1',
    playerPrefix: () => '<｜User｜>',
    assistantPrefix: () => '<｜Assistant｜>',
    requestSuffix: '',
    pairSuffix: '<｜end of sentence｜>',
    stops: () => ['<｜end of sentence｜>', '<｜User｜>', '<｜Assistant｜>', '</think>']
  }),
  bitnet: renderWithParts({
    name: 'bitnet',
    systemPrefix: 'System: ',
    systemSuffix: '<|eot_id|>',
    playerPrefix: () => 'User: ',
    assistantPrefix: () => 'Assistant: ',
    requestSuffix: '<|eot_id|>',
    pairSuffix: '<|eot_id|>',
    stops: () => ['<|eot_id|>', 'User', 'Assistant']
  })
}

const detectTemplateName = (rawTemplate: string) => {
  const jinja = rawTemplate.trim()

  if (jinja.includes('<｜User｜>') && jinja.includes('<think>')) return 'deepseek-r1'
  if (jinja.includes('<｜User｜>') && jinja.includes('<｜Assistant｜>')) return 'deepseek-v3'
  if (jinja.includes('<｜begin of sentence｜>')) return 'deepseek-v2'
  if (jinja.includes('<|im_start|>') && jinja.includes('<|im_end|>') && jinja.includes('</think>')) return 'qwen3'
  if (jinja.includes('<|im_start|>') && jinja.includes('<|im_sep|>')) return 'phi-4'
  if (jinja.includes("'<|' + message['role'] + '|>'") && jinja.includes('<|tool|>')) return 'phi-4-mini'
  if (jinja.includes('<|im_start|>') && jinja.includes('<|im_end|>')) return 'chatml'
  if (jinja.includes('<|start_header_id|>') && jinja.includes('<|eot_id|>')) return 'llama3 chat'
  if (jinja.includes('<start_of_turn>') && jinja.includes('<end_of_turn>')) return 'gemma'
  if (jinja.includes('<|system|>') && jinja.includes('<|user|>') && jinja.includes('<|end|>')) return 'phi-3.5'
  if (jinja.includes('<|user|>') && jinja.includes('<|assistant|>') && jinja.includes('<|end|>')) return 'phi-3'
  if (jinja.includes('<|system|>') && jinja.includes('<|user|>') && jinja.includes('eos_token')) return 'zephyr'
  if (jinja.includes('[SYSTEM_PROMPT]') && jinja.includes('[INST]') && jinja.includes('[/INST]')) return 'mistral v7 chat'
  if (jinja.includes('[INST]') && jinja.includes('[/INST]') && !jinja.includes('<<SYS>>')) return 'mistral chat'
  if (jinja.includes('[INST]') && jinja.includes('<<SYS>>')) return 'llama chat'
  if (jinja.includes('USER:') && jinja.includes('ASSISTANT:')) return 'vicuna'
  if (jinja.includes('capitalize') && jinja.includes('<|eot_id|>')) return 'bitnet'

  return null
}

/**
 * Resolves the provider's returned llama.cpp chat template to a deterministic backend
 * renderer. Unknown templates fail loudly because silently falling back would
 * put final prompt formatting authority back into guesswork and can corrupt
 * stop-word and `n_keep` behavior.
 */
const resolveProviderChatTemplateRenderer = (rawTemplate: string): ProviderTemplateRenderer => {
  const detected = detectTemplateName(rawTemplate)
  if (!detected) {
    throw new ChatAiProviderError(
      'ai_provider_template_unsupported',
      'AI provider chat template is unsupported.'
    )
  }

  const renderer = templateDefinitions[detected]
  if (!renderer) {
    throw new ChatAiProviderError(
      'ai_provider_template_unsupported',
      'AI provider chat template renderer is missing.'
    )
  }

  return renderer
}

export { resolveProviderChatTemplateRenderer }
export type { ProviderTemplateRenderer }
