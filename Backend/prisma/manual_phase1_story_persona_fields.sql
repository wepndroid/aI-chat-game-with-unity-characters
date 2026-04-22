-- Phase-1 Story API compatibility fields.
-- SQLite additive migration.

ALTER TABLE "StoryPost" ADD COLUMN "promptDescription" TEXT;
ALTER TABLE "StoryPost" ADD COLUMN "personality" TEXT;
ALTER TABLE "StoryPost" ADD COLUMN "scenario" TEXT;
ALTER TABLE "StoryPost" ADD COLUMN "firstMessage" TEXT;
ALTER TABLE "StoryPost" ADD COLUMN "exampleDialogs" TEXT;

-- Backfill best-effort aliases from existing split columns.
UPDATE "StoryPost"
SET
  "promptDescription" = COALESCE("promptDescription", "scenarioStory"),
  "scenario" = COALESCE("scenario", "scenarioChat")
WHERE 1 = 1;
