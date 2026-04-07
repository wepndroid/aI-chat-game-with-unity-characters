-- Safe additive migration: StoryPost + StoryPostLike tables for community story adjustments.

CREATE TABLE IF NOT EXISTS "StoryPost" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "authorId"    TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "characterId" TEXT,
    "visibility"  TEXT NOT NULL DEFAULT 'PUBLIC',
    "likesCount"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL,
    CONSTRAINT "StoryPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoryPost_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "StoryPost_authorId_createdAt_idx" ON "StoryPost"("authorId", "createdAt");
CREATE INDEX IF NOT EXISTS "StoryPost_visibility_createdAt_idx" ON "StoryPost"("visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "StoryPost_characterId_idx" ON "StoryPost"("characterId");

CREATE TABLE IF NOT EXISTS "StoryPostLike" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "userId"    TEXT NOT NULL,
    "storyId"   TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoryPostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoryPostLike_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "StoryPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryPostLike_userId_storyId_key" ON "StoryPostLike"("userId", "storyId");
CREATE INDEX IF NOT EXISTS "StoryPostLike_storyId_idx" ON "StoryPostLike"("storyId");
