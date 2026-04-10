import type { StoryListRecord } from '@/lib/story-api'
import { scenarioTypeDisplayLabel } from '@/lib/story-scenario-types'

/** Token for `returnTo` query — edit page maps this to `/your-scenarios`. */
export const SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS = 'your-scenarios'

type BuildScenarioEditHrefOptions = {
  /** When set, edit screen back/save exit goes to Your Scenarios instead of the character page. */
  returnTo?: typeof SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS
}

export const buildScenarioEditHref = (story: StoryListRecord, options?: BuildScenarioEditHrefOptions) => {
  const query =
    options?.returnTo === SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS
      ? `?returnTo=${encodeURIComponent(SCENARIO_EDIT_RETURN_TO_YOUR_SCENARIOS)}`
      : ''

  const ch = story.character
  if (ch) {
    const seg = ch.slug || ch.id
    return `/characters/${encodeURIComponent(seg)}/edit-scenario/${encodeURIComponent(story.id)}${query}`
  }

  return `/stories/${encodeURIComponent(story.id)}/edit${query}`
}

export const scenarioStatusPillClass = (story: StoryListRecord) => {
  if (story.publicationStatus === 'DRAFT') {
    return 'border-white/25 bg-white/[0.06] text-white/65'
  }

  if (story.moderationStatus === 'PENDING') {
    return 'border-amber-400/40 bg-amber-500/15 text-amber-100'
  }

  if (story.moderationStatus === 'APPROVED') {
    return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100'
  }

  if (story.moderationStatus === 'REJECTED') {
    return 'border-rose-400/35 bg-rose-500/10 text-rose-100'
  }

  return 'border-white/20 bg-white/[0.04] text-white/55'
}

export const scenarioStatusLabel = (story: StoryListRecord) => {
  if (story.publicationStatus === 'DRAFT') {
    return 'Draft'
  }

  if (story.moderationStatus === 'PENDING') {
    return 'Pending'
  }

  if (story.moderationStatus === 'APPROVED') {
    return 'Live'
  }

  if (story.moderationStatus === 'REJECTED') {
    return 'Rejected'
  }

  return '—'
}

export const scenarioTypeLabel = (story: StoryListRecord) =>
  story.scenarioType ? scenarioTypeDisplayLabel(story.scenarioType) : null
