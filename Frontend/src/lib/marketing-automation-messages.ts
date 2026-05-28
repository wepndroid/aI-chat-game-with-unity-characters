type MarketingAutomationEnqueueResult = {
  eligible: number
  queued: number
  deferred: boolean
}

/**
 * Builds the operator-facing status copy for a newly started automation.
 *
 * The backend may intentionally defer recipient discovery to the bounded
 * background worker. In that state, showing placeholder queue counters would
 * misrepresent the real system status to admins.
 */
const formatAutomationStartSuccessMessage = (enqueueResult: MarketingAutomationEnqueueResult) => {
  if (enqueueResult.deferred) {
    return 'Automation started. Recipients will be queued by the background worker in bounded batches.'
  }

  return `Automation started. ${enqueueResult.queued} of ${enqueueResult.eligible} eligible users were queued.`
}

export { formatAutomationStartSuccessMessage }
export type { MarketingAutomationEnqueueResult }
