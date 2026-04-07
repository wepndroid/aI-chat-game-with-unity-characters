-- Safe additive migration: ChatMessageUsage table for rolling message quota tracking.
CREATE TABLE IF NOT EXISTS "ChatMessageUsage" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "userId"         TEXT NOT NULL,
    "periodStartAt"  DATETIME NOT NULL,
    "periodEndAt"    DATETIME NOT NULL,
    "messagesUsed"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      DATETIME NOT NULL,
    CONSTRAINT "ChatMessageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageUsage_userId_periodStartAt_key" ON "ChatMessageUsage"("userId", "periodStartAt");
CREATE INDEX IF NOT EXISTS "ChatMessageUsage_userId_periodEndAt_idx" ON "ChatMessageUsage"("userId", "periodEndAt");
