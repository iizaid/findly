/*
  Warnings:

  - You are about to drop the column `businessType` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `whatsappNumber` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the `SearchJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'REVIEWED';
ALTER TYPE "LeadStatus" ADD VALUE 'INTERESTED';
ALTER TYPE "LeadStatus" ADD VALUE 'NOT_A_FIT';

-- DropForeignKey
ALTER TABLE "SearchJob" DROP CONSTRAINT "SearchJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "SearchJob" DROP CONSTRAINT "SearchJob_workspaceId_fkey";

-- DropIndex
DROP INDEX "Lead_businessType_idx";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "businessType",
DROP COLUMN "whatsappNumber",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "detectedSignals" JSONB,
ADD COLUMN     "leadListId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "reviewCount" INTEGER,
ADD COLUMN     "sourceId" TEXT,
ALTER COLUMN "country" DROP NOT NULL,
ALTER COLUMN "city" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeadAnalysis" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "fitScore" INTEGER,
ADD COLUMN     "messageDraft" TEXT;

-- DropTable
DROP TABLE "SearchJob";

-- DropEnum
DROP TYPE "SearchJobStatus";

-- CreateTable
CREATE TABLE "ServiceProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "targetBusinessTypes" JSONB,
    "targetLocations" JSONB,
    "offerDescription" TEXT,
    "idealSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serviceProfileId" TEXT,
    "name" TEXT NOT NULL,
    "query" TEXT,
    "country" TEXT,
    "city" TEXT,
    "businessTypes" JSONB,
    "sources" JSONB,
    "filters" JSONB,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedLimit" INTEGER NOT NULL DEFAULT 50,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "creditsReserved" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SearchCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceProfile_userId_idx" ON "ServiceProfile"("userId");

-- CreateIndex
CREATE INDEX "ServiceProfile_workspaceId_idx" ON "ServiceProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "SearchCampaign_userId_idx" ON "SearchCampaign"("userId");

-- CreateIndex
CREATE INDEX "SearchCampaign_workspaceId_idx" ON "SearchCampaign"("workspaceId");

-- CreateIndex
CREATE INDEX "SearchCampaign_status_idx" ON "SearchCampaign"("status");

-- CreateIndex
CREATE INDEX "SearchCampaign_createdAt_idx" ON "SearchCampaign"("createdAt");

-- CreateIndex
CREATE INDEX "LeadList_userId_idx" ON "LeadList"("userId");

-- CreateIndex
CREATE INDEX "LeadList_workspaceId_idx" ON "LeadList"("workspaceId");

-- CreateIndex
CREATE INDEX "Lead_category_idx" ON "Lead"("category");

-- AddForeignKey
ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceProfile" ADD CONSTRAINT "ServiceProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaign" ADD CONSTRAINT "SearchCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaign" ADD CONSTRAINT "SearchCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaign" ADD CONSTRAINT "SearchCampaign_serviceProfileId_fkey" FOREIGN KEY ("serviceProfileId") REFERENCES "ServiceProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAnalysis" ADD CONSTRAINT "LeadAnalysis_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
