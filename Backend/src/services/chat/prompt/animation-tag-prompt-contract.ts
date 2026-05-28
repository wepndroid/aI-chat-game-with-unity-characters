import { type AnimationCapabilities, type AnimationCapabilityEntry } from './visible-chat-prompt-types'

type AnimationPromptLimits = {
  moodEntryLimit: number
  gestureEntryLimit: number
  bigGestureEntryLimit: number
  idChars: number
  descriptionChars: number
  exampleResponseChars: number
}

type AnimationPromptCapabilities = {
  moods: AnimationCapabilityEntry[]
  gestures: AnimationCapabilityEntry[]
  bigGestures: AnimationCapabilityEntry[]
  exampleResponse: string
}

type TagNamespace = 'mood' | 'gesture' | 'big_gesture'

type NamespacedEntry = {
  namespace: TagNamespace
  sectionLabel: string
  entry: AnimationCapabilityEntry
}

const normalizePromptText = (value: string | undefined, maxChars: number) => {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars)}...`
}

const uniqueEntries = (entries: AnimationCapabilityEntry[], limit: number, limits: AnimationPromptLimits) => {
  const result: AnimationCapabilityEntry[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    const id = normalizePromptText(entry.id, limits.idChars)
    if (!id || seen.has(id)) {
      continue
    }

    seen.add(id)
    result.push({
      id,
      description: normalizePromptText(entry.description, limits.descriptionChars)
    })

    if (result.length >= limit) {
      break
    }
  }

  return result
}

const normalizeCapabilities = (
  capabilities: AnimationCapabilities,
  limits: AnimationPromptLimits
): AnimationPromptCapabilities => ({
  moods: uniqueEntries(capabilities.moods, limits.moodEntryLimit, limits),
  gestures: uniqueEntries(capabilities.gestures, limits.gestureEntryLimit, limits),
  bigGestures: uniqueEntries(capabilities.big_gestures, limits.bigGestureEntryLimit, limits),
  exampleResponse: normalizePromptText(capabilities.example_response, limits.exampleResponseChars)
})

const renderEntries = (label: string, entries: AnimationCapabilityEntry[]) => {
  if (entries.length === 0) {
    return `${label}: none supplied by Unity.`
  }

  return [
    `${label}:`,
    ...entries.map((entry) => (entry.description ? `- ${entry.id}: ${entry.description}` : `- ${entry.id}`))
  ].join('\n')
}

const namespacedEntries = (capabilities: AnimationPromptCapabilities): NamespacedEntry[] => [
  ...capabilities.moods.map((entry): NamespacedEntry => ({
    namespace: 'mood',
    sectionLabel: 'Valid moods',
    entry
  })),
  ...capabilities.gestures.map((entry): NamespacedEntry => ({
    namespace: 'gesture',
    sectionLabel: 'Valid gestures',
    entry
  })),
  ...capabilities.bigGestures.map((entry): NamespacedEntry => ({
    namespace: 'big_gesture',
    sectionLabel: 'Valid big gestures',
    entry
  }))
]

const groupById = (entries: NamespacedEntry[]) => {
  const grouped = new Map<string, NamespacedEntry[]>()

  for (const namespacedEntry of entries) {
    const key = namespacedEntry.entry.id.toLowerCase()
    const group = grouped.get(key)
    if (group) {
      group.push(namespacedEntry)
    } else {
      grouped.set(key, [namespacedEntry])
    }
  }

  return grouped
}

const renderNamespaceNotes = (capabilities: AnimationPromptCapabilities) => {
  const groupedEntries = groupById(namespacedEntries(capabilities))
  const notes: string[] = []

  for (const entries of groupedEntries.values()) {
    if (entries.length < 2) {
      continue
    }

    const id = entries[0]?.entry.id
    const meanings = entries
      .map((entry) => `${entry.namespace} = ${entry.entry.description || `the ${entry.sectionLabel} meaning`}`)
      .join('; ')
    notes.push(`- ${id} appears in multiple Valid sections; each use is namespace-specific: ${meanings}.`)
  }

  for (const entry of capabilities.bigGestures) {
    const bSharedWithRegularGesture = capabilities.gestures.some(
      (gesture) => gesture.id.toLowerCase() === entry.id.toLowerCase()
    )
    if (!bSharedWithRegularGesture) {
      notes.push(`- ${entry.id} belongs to Valid big gestures and must stay a big_gesture tag.`)
    }
  }

  return notes.length > 0 ? ['Namespace-specific ID notes:', ...notes.slice(0, 8)].join('\n') : null
}

const firstDescribedEntry = (entries: AnimationCapabilityEntry[]) => entries.find((entry) => entry.description) ?? entries[0]

const renderDescriptionBoundExamples = (capabilities: AnimationPromptCapabilities) => {
  const examples: string[] = []
  const mood = firstDescribedEntry(capabilities.moods)
  const gesture = firstDescribedEntry(capabilities.gestures)
  const bigGesture = firstDescribedEntry(capabilities.bigGestures)

  if (mood?.description) {
    examples.push(
      `- If the current sentence's face or emotion matches "${mood.description}", use [mood:${mood.id}] near that sentence.`
    )
  }

  if (gesture?.description) {
    examples.push(`- If the visible beat matches "${gesture.description}", use [gesture:${gesture.id}] near that beat.`)
  }

  if (bigGesture?.description) {
    examples.push(
      `- If the visible beat matches "${bigGesture.description}", use [big_gesture:${bigGesture.id}] near that beat.`
    )
  }

  return examples.length > 0
    ? ['Description-bound examples using only IDs from this request:', ...examples].join('\n')
    : 'Description-bound examples: no described animation IDs supplied by Unity for examples.'
}

