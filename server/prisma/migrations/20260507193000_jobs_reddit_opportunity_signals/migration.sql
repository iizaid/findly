ALTER TYPE "SearchSource" ADD VALUE IF NOT EXISTS 'REDDIT';

DO $$ BEGIN
  CREATE TYPE "JobType" AS ENUM ('SEARCH_CAMPAIGN_RUN', 'CAMPAIGN_ANALYSIS_RUN', 'WEBSITE_ENRICHMENT_RUN', 'EXPORT_RUN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "type" "JobType" NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Job" ADD CONSTRAINT "Job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "Job" ADD CONSTRAINT "Job_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Job_userId_idx" ON "Job"("userId");
CREATE INDEX IF NOT EXISTS "Job_workspaceId_idx" ON "Job"("workspaceId");
CREATE INDEX IF NOT EXISTS "Job_campaignId_idx" ON "Job"("campaignId");
CREATE INDEX IF NOT EXISTS "Job_type_status_createdAt_idx" ON "Job"("type", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Job_status_lockedAt_idx" ON "Job"("status", "lockedAt");

CREATE TABLE IF NOT EXISTS "OpportunitySignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "campaignId" TEXT,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "title" TEXT NOT NULL,
  "snippet" TEXT,
  "authorHash" TEXT,
  "subreddit" TEXT,
  "postedAt" TIMESTAMP(3),
  "score" INTEGER,
  "commentCount" INTEGER,
  "matchedKeywords" JSONB,
  "detectedIntent" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpportunitySignal_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "OpportunitySignal" ADD CONSTRAINT "OpportunitySignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OpportunitySignal" ADD CONSTRAINT "OpportunitySignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OpportunitySignal" ADD CONSTRAINT "OpportunitySignal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "OpportunitySignal_userId_idx" ON "OpportunitySignal"("userId");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_workspaceId_idx" ON "OpportunitySignal"("workspaceId");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_campaignId_idx" ON "OpportunitySignal"("campaignId");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_source_idx" ON "OpportunitySignal"("source");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_sourceId_idx" ON "OpportunitySignal"("sourceId");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_subreddit_idx" ON "OpportunitySignal"("subreddit");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_detectedIntent_idx" ON "OpportunitySignal"("detectedIntent");
CREATE INDEX IF NOT EXISTS "OpportunitySignal_createdAt_idx" ON "OpportunitySignal"("createdAt");

DO $$ BEGIN
  ALTER TABLE "OpportunitySignal" ADD CONSTRAINT "OpportunitySignal_workspaceId_source_sourceId_key" UNIQUE ("workspaceId", "source", "sourceId");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
