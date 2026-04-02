CREATE TABLE IF NOT EXISTS "FailedLoginAttempt" (
  "ipAddress" TEXT NOT NULL PRIMARY KEY,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartAt" DATETIME NOT NULL,
  "lockUntil" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "FailedLoginAttempt_lockUntil_idx" ON "FailedLoginAttempt"("lockUntil");
CREATE INDEX IF NOT EXISTS "FailedLoginAttempt_windowStartAt_idx" ON "FailedLoginAttempt"("windowStartAt");
