-- AlterTable
ALTER TABLE "LeadAnalysis" ADD COLUMN     "leadListLeadId" TEXT,
ALTER COLUMN "leadId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LeadListLead" ADD COLUMN     "analysisStatus" TEXT,
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userTags" JSONB;

-- CreateIndex
CREATE INDEX "LeadAnalysis_leadListLeadId_idx" ON "LeadAnalysis"("leadListLeadId");

-- CreateIndex
CREATE INDEX "LeadListLead_status_idx" ON "LeadListLead"("status");

-- CreateIndex
CREATE INDEX "LeadListLead_updatedAt_idx" ON "LeadListLead"("updatedAt");

-- CreateIndex
CREATE INDEX "LeadListLead_analyzedAt_idx" ON "LeadListLead"("analyzedAt");

-- AddForeignKey
ALTER TABLE "LeadAnalysis" ADD CONSTRAINT "LeadAnalysis_leadListLeadId_fkey" FOREIGN KEY ("leadListLeadId") REFERENCES "LeadListLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
