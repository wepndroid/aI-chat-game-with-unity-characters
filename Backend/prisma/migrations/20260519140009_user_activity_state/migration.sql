-- CreateTable
CREATE TABLE "UserActivityState" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserActivityState_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "UserActivityState_lastSeenAt_idx" ON "UserActivityState"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "UserActivityState" ADD CONSTRAINT "UserActivityState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
