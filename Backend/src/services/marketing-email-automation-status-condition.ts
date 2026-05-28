const MARKETING_AUTOMATION_STATUS_CONDITIONS = [
  'email_unverified',
  'verified_no_subscription',
  'engaged_no_subscription',
  'active_subscription',
  'canceled_subscription',
  'all_verified_users'
] as const

type MarketingAutomationStatusCondition = (typeof MARKETING_AUTOMATION_STATUS_CONDITIONS)[number]

export {
  MARKETING_AUTOMATION_STATUS_CONDITIONS
}
export type {
  MarketingAutomationStatusCondition
}