const renderAnimationTagPromptContract = (capabilities: AnimationCapabilities, limits: AnimationPromptLimits) => {
  const normalized = normalizeCapabilities(capabilities, limits)
  const namespaceNotes = renderNamespaceNotes(normalized)

  return [
    'Animation tag rules:',
    'Tag namespace contract:',
    '- Choose the tag type first: mood, gesture, or big_gesture.',
    '- Then choose the ID only from that exact Valid section.',
    '- Use [mood:id] only with an ID listed under Valid moods.',
    '- Use [gesture:id] only with an ID listed under Valid gestures.',
    '- Use [big_gesture:id] only with an ID listed under Valid big gestures.',
    '- Do not move IDs between sections. An ID listed only under Valid big gestures must never be written as a regular gesture tag.',
    namespaceNotes,
    '',
    'Tag semantic usage contract:',
    '- Use an animation tag only when the nearby visible beat matches that tag\'s description from the same Valid section.',
    '- Mood tags describe the character\'s face or emotional state for the current sentence or paragraph, not a physical action.',
    '- Regular gesture tags describe local, low- or medium-salience body language or physical actions whose description matches the nearby action text.',
    '- Big gesture tags describe high-salience, interruptive, full-body, or dramatic beats whose description matches the current scene moment.',
    '- If no listed description fits the nearby beat, omit the animation tag instead of forcing a weak valid ID.',
    '- Use a matching tag for each distinct matching beat; avoid only weak, unrelated, or repeated tags.',
    '- If a capability description conflicts with the ID name, follow the description.',
    '- Normal visible replies should usually start with exactly one valid mood tag near the opening emotional beat when a matching Valid mood description exists.',
    '- Add another mood tag only for a genuine mood shift.',
    '- While writing each body-language, movement, reaction, or action beat, attach a valid regular gesture tag when a matching ID exists.',
    '- Use regular gestures liberally for expressive roleplay: the character is physically present, so expressive multi-beat replies usually contain several regular gestures.',
    '- Continue adding regular gestures as the reply unfolds instead of waiting to judge final answer length.',
    '- Terse one-line replies should not be padded with tags; use one mood and one natural gesture only when the line contains an expressive beat.',
    '- Put regular gesture tags immediately before or after the action text, outside the single asterisks.',
    '- Do not place a gesture tag inside single-asterisk narration/action text because Unity playback suppresses regular gestures parsed during narration.',
    '- Big gesture tags remain sparse and high-salience: calm or simple replies may use zero big gestures.',
    '- Strong emotional or gameplay turns should usually use one matching big gesture close to the major beat.',
    '- Exceptional replies may use two big gestures only for two separate major beats with matching Valid big gesture descriptions.',
    '- Do not spam big gestures because Unity pauses text playback for them.',
    '- Body or clothing state belongs in ordinary character-owned prose, not square-bracket reports; place tags near character-owned emotion, action, or dialogue.',
    renderEntries('Valid moods', normalized.moods),
    renderEntries('Valid gestures', normalized.gestures),
    renderEntries('Valid big gestures', normalized.bigGestures),
    renderDescriptionBoundExamples(normalized),
    normalized.exampleResponse ? `Unity example response:\n${normalized.exampleResponse}` : 'Unity example response: none supplied.'
  ]
    .filter((section): section is string => typeof section === 'string' && section.length > 0)
    .join('\n')
}

export { renderAnimationTagPromptContract }
export type { AnimationPromptLimits }
