/** Must match `Backend/src/lib/story-scenario-type.ts` enum values. */
export const STORY_SCENARIO_TYPES = [
  'CYBERPUNK',
  'ROMANCE',
  'FANTASY',
  'SLICE_OF_LIFE',
  'HORROR',
  'ACTION',
  'COMEDY',
  'OTHER'
] as const

export type StoryScenarioType = (typeof STORY_SCENARIO_TYPES)[number]

export const STORY_SCENARIO_TYPE_LABELS: Record<StoryScenarioType, string> = {
  CYBERPUNK: 'Cyberpunk',
  ROMANCE: 'Romance',
  FANTASY: 'Fantasy',
  SLICE_OF_LIFE: 'Slice of life',
  HORROR: 'Horror',
  ACTION: 'Action',
  COMEDY: 'Comedy',
  OTHER: 'Other'
}

/**
 * Badge chrome + quoted dialogue hue. Dialogue uses stronger `-400` (and distinct hues) so preview on dark bg
 * clearly changes when switching categories — yellow/comedy and “other” were easy to confuse with gray narration.
 */
const SCENARIO_THEME_BY_TYPE: Record<
  StoryScenarioType,
  { badgeClass: string; dialogueTextClass: string }
> = {
  CYBERPUNK: {
    badgeClass: 'border-sky-500/35 bg-sky-500/10 text-sky-200/90',
    dialogueTextClass: 'text-cyan-400'
  },
  ROMANCE: {
    badgeClass: 'border-rose-500/35 bg-rose-500/10 text-rose-200/90',
    dialogueTextClass: 'text-rose-400'
  },
  FANTASY: {
    badgeClass: 'border-violet-500/35 bg-violet-500/10 text-violet-200/90',
    dialogueTextClass: 'text-violet-400'
  },
  SLICE_OF_LIFE: {
    badgeClass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200/90',
    dialogueTextClass: 'text-emerald-400'
  },
  HORROR: {
    badgeClass: 'border-red-500/35 bg-red-950/40 text-red-200/85',
    dialogueTextClass: 'text-red-400'
  },
  ACTION: {
    badgeClass: 'border-amber-500/35 bg-amber-500/10 text-amber-200/90',
    dialogueTextClass: 'text-orange-400'
  },
  COMEDY: {
    badgeClass: 'border-yellow-500/35 bg-yellow-500/10 text-yellow-100/90',
    dialogueTextClass: 'text-yellow-400'
  },
  OTHER: {
    badgeClass: 'border-white/20 bg-white/[0.06] text-white/70',
    dialogueTextClass: 'text-indigo-400'
  }
}

export const scenarioTypeBadgeClass = (type: StoryScenarioType | string | null | undefined) => {
  if (type && type in SCENARIO_THEME_BY_TYPE) {
    return SCENARIO_THEME_BY_TYPE[type as StoryScenarioType].badgeClass
  }
  return SCENARIO_THEME_BY_TYPE.OTHER.badgeClass
}

export const scenarioTypeDisplayLabel = (type: string | null | undefined) => {
  if (type && type in STORY_SCENARIO_TYPE_LABELS) {
    return STORY_SCENARIO_TYPE_LABELS[type as StoryScenarioType]
  }
  return STORY_SCENARIO_TYPE_LABELS.OTHER
}

/** Quoted dialogue preview — same hue as the category badge (`SCENARIO_THEME_BY_TYPE`). */
export const scenarioTypeDialogueAccentClass = (type: StoryScenarioType | string | null | undefined) => {
  if (type && type in SCENARIO_THEME_BY_TYPE) {
    return SCENARIO_THEME_BY_TYPE[type as StoryScenarioType].dialogueTextClass
  }
  return SCENARIO_THEME_BY_TYPE.OTHER.dialogueTextClass
}
