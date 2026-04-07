-- One-shot for existing SQLite DBs that still have StoryPost.visibility (SQLite 3.35+).
-- Prefer `npx prisma db push` or migrations from schema.prisma when possible.

DROP INDEX IF EXISTS "StoryPost_visibility_publicationStatus_createdAt_idx";
DROP INDEX IF EXISTS "StoryPost_visibility_createdAt_idx";

PRAGMA foreign_keys = OFF;
ALTER TABLE "StoryPost" DROP COLUMN "visibility";
PRAGMA foreign_keys = ON;

CREATE INDEX IF NOT EXISTS "StoryPost_publicationStatus_createdAt_idx" ON "StoryPost"("publicationStatus", "createdAt");
