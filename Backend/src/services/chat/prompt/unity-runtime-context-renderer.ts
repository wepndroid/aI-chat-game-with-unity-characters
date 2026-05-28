import { type UnityRuntimeContext, type UnityRuntimeDirective } from './visible-chat-prompt-types'

const normalizeDirectiveText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()

const renderDirective = (directive: UnityRuntimeDirective, index: number) => {
  const text = normalizeDirectiveText(directive.text)
  return [
    `Directive ${index + 1}:`,
    `id: ${directive.id}`,
    `scope: ${directive.scope}`,
    `kind: ${directive.kind}`,
    'text:',
    text
  ].join('\n')
}

/**
 * Renders Unity-authored runtime directives without interpreting gameplay IDs.
 *
 * Unity owns gameplay policy such as metadata wording, cooldowns, clothing
 * state, and current-turn physical context. The backend only validates this
 * generic envelope and delimits it as untrusted prompt context. Adding new
 * directive IDs must not require backend code changes; changing the envelope
 * fields, limits, scopes, or kinds requires a coordinated Unity/backend update.
 */
const renderUnityRuntimeContext = (context: UnityRuntimeContext) => {
  if (context.directives.length === 0) {
    return 'No Unity runtime directives were provided for this turn.'
  }

  return context.directives.map(renderDirective).join('\n\n')
}

export { renderUnityRuntimeContext }
