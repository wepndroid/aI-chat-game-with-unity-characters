/** Stored `body` = story setup + chat block (search / legacy). */
const combineScenarioFields = (scenarioStory: string, scenarioChat: string): string => {
  const a = scenarioStory.trim()
  const b = scenarioChat.trim()
  if (!a && !b) {
    return ''
  }
  if (!a) {
    return b
  }
  if (!b) {
    return a
  }
  return `${a}\n\n${b}`
}

export { combineScenarioFields }
