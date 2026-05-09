-- CreateEnum
CREATE TYPE "DatasetImportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DatasetImportRowStatus" AS ENUM ('IMPORTED', 'SKIPPED', 'DUPLICATE', 'ERROR');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "datasetImportId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "importedAt" TIMESTAMP(3),
ADD COLUMN     "instagramUsername" TEXT,
ADD COLUMN     "normalizedFingerprint" TEXT,
ADD COLUMN     "sourceFile" TEXT,
ADD COLUMN     "whatsappNumber" TEXT;

-- CreateTable
CREATE TABLE "DatasetImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT,
    "sourceType" TEXT NOT NULL,
    "status" "DatasetImportStatus" NOT NULL DEFAULT 'RUNNING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB,
    "summary" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatasetImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatasetImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sheetName" TEXT,
    "status" "DatasetImportRowStatus" NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "errorMessage" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatasetImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetImport_userId_idx" ON "DatasetImport"("userId");

-- CreateIndex
CREATE INDEX "DatasetImport_workspaceId_idx" ON "DatasetImport"("workspaceId");

-- CreateIndex
CREATE INDEX "DatasetImport_sourceType_idx" ON "DatasetImport"("sourceType");

-- CreateIndex
CREATE INDEX "DatasetImport_status_idx" ON "DatasetImport"("status");

-- CreateIndex
CREATE INDEX "DatasetImport_createdAt_idx" ON "DatasetImport"("createdAt");

-- CreateIndex
CREATE INDEX "DatasetImportRow_importId_idx" ON "DatasetImportRow"("importId");

-- CreateIndex
CREATE INDEX "DatasetImportRow_leadId_idx" ON "DatasetImportRow"("leadId");

-- CreateIndex
CREATE INDEX "DatasetImportRow_status_idx" ON "DatasetImportRow"("status");

-- CreateIndex
CREATE INDEX "Lead_datasetImportId_idx" ON "Lead"("datasetImportId");

-- CreateIndex
CREATE INDEX "Lead_sourceFile_idx" ON "Lead"("sourceFile");

-- CreateIndex
CREATE INDEX "Lead_instagramUsername_idx" ON "Lead"("instagramUsername");

-- CreateIndex
CREATE INDEX "Lead_normalizedFingerprint_idx" ON "Lead"("normalizedFingerprint");

-- CreateIndex
CREATE INDEX "Lead_importedAt_idx" ON "Lead"("importedAt");

-- AddForeignKey
ALTER TABLE "DatasetImport" ADD CONSTRAINT "DatasetImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImport" ADD CONSTRAINT "DatasetImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImportRow" ADD CONSTRAINT "DatasetImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "DatasetImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetImportRow" ADD CONSTRAINT "DatasetImportRow_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_datasetImportId_fkey" FOREIGN KEY ("datasetImportId") REFERENCES "DatasetImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
