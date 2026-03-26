/** Heuristic keyword match for moderator hints (not automated moderation). */
const getDescriptionKeywordFlagCount = (description: string | null | undefined): number | undefined => {
  const normalized = description?.toLowerCase() ?? ''
  if (normalized.includes('nsfw') || normalized.includes('naked')) {
    return 1
  }
  return undefined
}

const descriptionHasModeratorKeywordHint = (description: string | null | undefined): boolean =>
  getDescriptionKeywordFlagCount(description) !== undefined

export { descriptionHasModeratorKeywordHint, getDescriptionKeywordFlagCount }
