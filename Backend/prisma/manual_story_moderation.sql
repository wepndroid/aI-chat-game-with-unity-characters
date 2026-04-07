-- Story moderation (approve / reject). Run after `prisma db push` or apply manually for SQLite.

-- New columns (if not using Prisma migrate)
ALTER TABLE "StoryPost" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "StoryPost" ADD COLUMN "moderationRejectReason" TEXT;

UPDATE "StoryPost"
SET "moderationStatus" = 'APPROVED'
WHERE "publicationStatus" = 'PUBLISHED';

UPDATE "StoryPost"
SET "moderationStatus" = 'NONE'
WHERE "publicationStatus" = 'DRAFT';

CREATE INDEX IF NOT EXISTS "StoryPost_moderationStatus_publicationStatus_idx" ON "StoryPost"("moderationStatus", "publicationStatus");
