-- AlterTable
ALTER TABLE "LeadList" ADD COLUMN     "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filters" JSONB,
ADD COLUMN     "resultCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchMode" TEXT,
ADD COLUMN     "sourceRequested" TEXT,
ADD COLUMN     "sourceUsed" TEXT;

-- CreateTable
CREATE TABLE "LeadListLead" (
    "id" TEXT NOT NULL,
    "leadListId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadListLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadListLead_leadListId_idx" ON "LeadListLead"("leadListId");

-- CreateIndex
CREATE INDEX "LeadListLead_leadId_idx" ON "LeadListLead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadListLead_leadListId_leadId_key" ON "LeadListLead"("leadListId", "leadId");

-- CreateIndex
CREATE INDEX "LeadList_sourceUsed_idx" ON "LeadList"("sourceUsed");

-- CreateIndex
CREATE INDEX "LeadList_createdAt_idx" ON "LeadList"("createdAt");

-- AddForeignKey
ALTER TABLE "LeadListLead" ADD CONSTRAINT "LeadListLead_leadListId_fkey" FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadListLead" ADD CONSTRAINT "LeadListLead_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
