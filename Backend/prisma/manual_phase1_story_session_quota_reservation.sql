-- Phase-1 v4 additive schema update for story-linked sessions and quota reservation ledger.
-- Run after `prisma db push` (or manually for SQLite if not using Prisma migrate).

-- ChatSession: story linkage + mutable list metadata.
ALTER TABLE "ChatSession" ADD COLUMN "storyId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ChatSession" ADD COLUMN "previewText" TEXT;

CREATE INDEX IF NOT EXISTS "ChatSession_storyId_userId_createdAt_idx"
  ON "ChatSession"("storyId", "userId", "createdAt");

-- Quota reservation ledger for reserve/finalize/release + idempotency.
CREATE TABLE IF NOT EXISTS "ChatQuotaReservation" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "usageId"       TEXT NOT NULL,
  "periodStartAt" DATETIME NOT NULL,
  "requestId"     TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'RESERVED',
  "sessionId"     TEXT,
  "messageId"     TEXT,
  "errorReason"   TEXT,
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     DATETIME NOT NULL,
  "finalizedAt"   DATETIME,
  "releasedAt"    DATETIME,
  CONSTRAINT "ChatQuotaReservation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatQuotaReservation_usageId_fkey"
    FOREIGN KEY ("usageId") REFERENCES "ChatMessageUsage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatQuotaReservation_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ChatQuotaReservation_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatQuotaReservation_userId_requestId_key"
  ON "ChatQuotaReservation"("userId", "requestId");
CREATE INDEX IF NOT EXISTS "ChatQuotaReservation_usageId_idx"
  ON "ChatQuotaReservation"("usageId");
CREATE INDEX IF NOT EXISTS "ChatQuotaReservation_userId_periodStartAt_status_idx"
  ON "ChatQuotaReservation"("userId", "periodStartAt", "status");
CREATE INDEX IF NOT EXISTS "ChatQuotaReservation_sessionId_idx"
  ON "ChatQuotaReservation"("sessionId");
