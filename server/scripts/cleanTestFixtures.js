import { prisma } from '../src/db/prisma.js';

const BLOCKED_ENVIRONMENTS = new Set(['production', 'test']);
export const FIXTURE_PATTERNS = [
  'filter-test',
  'concurrent',
  'reuse',
  'invalidai',
  'Admin Manual Lead',
  'Lead A',
  'AI Cafe',
  'mpi',
  'mpj',
];

const containsAnyPattern = (field) => ({
  OR: FIXTURE_PATTERNS.map((pattern) => ({
    [field]: {
      contains: pattern,
      mode: 'insensitive',
    },
  })),
});

export const ensureDevelopmentOnly = () => {
  if (BLOCKED_ENVIRONMENTS.has(process.env.NODE_ENV)) {
    throw new Error('db:clean-test-fixtures is allowed only in development.');
  }
};

export const runFixtureCleanup = async () => {
  ensureDevelopmentOnly();

  const leadMatches = await prisma.lead.findMany({
    where: containsAnyPattern('businessName'),
    select: { id: true, campaignId: true },
  });
  const catalogMatches = await prisma.leadCatalog.findMany({
    where: containsAnyPattern('businessName'),
    select: { id: true },
  });
  const campaignMatches = await prisma.searchCampaign.findMany({
    where: containsAnyPattern('name'),
    select: { id: true },
  });
  const listMatches = await prisma.leadList.findMany({
    where: containsAnyPattern('name'),
    select: { id: true, campaignId: true },
  });

  const campaignIds = [...new Set([
    ...leadMatches.map((item) => item.campaignId).filter(Boolean),
    ...campaignMatches.map((item) => item.id),
    ...listMatches.map((item) => item.campaignId).filter(Boolean),
  ])];
  const listIds = [...new Set(listMatches.map((item) => item.id))];
  const leadIds = [...new Set(leadMatches.map((item) => item.id))];
  const catalogLeadIds = [...new Set(catalogMatches.map((item) => item.id))];

  const listItemIds = (await prisma.leadListLead.findMany({
    where: {
      OR: [
        { leadListId: { in: listIds } },
        { leadId: { in: leadIds } },
        { catalogLeadId: { in: catalogLeadIds } },
      ],
    },
    select: { id: true },
  })).map((item) => item.id);

  const report = await prisma.$transaction(async (tx) => {
    const deletedLeadAnalyses = await tx.leadAnalysis.deleteMany({
      where: {
        OR: [
          { leadId: { in: leadIds } },
          { leadListLeadId: { in: listItemIds } },
          { campaignId: { in: campaignIds } },
        ],
      },
    });

    const deletedOpportunitySignals = await tx.opportunitySignal.deleteMany({
      where: { campaignId: { in: campaignIds } },
    }).catch(() => ({ count: 0 }));

    const deletedLeadEvidence = await tx.leadEvidence.deleteMany({
      where: {
        OR: [
          { campaignId: { in: campaignIds } },
          { catalogLeadId: { in: catalogLeadIds } },
          { title: { contains: 'AI Cafe', mode: 'insensitive' } },
          { title: { contains: 'filter-test', mode: 'insensitive' } },
        ],
      },
    }).catch(() => ({ count: 0 }));

    const deletedDiscoveryQueries = await tx.discoveryQuery.deleteMany({
      where: { campaignId: { in: campaignIds } },
    }).catch(() => ({ count: 0 }));
    const deletedCreditReservations = await tx.creditReservation.deleteMany({
      where: { campaignId: { in: campaignIds } },
    }).catch(() => ({ count: 0 }));
    const deletedCreditLedger = await tx.creditLedger.deleteMany({
      where: {
        OR: [
          { referenceType: 'SearchCampaign', referenceId: { in: campaignIds } },
          { referenceType: 'LeadListLead', referenceId: { in: listItemIds } },
          { referenceType: 'Lead', referenceId: { in: leadIds } },
        ],
      },
    }).catch(() => ({ count: 0 }));
    const deletedAuditLogs = await tx.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'SearchCampaign', entityId: { in: campaignIds } },
          { entityType: 'LeadList', entityId: { in: listIds } },
          { entityType: 'LeadListLead', entityId: { in: listItemIds } },
          { entityType: 'Lead', entityId: { in: leadIds } },
        ],
      },
    }).catch(() => ({ count: 0 }));

    const deletedJobs = await tx.job.deleteMany({
      where: {
        campaignId: { in: campaignIds },
      },
    });

    const deletedListItems = await tx.leadListLead.deleteMany({
      where: { id: { in: listItemIds } },
    });
    const deletedLists = await tx.leadList.deleteMany({
      where: { id: { in: listIds } },
    });
    const deletedLeads = await tx.lead.deleteMany({
      where: { id: { in: leadIds } },
    });
    const deletedCatalogLeads = await tx.leadCatalog.deleteMany({
      where: { id: { in: catalogLeadIds } },
    });
    const deletedCampaigns = await tx.searchCampaign.deleteMany({
      where: { id: { in: campaignIds } },
    });

    return {
      deletedLeadAnalyses: deletedLeadAnalyses.count,
      deletedOpportunitySignals: deletedOpportunitySignals.count,
      deletedLeadEvidence: deletedLeadEvidence.count,
      deletedDiscoveryQueries: deletedDiscoveryQueries.count,
      deletedCreditReservations: deletedCreditReservations.count,
      deletedCreditLedger: deletedCreditLedger.count,
      deletedAuditLogs: deletedAuditLogs.count,
      deletedJobs: deletedJobs.count,
      deletedListItems: deletedListItems.count,
      deletedLists: deletedLists.count,
      deletedLeads: deletedLeads.count,
      deletedCatalogLeads: deletedCatalogLeads.count,
      deletedCampaigns: deletedCampaigns.count,
    };
  });

  console.log(JSON.stringify(report, null, 2));
};

if ((process.argv[1] || '').replace(/\\/g, '/').endsWith('/cleanTestFixtures.js')) {
  runFixtureCleanup()
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
