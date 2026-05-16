-- CreateTable
CREATE TABLE "AiProviderSecret" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "model" TEXT,
    "baseUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastErrorType" TEXT,

    CONSTRAINT "AiProviderSecret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiProviderSecret_provider_key" ON "AiProviderSecret"("provider");

-- CreateIndex
CREATE INDEX "AiProviderSecret_status_idx" ON "AiProviderSecret"("status");

-- CreateIndex
CREATE INDEX "AiProviderSecret_updatedAt_idx" ON "AiProviderSecret"("updatedAt");
