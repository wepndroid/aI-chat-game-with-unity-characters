export type StoryBodyMarkupToken =
  | { kind: 'plain'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'pink'; text: string }
  | { kind: 'quoted'; text: string }

/**
 * Same rules as story / upload help: `**action**`, `"dialogue"`, `*pink*`, plain narration.
 */
export function tokenizeStoryBodyMarkup(input: string): StoryBodyMarkupToken[] {
  const tokens: StoryBodyMarkupToken[] = []
  let i = 0

  const appendPlain = (chunk: string) => {
    if (!chunk) {
      return
    }
    const prev = tokens[tokens.length - 1]
    if (prev?.kind === 'plain') {
      prev.text += chunk
    } else {
      tokens.push({ kind: 'plain', text: chunk })
    }
  }

  while (i < input.length) {
    if (input[i] === '*' && input[i + 1] === '*') {
      const close = input.indexOf('**', i + 2)
      if (close !== -1) {
        tokens.push({ kind: 'action', text: input.slice(i + 2, close) })
        i = close + 2
        continue
      }
      appendPlain('*')
      i += 1
      continue
    }

    if (input[i] === '"') {
      const close = input.indexOf('"', i + 1)
      if (close !== -1) {
        tokens.push({ kind: 'quoted', text: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    if (input[i] === '*' && input[i + 1] !== '*') {
      const close = input.indexOf('*', i + 1)
      if (close !== -1 && close > i + 1) {
        const inner = input.slice(i + 1, close)
        if (!inner.includes('**')) {
          tokens.push({ kind: 'pink', text: inner })
          i = close + 1
          continue
        }
      }
    }

    appendPlain(input[i]!)
    i += 1
  }

  return tokens
}
