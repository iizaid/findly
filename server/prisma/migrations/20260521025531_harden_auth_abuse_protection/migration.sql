-- CreateTable
CREATE TABLE "AuthAbuseCounter" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AuthAbuseCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthAbuseEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "keyHash" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAbuseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthAbuseCounter_action_expiresAt_idx" ON "AuthAbuseCounter"("action", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthAbuseCounter_bucket_expiresAt_idx" ON "AuthAbuseCounter"("bucket", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthAbuseCounter_bucket_keyHash_action_key" ON "AuthAbuseCounter"("bucket", "keyHash", "action");

-- CreateIndex
CREATE INDEX "AuthAbuseEvent_action_createdAt_idx" ON "AuthAbuseEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAbuseEvent_outcome_createdAt_idx" ON "AuthAbuseEvent"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAbuseEvent_userId_idx" ON "AuthAbuseEvent"("userId");

-- AddForeignKey
ALTER TABLE "AuthAbuseEvent" ADD CONSTRAINT "AuthAbuseEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
