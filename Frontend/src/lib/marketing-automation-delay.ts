type MarketingAutomationDelayUnit = 'hours' | 'days'

const HOURS_PER_DAY = 24

/**
 * Mirrors the backend marketing automation delay contract so admin previews show
 * the exact integer hour payload that will be saved.
 */
const MARKETING_AUTOMATION_MAX_DELAY_HOURS = 3650 * HOURS_PER_DAY

const clampMarketingAutomationDelayHours = (hours: number) =>
  Math.min(MARKETING_AUTOMATION_MAX_DELAY_HOURS, Math.max(0, Math.round(Number.isFinite(hours) ? hours : 0)))

const formatDelayCount = (value: number, singular: string, plural: string) =>
  `${value.toLocaleString()} ${value === 1 ? singular : plural}`

const resolveMarketingAutomationDelayHours = (value: string, unit: MarketingAutomationDelayUnit) => {
  const parsedValue = Number(value)
  const multiplier = unit === 'days' ? HOURS_PER_DAY : 1

  return clampMarketingAutomationDelayHours(parsedValue * multiplier)
}

const formatMarketingAutomationDelayHours = (hours: number) => {
  const delayHours = clampMarketingAutomationDelayHours(hours)

  if (delayHours > 0 && delayHours % HOURS_PER_DAY === 0) {
    return formatDelayCount(delayHours / HOURS_PER_DAY, 'day', 'days')
  }

  return formatDelayCount(delayHours, 'hour', 'hours')
}

export {
  MARKETING_AUTOMATION_MAX_DELAY_HOURS,
  formatMarketingAutomationDelayHours,
  resolveMarketingAutomationDelayHours
}

export type { MarketingAutomationDelayUnit }
