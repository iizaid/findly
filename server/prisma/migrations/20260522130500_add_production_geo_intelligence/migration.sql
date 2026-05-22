CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'GEO_ENRICHMENT_RUN';

ALTER TABLE "LeadCatalog"
  ADD COLUMN "geoPoint" geography(Point,4326),
  ADD COLUMN "geoStatus" TEXT NOT NULL DEFAULT 'NOT_RESOLVED',
  ADD COLUMN "geoSource" TEXT,
  ADD COLUMN "geoProvider" TEXT,
  ADD COLUMN "geoConfidence" INTEGER,
  ADD COLUMN "geoAccuracy" TEXT,
  ADD COLUMN "geoAddressNormalized" TEXT,
  ADD COLUMN "geoResolvedAt" TIMESTAMP(3),
  ADD COLUMN "geoFailedAt" TIMESTAMP(3),
  ADD COLUMN "geoFailureReason" TEXT,
  ADD COLUMN "geoUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Lead"
  ADD COLUMN "geoPoint" geography(Point,4326),
  ADD COLUMN "geoStatus" TEXT NOT NULL DEFAULT 'NOT_RESOLVED',
  ADD COLUMN "geoSource" TEXT,
  ADD COLUMN "geoProvider" TEXT,
  ADD COLUMN "geoConfidence" INTEGER,
  ADD COLUMN "geoAccuracy" TEXT,
  ADD COLUMN "geoAddressNormalized" TEXT,
  ADD COLUMN "geoResolvedAt" TIMESTAMP(3),
  ADD COLUMN "geoFailedAt" TIMESTAMP(3),
  ADD COLUMN "geoFailureReason" TEXT,
  ADD COLUMN "geoUpdatedAt" TIMESTAMP(3);

CREATE TABLE "GeoLocationCache" (
  "id" TEXT NOT NULL,
  "normalizedQuery" TEXT NOT NULL,
  "normalizedCountry" TEXT,
  "normalizedCity" TEXT,
  "provider" TEXT NOT NULL,
  "providerPlaceId" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "geoPoint" geography(Point,4326),
  "confidence" INTEGER NOT NULL DEFAULT 0,
  "accuracy" TEXT NOT NULL,
  "resultType" TEXT,
  "normalizedAddress" TEXT,
  "sourceHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeoLocationCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeoLocationCache_provider_sourceHash_key" ON "GeoLocationCache"("provider", "sourceHash");
CREATE INDEX "GeoLocationCache_normalizedQuery_idx" ON "GeoLocationCache"("normalizedQuery");
CREATE INDEX "GeoLocationCache_provider_confidence_idx" ON "GeoLocationCache"("provider", "confidence");
CREATE INDEX "GeoLocationCache_expiresAt_idx" ON "GeoLocationCache"("expiresAt");

CREATE INDEX "LeadCatalog_geoStatus_idx" ON "LeadCatalog"("geoStatus");
CREATE INDEX "LeadCatalog_geoConfidence_idx" ON "LeadCatalog"("geoConfidence");
CREATE INDEX "LeadCatalog_geoResolvedAt_idx" ON "LeadCatalog"("geoResolvedAt");

CREATE INDEX "Lead_geoStatus_idx" ON "Lead"("geoStatus");
CREATE INDEX "Lead_geoConfidence_idx" ON "Lead"("geoConfidence");
CREATE INDEX "Lead_geoResolvedAt_idx" ON "Lead"("geoResolvedAt");

CREATE INDEX "LeadCatalog_geoPoint_gist_idx" ON "LeadCatalog" USING GIST ("geoPoint");
CREATE INDEX "Lead_geoPoint_gist_idx" ON "Lead" USING GIST ("geoPoint");
CREATE INDEX "GeoLocationCache_geoPoint_gist_idx" ON "GeoLocationCache" USING GIST ("geoPoint");
