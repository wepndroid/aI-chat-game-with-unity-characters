-- Phase-1 strict migration: make ChatSession.storyId required and story-linked.
-- PostgreSQL manual variant.

-- 1) Backfill any legacy null story links using the first story for the same character.
WITH preferred_story AS (
  SELECT DISTINCT ON (sp."characterId")
    sp."characterId",
    sp."id" AS "storyId"
  FROM "StoryPost" sp
  ORDER BY
    sp."characterId",
    CASE
      WHEN sp."publicationStatus" = 'PUBLISHED' AND sp."moderationStatus" = 'APPROVED' THEN 0
      ELSE 1
    END,
    COALESCE(sp."publishedAt", sp."createdAt") ASC
)
UPDATE "ChatSession" cs
SET "storyId" = ps."storyId"
FROM preferred_story ps
JOIN "CharacterCard" cc ON cc."id" = cs."characterCardId"
WHERE cs."storyId" IS NULL
  AND cc."characterId" = ps."characterId";

-- 2) Enforce non-null + cascade relation.
ALTER TABLE "ChatSession" ALTER COLUMN "storyId" SET NOT NULL;
ALTER TABLE "ChatSession" DROP CONSTRAINT IF EXISTS "ChatSession_storyId_fkey";
ALTER TABLE "ChatSession"
  ADD CONSTRAINT "ChatSession_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "StoryPost"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
