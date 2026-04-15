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

/** Legacy plain-text first messages → minimal HTML for the rich editor. */
export function firstMessageToEditorHtml(raw: string | null | undefined): string {
  const rawValue = raw ?? ''
  if (!rawValue.trim()) {
    return ''
  }
  if (isRichFirstMessageHtml(rawValue)) {
    return rawValue.trim()
  }
  const escaped = rawValue.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .split(/\n\n+/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
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
