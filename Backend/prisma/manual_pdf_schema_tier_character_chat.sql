-- PDF-aligned schema: Tier, User.tierCode, CharacterCard, ChatSession, ChatMessage (SQLite additive).

CREATE TABLE IF NOT EXISTS "Tier" (
  "code" TEXT NOT NULL PRIMARY KEY,
  "messageLimit" INTEGER NOT NULL,
  "periodDays" INTEGER NOT NULL DEFAULT 30,
  "label" TEXT
);

INSERT OR IGNORE INTO "Tier" ("code", "messageLimit", "periodDays", "label") VALUES
  ('free', 20, 30, 'Free'),
  ('basic', 500, 30, 'Basic'),
  ('premium', 5000, 30, 'Premium');

-- User.tierCode: run `manual_pdf_schema_user_tier_column.sql` once if the column is missing.

CREATE TABLE IF NOT EXISTS "CharacterCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "creatorUserId" TEXT NOT NULL,
  "fullName" TEXT,
  "description" TEXT,
  "personality" TEXT,
  "scenario" TEXT,
  "firstMessage" TEXT,
  "exampleDialogs" TEXT,
  "isPublic" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CharacterCard_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterCard_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterCard_characterId_key" ON "CharacterCard"("characterId");
CREATE INDEX IF NOT EXISTS "CharacterCard_creatorUserId_idx" ON "CharacterCard"("creatorUserId");

CREATE TABLE IF NOT EXISTS "ChatSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "characterCardId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatSession_characterCardId_fkey" FOREIGN KEY ("characterCardId") REFERENCES "CharacterCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChatSession_userId_createdAt_idx" ON "ChatSession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatSession_characterCardId_idx" ON "ChatSession"("characterCardId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");
