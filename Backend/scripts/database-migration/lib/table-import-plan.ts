// Migration lifecycle: final-migration-required support code. Disposal checkpoint: post-cutover repository cleanup with migration-only commands.
import { transientOrLegacyExcludedTables } from './import-policy'

type SourceTablePolicyMode = 'import' | 'transform' | 'exclude' | 'derive'

type SourceTablePolicy = {
  mode: SourceTablePolicyMode
  reason: string
  optional?: boolean
}

type ImportPlanEntry = {
  sourceTable: string
  targetModel: string
  delegateName: string
  mode: Extract<SourceTablePolicyMode, 'import' | 'transform'>
  optional?: boolean
}

type DerivedImportPlanEntry = {
  sourceTable: string
  targetModel: string
  delegateName: string
  mode: 'derive'
}

const ignoredSqliteTables = new Set(['sqlite_sequence'])

const importPlan: readonly ImportPlanEntry[] = [
  { sourceTable: 'Tier', targetModel: 'Tier', delegateName: 'tier', mode: 'import' },
  { sourceTable: 'LandingPage', targetModel: 'LandingPage', delegateName: 'landingPage', mode: 'import' },
  {
    sourceTable: 'SiteHomepageSettings',
    targetModel: 'SiteHomepageSettings',
    delegateName: 'siteHomepageSettings',
    mode: 'import',
    optional: true
  },
  { sourceTable: 'LandingPageShortUrl', targetModel: 'LandingPageShortUrl', delegateName: 'landingPageShortUrl', mode: 'import' },
  { sourceTable: 'LandingPageVariant', targetModel: 'LandingPageVariant', delegateName: 'landingPageVariant', mode: 'import' },
  {
    sourceTable: 'LandingPageShortUrlTarget',
    targetModel: 'LandingPageShortUrlTarget',
    delegateName: 'landingPageShortUrlTarget',
    mode: 'import'
  },
  { sourceTable: 'LandingPageVisit', targetModel: 'LandingPageVisit', delegateName: 'landingPageVisit', mode: 'import' },
  { sourceTable: 'User', targetModel: 'User', delegateName: 'user', mode: 'import' },
  { sourceTable: 'OAuthAccount', targetModel: 'OAuthAccount', delegateName: 'oAuthAccount', mode: 'import' },
  { sourceTable: 'PatreonAccount', targetModel: 'PatreonAccount', delegateName: 'patreonAccount', mode: 'import' },
  { sourceTable: 'PatreonOAuthState', targetModel: 'PatreonOAuthState', delegateName: 'patreonOAuthState', mode: 'import' },
  { sourceTable: 'Entitlement', targetModel: 'Entitlement', delegateName: 'entitlement', mode: 'import' },
  {
    sourceTable: 'EmailVerificationToken',
    targetModel: 'EmailVerificationToken',
    delegateName: 'emailVerificationToken',
    mode: 'import'
  },
  { sourceTable: 'PasswordResetToken', targetModel: 'PasswordResetToken', delegateName: 'passwordResetToken', mode: 'import' },
  { sourceTable: 'Character', targetModel: 'Character', delegateName: 'character', mode: 'import' },
  { sourceTable: 'StoryPost', targetModel: 'StoryPost', delegateName: 'storyPost', mode: 'import' },
  { sourceTable: 'StoryPostLike', targetModel: 'StoryPostLike', delegateName: 'storyPostLike', mode: 'import' },
  { sourceTable: 'Review', targetModel: 'Review', delegateName: 'review', mode: 'import' },
  { sourceTable: 'CharacterHeart', targetModel: 'CharacterHeart', delegateName: 'characterHeart', mode: 'import' },
  {
    sourceTable: 'CharacterSystemScanReport',
    targetModel: 'CharacterSystemScanReport',
    delegateName: 'characterSystemScanReport',
    mode: 'import'
  },
  { sourceTable: 'ChatSession', targetModel: 'ChatSession', delegateName: 'chatSession', mode: 'import' },
  { sourceTable: 'ChatMessage', targetModel: 'ChatMessage', delegateName: 'chatMessage', mode: 'import' },
  {
    sourceTable: 'ChatSessionPreviewRefreshJob',
    targetModel: 'ChatSessionPreviewRefreshJob',
    delegateName: 'chatSessionPreviewRefreshJob',
    mode: 'transform'
  },
  { sourceTable: 'ChatMessageUsage', targetModel: 'ChatMessageUsage', delegateName: 'chatMessageUsage', mode: 'import' },
  { sourceTable: 'ChatQuotaPeriod', targetModel: 'ChatQuotaPeriod', delegateName: 'chatQuotaPeriod', mode: 'import' },
  {
    sourceTable: 'ChatQuotaReservation',
    targetModel: 'ChatQuotaReservation',
    delegateName: 'chatQuotaReservation',
    mode: 'transform'
  },
  {
    sourceTable: 'CharacterActivityDailyMetric',
    targetModel: 'CharacterActivityDailyMetric',
    delegateName: 'characterActivityDailyMetric',
    mode: 'import'
  },
  {
    sourceTable: 'CharacterActivityMessageLedger',
    targetModel: 'CharacterActivityMessageLedger',
    delegateName: 'characterActivityMessageLedger',
    mode: 'import'
  },
  {
    sourceTable: 'CharacterCompletedChatLedger',
    targetModel: 'CharacterCompletedChatLedger',
    delegateName: 'characterCompletedChatLedger',
    mode: 'import'
  },
  { sourceTable: 'UnitySessionState', targetModel: 'UnitySessionState', delegateName: 'unitySessionState', mode: 'import' },
  { sourceTable: 'ChatPendingTurn', targetModel: 'ChatPendingTurn', delegateName: 'chatPendingTurn', mode: 'transform' },
  {
    sourceTable: 'RuntimeAdminSettings',
    targetModel: 'RuntimeAdminSettings',
    delegateName: 'runtimeAdminSettings',
    mode: 'transform'
  },
  {
    sourceTable: 'TtsProviderUploadedVoiceAlias',
    targetModel: 'TtsProviderUploadedVoiceAlias',
    delegateName: 'ttsProviderUploadedVoiceAlias',
    mode: 'import'
  },
  { sourceTable: 'NewsArticle', targetModel: 'NewsArticle', delegateName: 'newsArticle', mode: 'import' },
  { sourceTable: 'GameRelease', targetModel: 'GameRelease', delegateName: 'gameRelease', mode: 'import' },
  { sourceTable: 'StaticPages', targetModel: 'StaticPage', delegateName: 'staticPage', mode: 'import' },
  { sourceTable: 'PatreonSyncLog', targetModel: 'PatreonSyncLog', delegateName: 'patreonSyncLog', mode: 'import' },
  {
    sourceTable: 'MarketingEmailTemplates',
    targetModel: 'MarketingEmailTemplate',
    delegateName: 'marketingEmailTemplate',
    mode: 'import'
  },
  {
    sourceTable: 'MarketingEmailSendLog',
    targetModel: 'MarketingEmailSendLog',
    delegateName: 'marketingEmailSendLog',
    mode: 'import'
  },
  {
    sourceTable: 'MarketingEmailAutomation',
    targetModel: 'MarketingEmailAutomation',
    delegateName: 'marketingEmailAutomation',
    mode: 'import',
    optional: true
  },
  {
    sourceTable: 'MarketingEmailAutomationRecipient',
    targetModel: 'MarketingEmailAutomationRecipient',
    delegateName: 'marketingEmailAutomationRecipient',
    mode: 'import',
    optional: true
  },
  {
    sourceTable: 'LandingPageTrackingIssue',
    targetModel: 'LandingPageTrackingIssue',
    delegateName: 'landingPageTrackingIssue',
    mode: 'import'
  },
  { sourceTable: 'RevenueEvent', targetModel: 'RevenueEvent', delegateName: 'revenueEvent', mode: 'import' },
  { sourceTable: 'UserNotification', targetModel: 'UserNotification', delegateName: 'userNotification', mode: 'import' },
  { sourceTable: 'SystemActivityLog', targetModel: 'SystemActivityLog', delegateName: 'systemActivityLog', mode: 'import' }
] as const

