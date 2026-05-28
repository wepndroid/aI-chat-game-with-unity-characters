-- CreateTable
CREATE TABLE "MarketingEmailAutomation" (
    "id" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "statusCondition" TEXT NOT NULL,
    "triggerDelayHours" INTEGER NOT NULL,
    "triggerDelayDays" INTEGER NOT NULL,
    "campaignDiscountCode" TEXT,
    "campaignFeaturesSummary" TEXT NOT NULL,
    "campaignCtaUrl" TEXT NOT NULL,
    "sendIntervalSeconds" INTEGER NOT NULL,
    "maxRecipients" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "pausedAt" TIMESTAMPTZ(3),

    CONSTRAINT "MarketingEmailAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEmailAutomationRecipient" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "variablesJson" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL,
    "subject" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "claimedAt" TIMESTAMPTZ(3),
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "MarketingEmailAutomationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingEmailAutomation_status_createdAt_idx" ON "MarketingEmailAutomation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEmailAutomationRecipient_automationId_recipientUserId_key" ON "MarketingEmailAutomationRecipient"("automationId", "recipientUserId");

-- CreateIndex
CREATE INDEX "MarketingEmailAutomationRecipient_status_nextAttemptAt_leaseExpiresAt_createdAt_idx" ON "MarketingEmailAutomationRecipient"("status", "nextAttemptAt", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEmailAutomationRecipient_status_leaseExpiresAt_idx" ON "MarketingEmailAutomationRecipient"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "MarketingEmailAutomationRecipient" ADD CONSTRAINT "MarketingEmailAutomationRecipient_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "MarketingEmailAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
