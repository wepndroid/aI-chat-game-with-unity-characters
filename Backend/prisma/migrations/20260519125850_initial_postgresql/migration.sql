-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'CREATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('GOOGLE', 'GITHUB', 'DISCORD');

-- CreateEnum
CREATE TYPE "CharacterStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CharacterVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('PATREON', 'STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RevenueEventProvider" AS ENUM ('PATREON');

-- CreateEnum
CREATE TYPE "RevenueEventKind" AS ENUM ('INITIAL_PURCHASE', 'RENEWAL', 'REACTIVATION', 'UPGRADE', 'DOWNGRADE');

-- CreateEnum
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ChatSessionPreviewRefreshJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "UnityLaunchMode" AS ENUM ('FRESH_SESSION');

-- CreateEnum
CREATE TYPE "ChatPendingTurnKind" AS ENUM ('normal', 'gameplay');

-- CreateEnum
CREATE TYPE "ChatPendingTurnStatus" AS ENUM ('PENDING', 'COMMITTED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GameReleasePlatform" AS ENUM ('WINDOWS', 'WEBGL');

-- CreateEnum
CREATE TYPE "PatreonSyncLogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "MarketingEmailTemplateCategory" AS ENUM ('system', 'onboarding', 'conversion', 'winback', 'announcement');

-- CreateEnum
CREATE TYPE "MarketingEmailSendMode" AS ENUM ('test', 'segment', 'single');

-- CreateEnum
CREATE TYPE "MarketingEmailSendStatus" AS ENUM ('sent', 'failed');

-- CreateEnum
CREATE TYPE "StoryPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "StoryModerationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChatQuotaReservationStatus" AS ENUM ('RESERVED', 'FINALIZED', 'RELEASED');

-- CreateTable
CREATE TABLE "Tier" (
    "code" TEXT NOT NULL,
    "messageLimit" INTEGER NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 30,
    "label" TEXT,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "playerName" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "tierCode" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "officialVrmsListSeenAt" TIMESTAMPTZ(3),
    "communityVrmsListSeenAt" TIMESTAMPTZ(3),
    "acquisitionVisitId" TEXT,
    "patreonLinkedAt" TIMESTAMPTZ(3),
    "patreonActiveAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "basePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteHomepageSettings" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SiteHomepageSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageShortUrl" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingPageShortUrl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageShortUrlTarget" (
    "id" TEXT NOT NULL,
    "shortUrlId" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingPageShortUrlTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageVariant" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "routePath" TEXT NOT NULL,
    "notes" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingPageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageVisit" (
    "id" TEXT NOT NULL,
    "landingPageId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "shortUrlId" TEXT,
    "visitorId" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "attributionKey" TEXT,
    "referrerHost" TEXT,
    "entryPath" TEXT,
    "landingUrl" TEXT,
    "userAgent" TEXT,
    "gaClientId" TEXT,
    "gaSessionId" TEXT,
    "visitCount" INTEGER NOT NULL DEFAULT 1,
    "firstVisitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVisitedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signupClickedAt" TIMESTAMPTZ(3),
    "signedUpUserId" TEXT,
    "signupCompletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "LandingPageVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingPageTrackingIssue" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "landingPageKey" TEXT,
    "variantKey" TEXT,
    "routePath" TEXT,
    "shortUrlKey" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LandingPageTrackingIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acquisitionVisitId" TEXT,
    "provider" "RevenueEventProvider" NOT NULL DEFAULT 'PATREON',
    "kind" "RevenueEventKind" NOT NULL,
    "providerEventKey" TEXT NOT NULL,
    "tierCode" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "billingPeriodMonths" INTEGER NOT NULL DEFAULT 1,
    "chargedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemActivityLog" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "vroidFileUrl" TEXT,
    "poseFileUrl" TEXT,
    "previewImageUrl" TEXT,
    "voiceFileUrl" TEXT,
    "voiceFileName" TEXT,
    "thumbnailReferenceImageUrl" TEXT,
    "cardThumbnailDesktopUrl" TEXT,
    "cardThumbnailMobileUrl" TEXT,
    "legacyFileHash" TEXT,
    "legacyTier" INTEGER,
    "legacyHeyWaifu" INTEGER,
    "status" "CharacterStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CharacterVisibility" NOT NULL DEFAULT 'PUBLIC',
    "officialListing" BOOLEAN NOT NULL DEFAULT false,
    "isPatreonGated" BOOLEAN NOT NULL DEFAULT false,
    "minimumTierCents" INTEGER,
    "moderationRejectReason" TEXT,
    "heartsCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "completedChatCount" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCard" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "creatorUserId" TEXT NOT NULL,
    "fullName" TEXT,
    "description" TEXT,
    "personality" TEXT,
    "scenario" TEXT,
    "firstMessage" TEXT,
    "exampleDialogs" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CharacterCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterCardId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previewText" TEXT,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientMessageId" TEXT,
    "role" "ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSessionPreviewRefreshJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pendingTurnId" TEXT NOT NULL,
    "userMessageId" TEXT NOT NULL,
    "assistantMessageId" TEXT NOT NULL,
    "status" "ChatSessionPreviewRefreshJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "processedAt" TIMESTAMPTZ(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatSessionPreviewRefreshJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterSystemScanReport" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "overall" TEXT NOT NULL,
    "issuesCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "reportJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSystemScanReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterHeart" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterHeart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCompletedChatLedger" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "countedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterCompletedChatLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterActivityMessageLedger" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "role" "ChatMessageRole" NOT NULL,
    "messageCreatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CharacterActivityMessageLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterActivityDailyMetric" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "completedChatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CharacterActivityDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatreonAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "patreonUserId" TEXT NOT NULL,
    "campaignMemberId" TEXT,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMPTZ(3),
    "tierCents" INTEGER,
    "pledgeCadenceMonths" INTEGER NOT NULL DEFAULT 1,
    "membershipStatus" TEXT,
    "lastChargeStatus" TEXT,
    "lastChargeDate" TIMESTAMPTZ(3),
    "nextChargeDate" TIMESTAMPTZ(3),
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatreonAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatreonOAuthState" (
    "id" TEXT NOT NULL,
    "stateToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectAfter" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatreonOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL DEFAULT 'PATREON',
    "tierCode" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'INACTIVE',
    "validFrom" TIMESTAMPTZ(3),
    "validUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeAdminSettings" (
    "id" TEXT NOT NULL,
    "uploadLimitsJson" JSONB NOT NULL,
    "characterFieldLimitsJson" JSONB NOT NULL,
    "thumbnailGenerationJson" JSONB NOT NULL,
    "requestLimitsJson" JSONB NOT NULL,
    "sessionLoginJson" JSONB NOT NULL,
    "featureSwitchesJson" JSONB NOT NULL,
    "maintenanceJson" JSONB NOT NULL,
    "apiKeysJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RuntimeAdminSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "promptDescription" TEXT,
    "personality" TEXT,
    "scenario" TEXT,
    "firstMessage" TEXT,
    "exampleDialogs" TEXT,
    "scenarioStory" TEXT NOT NULL DEFAULT '',
    "scenarioChat" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "scenarioType" TEXT,
    "voiceFileUrl" TEXT,
    "voiceFileName" TEXT,
    "publicationStatus" "StoryPublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderationStatus" "StoryModerationStatus" NOT NULL DEFAULT 'NONE',
    "moderationRejectReason" TEXT,
    "authorReadRejectionAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StoryPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPostLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryPostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStartAt" TIMESTAMPTZ(3) NOT NULL,
    "periodEndAt" TIMESTAMPTZ(3) NOT NULL,
    "messagesUsed" INTEGER NOT NULL DEFAULT 0,
    "voiceMessagesUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMessageUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatQuotaPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStartAt" TIMESTAMPTZ(3) NOT NULL,
    "periodEndAt" TIMESTAMPTZ(3) NOT NULL,
    "tierCode" TEXT NOT NULL,
    "resetReason" TEXT NOT NULL,
    "sourceEventKey" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatQuotaPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatQuotaReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usageId" TEXT NOT NULL,
    "periodStartAt" TIMESTAMPTZ(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestFingerprint" TEXT,
    "voiceRequested" BOOLEAN NOT NULL DEFAULT false,
    "voiceConsumed" BOOLEAN NOT NULL DEFAULT false,
    "voiceTaskId" TEXT,
    "status" "ChatQuotaReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "sessionId" TEXT,
    "messageId" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "finalizedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChatQuotaReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatPendingTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "kind" "ChatPendingTurnKind" NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "messageText" TEXT,
    "gameplayEventType" TEXT,
    "gameplayEventPayloadJson" JSONB,
    "gameplayDisplayText" TEXT,
    "assistantText" TEXT NOT NULL,
    "assistantSha256" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "voiceRequested" BOOLEAN NOT NULL DEFAULT false,
    "voiceConsumed" BOOLEAN NOT NULL DEFAULT false,
    "voiceAudioUrl" TEXT,
    "voiceTaskId" TEXT,
    "status" "ChatPendingTurnStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "committedUserMessageId" TEXT,
    "committedAssistantMessageId" TEXT,
    "abortReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "committedAt" TIMESTAMPTZ(3),
    "abortedAt" TIMESTAMPTZ(3),
    "expiredAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChatPendingTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitySessionState" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metadataVersion" INTEGER NOT NULL,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UnitySessionState_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "UnityLaunchContext" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "launchMode" "UnityLaunchMode" NOT NULL DEFAULT 'FRESH_SESSION',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "consumedSessionId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnityLaunchContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailedLoginAttempt" (
    "ipAddress" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartAt" TIMESTAMPTZ(3) NOT NULL,
    "lockUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("ipAddress")
);

-- CreateTable
CREATE TABLE "TtsProviderUploadedVoiceAlias" (
    "id" TEXT NOT NULL,
    "uploadedRelativePath" TEXT NOT NULL,
    "fileSignature" TEXT NOT NULL,
    "providerAlias" TEXT NOT NULL,
    "providerVoiceRefPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "nextRetryAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TtsProviderUploadedVoiceAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRelease" (
    "id" TEXT NOT NULL,
    "platform" "GameReleasePlatform" NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "changelogHtml" TEXT NOT NULL DEFAULT '',
    "artifactUrl" TEXT NOT NULL,
    "runtimeUrl" TEXT,
    "downloadUrl" TEXT,
    "artifactFileName" TEXT,
    "storagePath" TEXT,
    "totalBytes" BIGINT,
    "fileCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "newsArticleId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GameRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "contentHtml" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaticPages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "contentHtml" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "revisionDate" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "showInFooter" BOOLEAN NOT NULL DEFAULT false,
    "footerLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaticPages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatreonSyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "level" "PatreonSyncLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "detailsJson" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatreonSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailTemplates" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "MarketingEmailTemplateCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "textBody" TEXT NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketingEmailTemplates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailSendLog" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "segmentKey" TEXT,
    "mode" "MarketingEmailSendMode" NOT NULL,
    "status" "MarketingEmailSendStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "MarketingEmailSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_acquisitionVisitId_key" ON "User"("acquisitionVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPage_key_key" ON "LandingPage"("key");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageShortUrl_key_key" ON "LandingPageShortUrl"("key");

-- CreateIndex
CREATE INDEX "LandingPageShortUrl_isActive_createdAt_idx" ON "LandingPageShortUrl"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "LandingPageShortUrlTarget_shortUrlId_weight_idx" ON "LandingPageShortUrlTarget"("shortUrlId", "weight");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageShortUrlTarget_shortUrlId_landingPageId_key" ON "LandingPageShortUrlTarget"("shortUrlId", "landingPageId");

-- CreateIndex
CREATE INDEX "LandingPageVariant_landingPageId_isActive_idx" ON "LandingPageVariant"("landingPageId", "isActive");

-- CreateIndex
CREATE INDEX "LandingPageVariant_routePath_idx" ON "LandingPageVariant"("routePath");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageVariant_landingPageId_key_key" ON "LandingPageVariant"("landingPageId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageVisit_signedUpUserId_key" ON "LandingPageVisit"("signedUpUserId");

-- CreateIndex
CREATE INDEX "LandingPageVisit_visitorId_variantId_idx" ON "LandingPageVisit"("visitorId", "variantId");

-- CreateIndex
CREATE INDEX "LandingPageVisit_landingPageId_firstVisitedAt_idx" ON "LandingPageVisit"("landingPageId", "firstVisitedAt");

-- CreateIndex
CREATE INDEX "LandingPageVisit_variantId_firstVisitedAt_idx" ON "LandingPageVisit"("variantId", "firstVisitedAt");

-- CreateIndex
CREATE INDEX "LandingPageVisit_shortUrlId_firstVisitedAt_idx" ON "LandingPageVisit"("shortUrlId", "firstVisitedAt");

-- CreateIndex
CREATE INDEX "LandingPageVisit_source_campaign_medium_idx" ON "LandingPageVisit"("source", "campaign", "medium");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageVisit_visitorId_attributionKey_key" ON "LandingPageVisit"("visitorId", "attributionKey");

-- CreateIndex
CREATE UNIQUE INDEX "LandingPageTrackingIssue_fingerprint_key" ON "LandingPageTrackingIssue"("fingerprint");

-- CreateIndex
CREATE INDEX "LandingPageTrackingIssue_lastSeenAt_idx" ON "LandingPageTrackingIssue"("lastSeenAt");

-- CreateIndex
CREATE INDEX "LandingPageTrackingIssue_kind_lastSeenAt_idx" ON "LandingPageTrackingIssue"("kind", "lastSeenAt");

-- CreateIndex
CREATE INDEX "LandingPageTrackingIssue_landingPageKey_lastSeenAt_idx" ON "LandingPageTrackingIssue"("landingPageKey", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueEvent_providerEventKey_key" ON "RevenueEvent"("providerEventKey");

-- CreateIndex
CREATE INDEX "RevenueEvent_userId_chargedAt_idx" ON "RevenueEvent"("userId", "chargedAt");

-- CreateIndex
CREATE INDEX "RevenueEvent_acquisitionVisitId_chargedAt_idx" ON "RevenueEvent"("acquisitionVisitId", "chargedAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_readAt_idx" ON "UserNotification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemActivityLog_createdAt_idx" ON "SystemActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Character_slug_key" ON "Character"("slug");

-- CreateIndex
CREATE INDEX "Character_ownerId_status_idx" ON "Character"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Character_status_visibility_idx" ON "Character"("status", "visibility");

-- CreateIndex
CREATE INDEX "Character_messageCount_heartsCount_createdAt_idx" ON "Character"("messageCount", "heartsCount", "createdAt");

-- CreateIndex
CREATE INDEX "Character_completedChatCount_createdAt_idx" ON "Character"("completedChatCount", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterCard_characterId_key" ON "CharacterCard"("characterId");

-- CreateIndex
CREATE INDEX "CharacterCard_creatorUserId_idx" ON "CharacterCard"("creatorUserId");

-- CreateIndex
CREATE INDEX "ChatSession_userId_createdAt_idx" ON "ChatSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_characterCardId_idx" ON "ChatSession"("characterCardId");

-- CreateIndex
CREATE INDEX "ChatSession_storyId_userId_createdAt_idx" ON "ChatSession"("storyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_clientMessageId_idx" ON "ChatMessage"("sessionId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSessionPreviewRefreshJob_userMessageId_key" ON "ChatSessionPreviewRefreshJob"("userMessageId");

-- CreateIndex
CREATE INDEX "ChatSessionPreviewRefreshJob_status_nextAttemptAt_createdAt_idx" ON "ChatSessionPreviewRefreshJob"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSessionPreviewRefreshJob_sessionId_status_idx" ON "ChatSessionPreviewRefreshJob"("sessionId", "status");

-- CreateIndex
CREATE INDEX "ChatSessionPreviewRefreshJob_leaseExpiresAt_idx" ON "ChatSessionPreviewRefreshJob"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "CharacterSystemScanReport_characterId_createdAt_idx" ON "CharacterSystemScanReport"("characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterHeart_characterId_idx" ON "CharacterHeart"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterHeart_userId_characterId_key" ON "CharacterHeart"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterCompletedChatLedger_sessionId_key" ON "CharacterCompletedChatLedger"("sessionId");

-- CreateIndex
CREATE INDEX "CharacterCompletedChatLedger_characterId_countedAt_idx" ON "CharacterCompletedChatLedger"("characterId", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterActivityMessageLedger_messageId_key" ON "CharacterActivityMessageLedger"("messageId");

-- CreateIndex
CREATE INDEX "CharacterActivityMessageLedger_processedAt_createdAt_idx" ON "CharacterActivityMessageLedger"("processedAt", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterActivityMessageLedger_characterId_messageCreatedAt_idx" ON "CharacterActivityMessageLedger"("characterId", "messageCreatedAt");

-- CreateIndex
CREATE INDEX "CharacterActivityMessageLedger_sessionId_idx" ON "CharacterActivityMessageLedger"("sessionId");

-- CreateIndex
CREATE INDEX "CharacterActivityDailyMetric_day_messageCount_idx" ON "CharacterActivityDailyMetric"("day", "messageCount");

-- CreateIndex
CREATE INDEX "CharacterActivityDailyMetric_day_completedChatCount_idx" ON "CharacterActivityDailyMetric"("day", "completedChatCount");

-- CreateIndex
CREATE INDEX "CharacterActivityDailyMetric_characterId_day_idx" ON "CharacterActivityDailyMetric"("characterId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterActivityDailyMetric_characterId_day_key" ON "CharacterActivityDailyMetric"("characterId", "day");

-- CreateIndex
CREATE INDEX "Review_characterId_idx" ON "Review"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_userId_characterId_key" ON "Review"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "PatreonAccount_userId_key" ON "PatreonAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatreonAccount_patreonUserId_key" ON "PatreonAccount"("patreonUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PatreonOAuthState_stateToken_key" ON "PatreonOAuthState"("stateToken");

-- CreateIndex
CREATE INDEX "PatreonOAuthState_userId_expiresAt_idx" ON "PatreonOAuthState"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Entitlement_userId_status_idx" ON "Entitlement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_expiresAt_consumedAt_idx" ON "EmailVerificationToken"("expiresAt", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_consumedAt_idx" ON "PasswordResetToken"("expiresAt", "consumedAt");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerUserId_key" ON "OAuthAccount"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_userId_provider_key" ON "OAuthAccount"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionTokenHash_key" ON "Session"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_revokedAt_idx" ON "Session"("revokedAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_revokedAt_idx" ON "Session"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "StoryPost_authorId_createdAt_idx" ON "StoryPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPost_authorId_publicationStatus_idx" ON "StoryPost"("authorId", "publicationStatus");

-- CreateIndex
CREATE INDEX "StoryPost_publicationStatus_createdAt_idx" ON "StoryPost"("publicationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPost_moderationStatus_publicationStatus_idx" ON "StoryPost"("moderationStatus", "publicationStatus");

-- CreateIndex
CREATE INDEX "StoryPost_characterId_idx" ON "StoryPost"("characterId");

-- CreateIndex
CREATE INDEX "StoryPostLike_storyId_idx" ON "StoryPostLike"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryPostLike_userId_storyId_key" ON "StoryPostLike"("userId", "storyId");

-- CreateIndex
CREATE INDEX "ChatMessageUsage_userId_periodEndAt_idx" ON "ChatMessageUsage"("userId", "periodEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageUsage_userId_periodStartAt_key" ON "ChatMessageUsage"("userId", "periodStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatQuotaPeriod_sourceEventKey_key" ON "ChatQuotaPeriod"("sourceEventKey");

-- CreateIndex
CREATE INDEX "ChatQuotaPeriod_userId_periodStartAt_periodEndAt_idx" ON "ChatQuotaPeriod"("userId", "periodStartAt", "periodEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatQuotaPeriod_userId_periodStartAt_key" ON "ChatQuotaPeriod"("userId", "periodStartAt");

-- CreateIndex
CREATE INDEX "ChatQuotaReservation_usageId_idx" ON "ChatQuotaReservation"("usageId");

-- CreateIndex
CREATE INDEX "ChatQuotaReservation_userId_periodStartAt_status_idx" ON "ChatQuotaReservation"("userId", "periodStartAt", "status");

-- CreateIndex
CREATE INDEX "ChatQuotaReservation_sessionId_idx" ON "ChatQuotaReservation"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatQuotaReservation_userId_requestId_key" ON "ChatQuotaReservation"("userId", "requestId");

-- CreateIndex
CREATE INDEX "ChatPendingTurn_userId_sessionId_status_idx" ON "ChatPendingTurn"("userId", "sessionId", "status");

-- CreateIndex
CREATE INDEX "ChatPendingTurn_expiresAt_status_idx" ON "ChatPendingTurn"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "ChatPendingTurn_storyId_idx" ON "ChatPendingTurn"("storyId");

-- CreateIndex
CREATE INDEX "ChatPendingTurn_reservationId_idx" ON "ChatPendingTurn"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatPendingTurn_userId_requestId_key" ON "ChatPendingTurn"("userId", "requestId");

-- CreateIndex
CREATE INDEX "UnitySessionState_userId_idx" ON "UnitySessionState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnityLaunchContext_tokenHash_key" ON "UnityLaunchContext"("tokenHash");

-- CreateIndex
CREATE INDEX "UnityLaunchContext_userId_expiresAt_idx" ON "UnityLaunchContext"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UnityLaunchContext_storyId_expiresAt_idx" ON "UnityLaunchContext"("storyId", "expiresAt");

-- CreateIndex
CREATE INDEX "UnityLaunchContext_characterId_expiresAt_idx" ON "UnityLaunchContext"("characterId", "expiresAt");

-- CreateIndex
CREATE INDEX "UnityLaunchContext_expiresAt_consumedAt_idx" ON "UnityLaunchContext"("expiresAt", "consumedAt");

-- CreateIndex
CREATE INDEX "UnityLaunchContext_consumedSessionId_idx" ON "UnityLaunchContext"("consumedSessionId");

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_lockUntil_idx" ON "FailedLoginAttempt"("lockUntil");

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_windowStartAt_idx" ON "FailedLoginAttempt"("windowStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "TtsProviderUploadedVoiceAlias_uploadedRelativePath_key" ON "TtsProviderUploadedVoiceAlias"("uploadedRelativePath");

-- CreateIndex
CREATE UNIQUE INDEX "TtsProviderUploadedVoiceAlias_providerAlias_key" ON "TtsProviderUploadedVoiceAlias"("providerAlias");

-- CreateIndex
CREATE INDEX "TtsProviderUploadedVoiceAlias_status_nextRetryAt_idx" ON "TtsProviderUploadedVoiceAlias"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "GameRelease_platform_isActive_deletedAt_idx" ON "GameRelease"("platform", "isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "GameRelease_platform_createdAt_idx" ON "GameRelease"("platform", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GameRelease_newsArticleId_deletedAt_idx" ON "GameRelease"("newsArticleId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");

-- CreateIndex
CREATE INDEX "NewsArticle_slug_deletedAt_idx" ON "NewsArticle"("slug", "deletedAt");

-- CreateIndex
CREATE INDEX "NewsArticle_isPublished_createdAt_deletedAt_idx" ON "NewsArticle"("isPublished", "createdAt" DESC, "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaticPages_slug_key" ON "StaticPages"("slug");

-- CreateIndex
CREATE INDEX "StaticPages_isPublished_slug_idx" ON "StaticPages"("isPublished", "slug");

-- CreateIndex
CREATE INDEX "StaticPages_showInFooter_sortOrder_title_idx" ON "StaticPages"("showInFooter", "sortOrder", "title");

-- CreateIndex
CREATE INDEX "PatreonSyncLog_userId_createdAt_idx" ON "PatreonSyncLog"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PatreonSyncLog_actorUserId_createdAt_idx" ON "PatreonSyncLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailTemplates_templateKey_key" ON "MarketingEmailTemplates"("templateKey");

-- CreateIndex
CREATE INDEX "MarketingEmailTemplates_category_name_idx" ON "MarketingEmailTemplates"("category", "name");

-- CreateIndex
CREATE INDEX "MarketingEmailSendLog_createdAt_idx" ON "MarketingEmailSendLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketingEmailSendLog_recipientEmail_idx" ON "MarketingEmailSendLog"("recipientEmail");

-- CreateIndex
CREATE INDEX "MarketingEmailSendLog_recipientUserId_createdAt_idx" ON "MarketingEmailSendLog"("recipientUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketingEmailSendLog_templateKey_createdAt_idx" ON "MarketingEmailSendLog"("templateKey", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tierCode_fkey" FOREIGN KEY ("tierCode") REFERENCES "Tier"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_acquisitionVisitId_fkey" FOREIGN KEY ("acquisitionVisitId") REFERENCES "LandingPageVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteHomepageSettings" ADD CONSTRAINT "SiteHomepageSettings_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageShortUrlTarget" ADD CONSTRAINT "LandingPageShortUrlTarget_shortUrlId_fkey" FOREIGN KEY ("shortUrlId") REFERENCES "LandingPageShortUrl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageShortUrlTarget" ADD CONSTRAINT "LandingPageShortUrlTarget_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageVariant" ADD CONSTRAINT "LandingPageVariant_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageVisit" ADD CONSTRAINT "LandingPageVisit_landingPageId_fkey" FOREIGN KEY ("landingPageId") REFERENCES "LandingPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageVisit" ADD CONSTRAINT "LandingPageVisit_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "LandingPageVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingPageVisit" ADD CONSTRAINT "LandingPageVisit_shortUrlId_fkey" FOREIGN KEY ("shortUrlId") REFERENCES "LandingPageShortUrl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevenueEvent" ADD CONSTRAINT "RevenueEvent_acquisitionVisitId_fkey" FOREIGN KEY ("acquisitionVisitId") REFERENCES "LandingPageVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCard" ADD CONSTRAINT "CharacterCard_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSessionPreviewRefreshJob" ADD CONSTRAINT "ChatSessionPreviewRefreshJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterSystemScanReport" ADD CONSTRAINT "CharacterSystemScanReport_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterHeart" ADD CONSTRAINT "CharacterHeart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterHeart" ADD CONSTRAINT "CharacterHeart_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCompletedChatLedger" ADD CONSTRAINT "CharacterCompletedChatLedger_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterActivityMessageLedger" ADD CONSTRAINT "CharacterActivityMessageLedger_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterActivityMessageLedger" ADD CONSTRAINT "CharacterActivityMessageLedger_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterActivityDailyMetric" ADD CONSTRAINT "CharacterActivityDailyMetric_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatreonAccount" ADD CONSTRAINT "PatreonAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatreonOAuthState" ADD CONSTRAINT "PatreonOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPost" ADD CONSTRAINT "StoryPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPost" ADD CONSTRAINT "StoryPost_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPostLike" ADD CONSTRAINT "StoryPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPostLike" ADD CONSTRAINT "StoryPostLike_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageUsage" ADD CONSTRAINT "ChatMessageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaPeriod" ADD CONSTRAINT "ChatQuotaPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaPeriod" ADD CONSTRAINT "ChatQuotaPeriod_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaReservation" ADD CONSTRAINT "ChatQuotaReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaReservation" ADD CONSTRAINT "ChatQuotaReservation_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "ChatMessageUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaReservation" ADD CONSTRAINT "ChatQuotaReservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatQuotaReservation" ADD CONSTRAINT "ChatQuotaReservation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPendingTurn" ADD CONSTRAINT "ChatPendingTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPendingTurn" ADD CONSTRAINT "ChatPendingTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPendingTurn" ADD CONSTRAINT "ChatPendingTurn_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPendingTurn" ADD CONSTRAINT "ChatPendingTurn_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ChatQuotaReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitySessionState" ADD CONSTRAINT "UnitySessionState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitySessionState" ADD CONSTRAINT "UnitySessionState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnityLaunchContext" ADD CONSTRAINT "UnityLaunchContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnityLaunchContext" ADD CONSTRAINT "UnityLaunchContext_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnityLaunchContext" ADD CONSTRAINT "UnityLaunchContext_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnityLaunchContext" ADD CONSTRAINT "UnityLaunchContext_consumedSessionId_fkey" FOREIGN KEY ("consumedSessionId") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameRelease" ADD CONSTRAINT "GameRelease_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatreonSyncLog" ADD CONSTRAINT "PatreonSyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatreonSyncLog" ADD CONSTRAINT "PatreonSyncLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSendLog" ADD CONSTRAINT "MarketingEmailSendLog_templateKey_fkey" FOREIGN KEY ("templateKey") REFERENCES "MarketingEmailTemplates"("templateKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingEmailSendLog" ADD CONSTRAINT "MarketingEmailSendLog_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