const derivedImportPlan = [
  { sourceTable: 'Session', targetModel: 'UserActivityState', delegateName: 'userActivityState', mode: 'derive' }
] as const satisfies readonly DerivedImportPlanEntry[]

const buildImportPlan = (): ImportPlanEntry[] => importPlan.map((entry) => ({ ...entry }))

const buildDerivedImportPlan = (): DerivedImportPlanEntry[] => derivedImportPlan.map((entry) => ({ ...entry }))

const getMissingRequiredSourceTables = (sourceTables: readonly string[]) => {
  const sourceTableSet = new Set(sourceTables)

  return buildImportPlan()
    .filter((entry) => !entry.optional && !sourceTableSet.has(entry.sourceTable))
    .map((entry) => entry.sourceTable)
}

const getSourceTablePolicy = (tableName: string): SourceTablePolicy | null => {
  if (ignoredSqliteTables.has(tableName)) {
    return {
      mode: 'exclude',
      reason: 'sqlite_internal_metadata'
    }
  }

  const importEntry = importPlan.find((entry) => entry.sourceTable === tableName)
  if (importEntry) {
    return {
      mode: importEntry.mode,
      reason: importEntry.mode === 'transform' ? 'import_with_cutover_policy' : 'direct_schema_owned_import',
      optional: importEntry.optional
    }
  }

  if (transientOrLegacyExcludedTables.has(tableName)) {
    return {
      mode: 'exclude',
      reason: 'transient_or_legacy_runtime_state'
    }
  }

  return null
}

const getUnknownSourceTables = (sourceTables: readonly string[]) =>
  sourceTables.filter((tableName) => !ignoredSqliteTables.has(tableName) && getSourceTablePolicy(tableName) === null)

export {
  buildDerivedImportPlan,
  buildImportPlan,
  getMissingRequiredSourceTables,
  getSourceTablePolicy,
  getUnknownSourceTables,
  ignoredSqliteTables
}
export type { DerivedImportPlanEntry, ImportPlanEntry, SourceTablePolicy, SourceTablePolicyMode }
