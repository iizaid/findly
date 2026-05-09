ALTER TABLE "SearchCampaign"
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockedBy" TEXT;

ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "websiteStatus" TEXT;

CREATE INDEX IF NOT EXISTS "SearchCampaign_lockedAt_idx" ON "SearchCampaign"("lockedAt");
CREATE INDEX IF NOT EXISTS "Lead_websiteStatus_idx" ON "Lead"("websiteStatus");
