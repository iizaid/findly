-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "enrichmentData" JSONB,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LeadAnalysis" ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "nextBestAction" TEXT;
