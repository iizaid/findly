-- CreateTable
CREATE TABLE "DiscoveryProviderSecret" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keyFingerprint" TEXT NOT NULL,
    "baseUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "role" TEXT NOT NULL DEFAULT 'SEARCH_METADATA',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isPrimaryCandidate" BOOLEAN NOT NULL DEFAULT false,
    "isFallbackCandidate" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastErrorType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,

    CONSTRAINT "DiscoveryProviderSecret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryProviderSecret_provider_key" ON "DiscoveryProviderSecret"("provider");

-- CreateIndex
CREATE INDEX "DiscoveryProviderSecret_provider_idx" ON "DiscoveryProviderSecret"("provider");

-- CreateIndex
CREATE INDEX "DiscoveryProviderSecret_status_idx" ON "DiscoveryProviderSecret"("status");

-- CreateIndex
CREATE INDEX "DiscoveryProviderSecret_role_idx" ON "DiscoveryProviderSecret"("role");

-- CreateIndex
CREATE INDEX "DiscoveryProviderSecret_priority_idx" ON "DiscoveryProviderSecret"("priority");

-- CreateIndex
CREATE INDEX "DiscoveryProviderSecret_updatedAt_idx" ON "DiscoveryProviderSecret"("updatedAt");

-- AddForeignKey
ALTER TABLE "DiscoveryProviderSecret" ADD CONSTRAINT "DiscoveryProviderSecret_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryProviderSecret" ADD CONSTRAINT "DiscoveryProviderSecret_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
