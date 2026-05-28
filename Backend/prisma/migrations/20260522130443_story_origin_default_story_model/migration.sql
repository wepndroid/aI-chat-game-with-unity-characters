-- CreateEnum
CREATE TYPE "StoryOrigin" AS ENUM ('OFFICIAL', 'COMMUNITY');

-- Add canonical story metadata and direct session character ownership.
ALTER TABLE "StoryPost" ADD COLUMN "origin" "StoryOrigin" NOT NULL DEFAULT 'COMMUNITY';
ALTER TABLE "Character" ADD COLUMN "defaultStoryId" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "characterId" TEXT;

-- Backfill direct session character ownership from the legacy card relation.
UPDATE "ChatSession" AS session
SET "characterId" = card."characterId"
FROM "CharacterCard" AS card
WHERE session."characterCardId" = card."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ChatSession" WHERE "characterId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot migrate ChatSession.characterId: at least one session has no matching CharacterCard.';
  END IF;
END $$;

ALTER TABLE "ChatSession" ALTER COLUMN "characterId" SET NOT NULL;

-- Initial origin snapshot uses the best available historical proxy: current author role.
UPDATE "StoryPost" AS story
SET "origin" = 'OFFICIAL'
FROM "User" AS author
WHERE story."authorId" = author."id"
  AND author."role" = 'ADMIN';

-- CreateIndex
CREATE INDEX "Character_defaultStoryId_idx" ON "Character"("defaultStoryId");

-- CreateIndex
CREATE INDEX "ChatSession_characterId_idx" ON "ChatSession"("characterId");

-- CreateIndex
CREATE INDEX "StoryPost_origin_publicationStatus_moderationStatus_idx" ON "StoryPost"("origin", "publicationStatus", "moderationStatus");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_defaultStoryId_fkey" FOREIGN KEY ("defaultStoryId") REFERENCES "StoryPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy card relation after all sessions own characterId directly.
DROP INDEX "ChatSession_characterCardId_idx";
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_characterCardId_fkey";
ALTER TABLE "ChatSession" DROP COLUMN "characterCardId";

DROP TABLE "CharacterCard";
