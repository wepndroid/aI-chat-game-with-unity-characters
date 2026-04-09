import { z } from 'zod'

/** Allowed scenario genre values for character-linked stories (API + DB). */
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

export const storyScenarioTypeSchema = z.enum(STORY_SCENARIO_TYPES)
