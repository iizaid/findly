-- CreateIndex
CREATE INDEX "Lead_businessType_idx" ON "Lead"("businessType");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_country_idx" ON "Lead"("country");

-- CreateIndex
CREATE INDEX "Lead_userId_workspaceId_status_idx" ON "Lead"("userId", "workspaceId", "status");

-- CreateIndex
CREATE INDEX "SearchJob_source_idx" ON "SearchJob"("source");

-- CreateIndex
CREATE INDEX "SearchJob_userId_workspaceId_status_idx" ON "SearchJob"("userId", "workspaceId", "status");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_expiresAt_idx" ON "Session"("userId", "revokedAt", "expiresAt");
