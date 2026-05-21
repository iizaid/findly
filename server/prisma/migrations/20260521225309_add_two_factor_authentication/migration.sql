-- CreateTable
CREATE TABLE "UserTwoFactorSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "secretEncrypted" TEXT,
    "secretEncryptionMeta" JSONB,
    "pendingSecretEncrypted" TEXT,
    "pendingSecretMeta" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "backupCodesHash" JSONB,
    "backupCodesGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTwoFactorSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LOGIN',
    "remember" BOOLEAN NOT NULL DEFAULT true,
    "returnTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTwoFactorSetting_userId_key" ON "UserTwoFactorSetting"("userId");

-- CreateIndex
CREATE INDEX "UserTwoFactorSetting_enabled_idx" ON "UserTwoFactorSetting"("enabled");

-- CreateIndex
CREATE INDEX "UserTwoFactorSetting_confirmedAt_idx" ON "UserTwoFactorSetting"("confirmedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TwoFactorChallenge_tokenHash_key" ON "TwoFactorChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_userId_expiresAt_idx" ON "TwoFactorChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "TwoFactorChallenge_consumedAt_idx" ON "TwoFactorChallenge"("consumedAt");

-- AddForeignKey
ALTER TABLE "UserTwoFactorSetting" ADD CONSTRAINT "UserTwoFactorSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorChallenge" ADD CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
