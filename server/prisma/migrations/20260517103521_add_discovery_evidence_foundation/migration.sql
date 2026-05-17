-- CreateTable
CREATE TABLE "DiscoveryQuery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "seedQuery" TEXT,
    "expandedQuery" TEXT NOT NULL,
    "locale" TEXT,
    "geography" TEXT,
    "targetSources" JSONB,
    "discoveryMethod" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "costUnits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT,
    "catalogLeadId" TEXT,
    "discoveryQueryId" TEXT,
    "targetSource" TEXT NOT NULL,
    "discoveryMethod" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "externalId" TEXT,
    "title" TEXT,
    "snippetHash" TEXT,
    "extractedFields" JSONB,
    "rawMetadata" JSONB,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "attributionRequired" BOOLEAN NOT NULL DEFAULT false,
    "robotsStatus" TEXT,
    "storeUntil" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "campaignId" TEXT,
    "leadId" TEXT,
    "catalogLeadId" TEXT,
    "evidenceId" TEXT,
    "validator" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "rationale" TEXT,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "campaignId" TEXT,
    "leadId" TEXT,
    "catalogLeadId" TEXT,
    "evidenceId" TEXT,
    "provider" TEXT NOT NULL,
    "requestedFields" JSONB,
    "returnedFields" JSONB,
    "marginalCostMicrousd" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrichmentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscoveryQuery_userId_idx" ON "DiscoveryQuery"("userId");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_workspaceId_idx" ON "DiscoveryQuery"("workspaceId");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_campaignId_idx" ON "DiscoveryQuery"("campaignId");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_adapter_idx" ON "DiscoveryQuery"("adapter");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_discoveryMethod_idx" ON "DiscoveryQuery"("discoveryMethod");

-- CreateIndex
CREATE INDEX "DiscoveryQuery_createdAt_idx" ON "DiscoveryQuery"("createdAt");

-- CreateIndex
CREATE INDEX "LeadEvidence_userId_idx" ON "LeadEvidence"("userId");

-- CreateIndex
CREATE INDEX "LeadEvidence_workspaceId_idx" ON "LeadEvidence"("workspaceId");

-- CreateIndex
CREATE INDEX "LeadEvidence_campaignId_idx" ON "LeadEvidence"("campaignId");

-- CreateIndex
CREATE INDEX "LeadEvidence_leadId_idx" ON "LeadEvidence"("leadId");

-- CreateIndex
CREATE INDEX "LeadEvidence_catalogLeadId_idx" ON "LeadEvidence"("catalogLeadId");

-- CreateIndex
CREATE INDEX "LeadEvidence_discoveryQueryId_idx" ON "LeadEvidence"("discoveryQueryId");

-- CreateIndex
CREATE INDEX "LeadEvidence_targetSource_idx" ON "LeadEvidence"("targetSource");

-- CreateIndex
CREATE INDEX "LeadEvidence_discoveryMethod_idx" ON "LeadEvidence"("discoveryMethod");

-- CreateIndex
CREATE INDEX "LeadEvidence_sourceType_idx" ON "LeadEvidence"("sourceType");

-- CreateIndex
CREATE INDEX "LeadEvidence_externalId_idx" ON "LeadEvidence"("externalId");

-- CreateIndex
CREATE INDEX "LeadEvidence_confidenceScore_idx" ON "LeadEvidence"("confidenceScore");

-- CreateIndex
CREATE INDEX "LeadEvidence_observedAt_idx" ON "LeadEvidence"("observedAt");

-- CreateIndex
CREATE INDEX "LeadEvidence_storeUntil_idx" ON "LeadEvidence"("storeUntil");

-- CreateIndex
CREATE INDEX "ValidationEvent_userId_idx" ON "ValidationEvent"("userId");

-- CreateIndex
CREATE INDEX "ValidationEvent_workspaceId_idx" ON "ValidationEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "ValidationEvent_campaignId_idx" ON "ValidationEvent"("campaignId");

-- CreateIndex
CREATE INDEX "ValidationEvent_leadId_idx" ON "ValidationEvent"("leadId");

-- CreateIndex
CREATE INDEX "ValidationEvent_catalogLeadId_idx" ON "ValidationEvent"("catalogLeadId");

-- CreateIndex
CREATE INDEX "ValidationEvent_evidenceId_idx" ON "ValidationEvent"("evidenceId");

-- CreateIndex
CREATE INDEX "ValidationEvent_validator_idx" ON "ValidationEvent"("validator");

-- CreateIndex
CREATE INDEX "ValidationEvent_result_idx" ON "ValidationEvent"("result");

-- CreateIndex
CREATE INDEX "ValidationEvent_createdAt_idx" ON "ValidationEvent"("createdAt");

-- CreateIndex
CREATE INDEX "EnrichmentRun_userId_idx" ON "EnrichmentRun"("userId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_workspaceId_idx" ON "EnrichmentRun"("workspaceId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_campaignId_idx" ON "EnrichmentRun"("campaignId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_leadId_idx" ON "EnrichmentRun"("leadId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_catalogLeadId_idx" ON "EnrichmentRun"("catalogLeadId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_evidenceId_idx" ON "EnrichmentRun"("evidenceId");

-- CreateIndex
CREATE INDEX "EnrichmentRun_provider_idx" ON "EnrichmentRun"("provider");

-- CreateIndex
CREATE INDEX "EnrichmentRun_status_idx" ON "EnrichmentRun"("status");

-- CreateIndex
CREATE INDEX "EnrichmentRun_createdAt_idx" ON "EnrichmentRun"("createdAt");

-- AddForeignKey
ALTER TABLE "DiscoveryQuery" ADD CONSTRAINT "DiscoveryQuery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuery" ADD CONSTRAINT "DiscoveryQuery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveryQuery" ADD CONSTRAINT "DiscoveryQuery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_catalogLeadId_fkey" FOREIGN KEY ("catalogLeadId") REFERENCES "LeadCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvidence" ADD CONSTRAINT "LeadEvidence_discoveryQueryId_fkey" FOREIGN KEY ("discoveryQueryId") REFERENCES "DiscoveryQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_catalogLeadId_fkey" FOREIGN KEY ("catalogLeadId") REFERENCES "LeadCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationEvent" ADD CONSTRAINT "ValidationEvent_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "LeadEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_catalogLeadId_fkey" FOREIGN KEY ("catalogLeadId") REFERENCES "LeadCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRun" ADD CONSTRAINT "EnrichmentRun_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "LeadEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
