-- Prevent duplicate analyses for the same direct lead or lead-list item.
-- PostgreSQL unique indexes allow multiple NULL values, so this still permits
-- analyses that target either a Lead or a LeadListLead while enforcing one
-- reusable analysis per concrete target.
CREATE UNIQUE INDEX "LeadAnalysis_leadId_key" ON "LeadAnalysis"("leadId");
CREATE UNIQUE INDEX "LeadAnalysis_leadListLeadId_key" ON "LeadAnalysis"("leadListLeadId");
