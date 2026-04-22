/** Matches backend `firstMessage` max length (HTML from rich editor needs more room than plain text). */
export const FIRST_MESSAGE_MAX_LENGTH = 50_000

/** Stored rich content is sanitized HTML from Tiptap (paragraphs, spans, inline styles). */
export function isRichFirstMessageHtml(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim()
  if (t.length < 3) {
    return false
  }
  return t.startsWith('<') && /<\/[a-z][\s\S]*/i.test(t)
}

type LegacyToken =
  | { kind: 'plain'; text: string }
  | { kind: 'action'; text: string }
  | { kind: 'pink'; text: string }
  | { kind: 'quoted'; text: string }

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function tokenizeLegacyFirstMessage(input: string): LegacyToken[] {
  const tokens: LegacyToken[] = []
  let i = 0

  const appendPlain = (chunk: string) => {
    if (!chunk) {
      return
    }
    const previous = tokens[tokens.length - 1]
    if (previous?.kind === 'plain') {
      previous.text += chunk
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
        tokens.push({ kind: 'pink', text: input.slice(i + 1, close) })
        i = close + 1
        continue
      }
    }

    appendPlain(input[i] ?? '')
    i += 1
  }

  return tokens
}

function legacyTokenToHtml(token: LegacyToken): string {
  switch (token.kind) {
    case 'plain':
      return `<span style="color:#9ca3af;font-style:italic;font-family:ui-serif,Georgia,serif">${escapeHtml(token.text)}</span>`
    case 'action':
      return `<span style="color:#9ca3af;font-style:italic;font-family:ui-serif,Georgia,serif">${escapeHtml(token.text)}</span>`
    case 'pink':
      return `<span style="color:#f472b6;font-style:italic;font-family:ui-serif,Georgia,serif">${escapeHtml(token.text)}</span>`
    case 'quoted':
      return `<span style="color:rgba(255,255,255,0.95);font-style:normal;font-family:ui-serif,Georgia,serif">"${escapeHtml(token.text)}"</span>`
  }
}

/** Legacy plain-text first messages → minimal HTML for the rich editor. */
export function firstMessageToEditorHtml(raw: string | null | undefined): string {
  const rawValue = raw ?? ''
  if (!rawValue.trim()) {
    return ''
  }
  if (isRichFirstMessageHtml(rawValue)) {
    return rawValue.trim()
  }
  const escaped = rawValue.replace(/\r\n/g, '\n')
  return escaped
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.split('\n')
      const htmlLines = lines.map((line) => tokenizeLegacyFirstMessage(line).map(legacyTokenToHtml).join(''))
      return `<p>${htmlLines.join('<br>')}</p>`
    })
    .join('')
}

/** True when there is no visible text after stripping tags. */
export function isEmptyFirstMessageHtml(html: string): boolean {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length === 0
}

/**
 * Narrative and dialogue are joined with `\n\n`. Collapse duplicate newlines inside each
 * segment so a user cannot accidentally split storage (first `\n\n` would be read as the join).
 */
const collapseSegmentNewlines = (segment: string) =>
  segment.replace(/\r\n/g, '\n').replace(/\n\n+/g, '\n').trim()

/** Persisted shape: narrative block, blank line, dialogue block (upload form). */
export function combineFirstMessage(narrative: string, dialogue: string): string {
  const n = collapseSegmentNewlines(narrative)
  const d = collapseSegmentNewlines(dialogue)
  if (!n && !d) {
    return ''
  }
  if (!d) {
    return n
  }
  if (!n) {
    return `\n\n${d}`
  }
  return `${n}\n\n${d}`
}

/** Max characters allowed in the narrative field for the current dialogue (respects combined 8000 cap). */
export function maxNarrativeLengthGivenDialogue(dialogue: string): number {
  const d = collapseSegmentNewlines(dialogue)
  if (!d) {
    return FIRST_MESSAGE_MAX_LENGTH
  }
  return Math.max(0, FIRST_MESSAGE_MAX_LENGTH - d.length - 2)
}

/** Max characters allowed in the dialogue field for the current narrative (respects combined 8000 cap). */
export function maxDialogueLengthGivenNarrative(narrative: string): number {
  const n = collapseSegmentNewlines(narrative)
  if (!n) {
    return FIRST_MESSAGE_MAX_LENGTH - 2
  }
  return Math.max(0, FIRST_MESSAGE_MAX_LENGTH - n.length - 2)
}

export function splitStoredFirstMessage(raw: string | null | undefined): { narrative: string; dialogue: string } {
  const rawValue = raw ?? ''
  if (!rawValue.trim()) {
    return { narrative: '', dialogue: '' }
  }
  const idx = rawValue.indexOf('\n\n')
  if (idx === -1) {
    return { narrative: rawValue.trim(), dialogue: '' }
  }
  return {
    narrative: rawValue.slice(0, idx).trim(),
    dialogue: rawValue.slice(idx + 2).trim()
  }
}

/**
 * For read-only display: prefers `narrative\\n\\ndialogue`; otherwise splits first sentence vs rest for legacy text.
 */
export function getFirstMessagePartsForPreview(raw: string | null | undefined): {
  narrative: string
  dialogue: string | null
} {
  const rawValue = raw ?? ''
  if (!rawValue.trim()) {
    return { narrative: '', dialogue: null }
  }
  const idx = rawValue.indexOf('\n\n')
  if (idx !== -1) {
    const narrative = rawValue.slice(0, idx).trim()
    const dialogue = rawValue.slice(idx + 2).trim()
    return { narrative, dialogue: dialogue || null }
  }
  const trimmed = rawValue.trim()
  const match = trimmed.match(/^(.+?[.!?])(?:\s+([\s\S]+))?$/)
  if (match?.[2]?.trim()) {
    return { narrative: match[1].trim(), dialogue: match[2].trim() }
  }
  return { narrative: trimmed, dialogue: null }
}
