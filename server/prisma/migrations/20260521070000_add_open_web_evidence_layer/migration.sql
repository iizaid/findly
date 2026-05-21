-- CreateTable
CREATE TABLE "OpenWebEvidenceCache" (
    "id" TEXT NOT NULL,
    "normalizedDomain" TEXT NOT NULL,
    "normalizedUrl" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'common_crawl',
    "sourceType" TEXT NOT NULL DEFAULT 'OPEN_WEB_ARCHIVE',
    "indexId" TEXT,
    "captureTimestamp" TIMESTAMP(3),
    "evidenceHash" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "signals" JSONB NOT NULL,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenWebEvidenceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenWebEvidenceCache_provider_evidenceHash_key" ON "OpenWebEvidenceCache"("provider", "evidenceHash");

-- CreateIndex
CREATE INDEX "OpenWebEvidenceCache_normalizedDomain_expiresAt_idx" ON "OpenWebEvidenceCache"("normalizedDomain", "expiresAt");

-- CreateIndex
CREATE INDEX "OpenWebEvidenceCache_normalizedUrl_expiresAt_idx" ON "OpenWebEvidenceCache"("normalizedUrl", "expiresAt");

-- CreateIndex
CREATE INDEX "OpenWebEvidenceCache_confidenceScore_idx" ON "OpenWebEvidenceCache"("confidenceScore");
