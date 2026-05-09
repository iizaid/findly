-- Advanced backend hardening fields for database-backed campaign job state.
ALTER TABLE "SearchCampaign"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "errorCode" TEXT,
  ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "progressCurrent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "progressTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastStep" TEXT;

-- Lookup and ownership indexes for scalable campaigns, lists, leads, and analyses.
CREATE INDEX IF NOT EXISTS "SearchCampaign_workspaceId_status_createdAt_idx"
  ON "SearchCampaign"("workspaceId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "LeadList_campaignId_idx"
  ON "LeadList"("campaignId");

CREATE INDEX IF NOT EXISTS "Lead_leadListId_idx"
  ON "Lead"("leadListId");

CREATE INDEX IF NOT EXISTS "Lead_campaignId_idx"
  ON "Lead"("campaignId");

CREATE INDEX IF NOT EXISTS "Lead_source_idx"
  ON "Lead"("source");

CREATE INDEX IF NOT EXISTS "Lead_sourceId_idx"
  ON "Lead"("sourceId");

CREATE INDEX IF NOT EXISTS "Lead_workspaceId_source_sourceId_idx"
  ON "Lead"("workspaceId", "source", "sourceId");

CREATE INDEX IF NOT EXISTS "LeadAnalysis_campaignId_idx"
  ON "LeadAnalysis"("campaignId");
