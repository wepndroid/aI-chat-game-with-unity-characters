-- Optional one-shot after migrations add StoryPublicationStatus / publishedAt:
-- Backfill publishedAt for rows that are already published (helps "newest" ordering on the feed).
UPDATE "StoryPost"
SET "publishedAt" = "createdAt"
WHERE "publicationStatus" = 'PUBLISHED' AND "publishedAt" IS NULL;
