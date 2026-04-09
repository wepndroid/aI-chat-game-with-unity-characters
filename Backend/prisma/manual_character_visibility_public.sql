-- Optional one-time: all characters are public in the product model; backfill legacy rows.
-- Run against your DB after deploying (Postgres / SQLite syntax may differ).

UPDATE "Character" SET "visibility" = 'PUBLIC' WHERE "visibility" IS NULL OR "visibility" <> 'PUBLIC';
