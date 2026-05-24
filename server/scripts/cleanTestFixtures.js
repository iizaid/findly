const BLOCKED_ENVIRONMENTS = new Set(['production', 'test']);
export const FIXTURE_PATTERNS = [
  '/^AI Cafe /i',
  '/^Lead A filter-test/i',
  '/\\bmpi[a-z0-9]{4,}\\b/i',
  '/\\bmpj[a-z0-9]{4,}\\b/i',
  'contains fixture markers: filter-test, concurrent, reuse, invalidai, admin manual lead',
];

const FIXTURE_TOKEN_REGEXES = [
  /^AI Cafe /i,
  /^Lead A filter-test/i,
  /\bmpi[a-z0-9]{4,}\b/i,
  /\bmpj[a-z0-9]{4,}\b/i,
];
const FIXTURE_CONTAINS_TERMS = ['filter-test', 'concurrent', 'reuse', 'invalidai', 'admin manual lead'];

const getPrisma = async () => {
  const { prisma } = await import('../src/db/prisma.js');
  return prisma;
};

export const parseCleanupArgs = (argv = process.argv.slice(2)) => ({
  dryRun: !argv.includes('--confirm'),
  confirm: argv.includes('--confirm'),
});

export const isFixtureShapedName = (value) => {
  const name = String(value || '').trim();
  if (!name) return false;
  if (FIXTURE_TOKEN_REGEXES.some((pattern) => pattern.test(name))) return true;

  const lowered = name.toLowerCase();
  return FIXTURE_CONTAINS_TERMS.some((term) => lowered.includes(term));
};

export const ensureDevelopmentOnly = () => {
  if (BLOCKED_ENVIRONMENTS.has(process.env.NODE_ENV)) {
    throw new Error('db:clean-test-fixtures is allowed only in development.');
  }
};

const collectFixtureMatches = async () => {
  const prisma = await getPrisma();
  const [leads, catalogLeads, campaigns, lists] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, businessName: true, campaignId: true } }),
    prisma.leadCatalog.findMany({ select: { id: true, businessName: true } }),
    prisma.searchCampaign.findMany({ select: { id: true, name: true } }),
    prisma.leadList.findMany({ select: { id: true, name: true, campaignId: true } }),
  ]);

  const leadMatches = leads.filter((item) => isFixtureShapedName(item.businessName));
  const catalogMatches = catalogLeads.filter((item) => isFixtureShapedName(item.businessName));
  const campaignMatches = campaigns.filter((item) => isFixtureShapedName(item.name));
  const listMatches = lists.filter((item) => isFixtureShapedName(item.name));

  return { leadMatches, catalogMatches, campaignMatches, listMatches };
};

const buildPreview = ({ leadMatches, catalogMatches, campaignMatches, listMatches }) => ({
  dryRun: true,
  matches: {
    leads: leadMatches.length,
    catalogLeads: catalogMatches.length,
    campaigns: campaignMatches.length,
    leadLists: listMatches.length,
  },
  sampleNames: {
    leads: leadMatches.slice(0, 5).map((item) => item.businessName),
    catalogLeads: catalogMatches.slice(0, 5).map((item) => item.businessName),
    campaigns: campaignMatches.slice(0, 5).map((item) => item.name),
    leadLists: listMatches.slice(0, 5).map((item) => item.name),
  },
});

export const runFixtureCleanup = async ({ dryRun = true } = {}) => {
  ensureDevelopmentOnly();
  const prisma = await getPrisma();

  const { leadMatches, catalogMatches, campaignMatches, listMatches } = await collectFixtureMatches();
  const preview = buildPreview({ leadMatches, catalogMatches, campaignMatches, listMatches });

  if (dryRun) {
    console.log(JSON.stringify(preview, null, 2));
    console.log('Dry run only. Re-run with --confirm to delete these fixture records.');
    return preview;
  }

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

  const finalReport = {
    dryRun: false,
    matches: preview.matches,
    sampleNames: preview.sampleNames,
    deleted: report,
  };
  console.log(JSON.stringify(finalReport, null, 2));
  return finalReport;
};

if ((process.argv[1] || '').replace(/\\/g, '/').endsWith('/cleanTestFixtures.js')) {
  const args = parseCleanupArgs();
  if (!args.confirm) {
    console.log('Refusing to delete fixture records without --confirm. Running in dry-run mode.');
  }
  let prisma;
  runFixtureCleanup({ dryRun: args.dryRun })
    .catch((error) => {
      console.error(error.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      prisma = await getPrisma().catch(() => null);
      await prisma?.$disconnect?.();
    });
}
