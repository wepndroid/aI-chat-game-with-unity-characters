type VisibleChatInternalBoundaryMatch = {
  index: number
  marker: string
}

type VisibleChatInternalBoundaryTruncation = {
  text: string
  boundaryMarker: string | null
  bTruncated: boolean
}

/**
 * Internal prompt/template markers that must never become visible assistant
 * prose. Prompt wording and XML-like delimiters help the model separate
 * trusted instructions from untrusted story/runtime data, but they are not a
 * security boundary. Visible chat enforces that boundary while streaming.
 */
const FORBIDDEN_VISIBLE_CHAT_INTERNAL_MARKERS = [
  '</secret_waifu_data>',
  '<secret_waifu_data',
  '<story_data',
  '</story_data>',
  '<unity_runtime_context',
  '</unity_runtime_context>',
  '<animation_capabilities',
  '</animation_capabilities>',
  '<gameplay_event',
  '</gameplay_event>',
  '[SYSTEM_PROMPT]',
  '[/SYSTEM_PROMPT]',
  '[INST]',
  '[/INST]'
] as const

const VISIBLE_CHAT_INTERNAL_BOUNDARY_HOLDBACK_CHARS =
  Math.max(...FORBIDDEN_VISIBLE_CHAT_INTERNAL_MARKERS.map((marker) => marker.length)) - 1

const findFirstVisibleChatInternalBoundary = (value: string): VisibleChatInternalBoundaryMatch | null => {
  const lowerValue = value.toLowerCase()
  let firstMatch: VisibleChatInternalBoundaryMatch | null = null

  for (const marker of FORBIDDEN_VISIBLE_CHAT_INTERNAL_MARKERS) {
    const index = lowerValue.indexOf(marker.toLowerCase())
    if (index === -1) {
      continue
    }
    if (!firstMatch || index < firstMatch.index) {
      firstMatch = { index, marker }
    }
  }

  return firstMatch
}

const truncateAtFirstVisibleChatInternalBoundary = (value: string): VisibleChatInternalBoundaryTruncation => {
  const match = findFirstVisibleChatInternalBoundary(value)
  if (!match) {
    return {
      text: value,
      boundaryMarker: null,
      bTruncated: false
    }
  }

  return {
    text: value.slice(0, match.index),
    boundaryMarker: match.marker,
    bTruncated: true
  }
}

const getVisibleChatInternalBoundaryStops = () => [...FORBIDDEN_VISIBLE_CHAT_INTERNAL_MARKERS]

const mergeVisibleChatStopSequences = (providerTemplateStops: string[]) => [
  ...new Set([...providerTemplateStops, ...getVisibleChatInternalBoundaryStops()])
]

export {
  FORBIDDEN_VISIBLE_CHAT_INTERNAL_MARKERS,
  VISIBLE_CHAT_INTERNAL_BOUNDARY_HOLDBACK_CHARS,
  findFirstVisibleChatInternalBoundary,
  getVisibleChatInternalBoundaryStops,
  mergeVisibleChatStopSequences,
  truncateAtFirstVisibleChatInternalBoundary
}
export type { VisibleChatInternalBoundaryMatch, VisibleChatInternalBoundaryTruncation }
