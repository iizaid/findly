-- AlterTable
ALTER TABLE "DatasetImportRow" ADD COLUMN     "catalogLeadId" TEXT;

-- AlterTable
ALTER TABLE "LeadListLead" ADD COLUMN     "catalogLeadId" TEXT,
ALTER COLUMN "leadId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "LeadCatalog" (
    "id" TEXT NOT NULL,
    "datasetImportId" TEXT,
    "businessName" TEXT NOT NULL,
    "category" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "email" TEXT,
    "websiteUrl" TEXT,
    "websiteStatus" TEXT,
    "instagramUrl" TEXT,
    "instagramUsername" TEXT,
    "facebookUrl" TEXT,
    "googleMapsUrl" TEXT,
    "source" TEXT,
    "sourceId" TEXT,
    "sourceFile" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "normalizedFingerprint" TEXT,
    "rawData" JSONB,
    "detectedSignals" JSONB,
    "enrichmentData" JSONB,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadCatalog_datasetImportId_idx" ON "LeadCatalog"("datasetImportId");

-- CreateIndex
CREATE INDEX "LeadCatalog_source_idx" ON "LeadCatalog"("source");

-- CreateIndex
CREATE INDEX "LeadCatalog_sourceId_idx" ON "LeadCatalog"("sourceId");

-- CreateIndex
CREATE INDEX "LeadCatalog_sourceFile_idx" ON "LeadCatalog"("sourceFile");

-- CreateIndex
CREATE INDEX "LeadCatalog_instagramUsername_idx" ON "LeadCatalog"("instagramUsername");

-- CreateIndex
CREATE INDEX "LeadCatalog_normalizedFingerprint_idx" ON "LeadCatalog"("normalizedFingerprint");

-- CreateIndex
CREATE INDEX "LeadCatalog_category_idx" ON "LeadCatalog"("category");

-- CreateIndex
CREATE INDEX "LeadCatalog_city_idx" ON "LeadCatalog"("city");

-- CreateIndex
CREATE INDEX "LeadCatalog_country_idx" ON "LeadCatalog"("country");

-- CreateIndex
CREATE INDEX "LeadCatalog_country_city_idx" ON "LeadCatalog"("country", "city");

-- CreateIndex
CREATE INDEX "LeadCatalog_importedAt_idx" ON "LeadCatalog"("importedAt");

-- CreateIndex
CREATE INDEX "LeadCatalog_createdAt_idx" ON "LeadCatalog"("createdAt");

-- CreateIndex
CREATE INDEX "DatasetImportRow_catalogLeadId_idx" ON "DatasetImportRow"("catalogLeadId");

-- CreateIndex
CREATE INDEX "LeadListLead_catalogLeadId_idx" ON "LeadListLead"("catalogLeadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadListLead_leadListId_catalogLeadId_key" ON "LeadListLead"("leadListId", "catalogLeadId");

-- AddForeignKey
ALTER TABLE "LeadListLead" ADD CONSTRAINT "LeadListLead_catalogLeadId_fkey" FOREIGN KEY ("catalogLeadId") REFERENCES "LeadCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImportRow" ADD CONSTRAINT "DatasetImportRow_catalogLeadId_fkey" FOREIGN KEY ("catalogLeadId") REFERENCES "LeadCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCatalog" ADD CONSTRAINT "LeadCatalog_datasetImportId_fkey" FOREIGN KEY ("datasetImportId") REFERENCES "DatasetImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

