import { prisma } from '../../db/prisma.js';

export const getDashboardSummary = async (userId, workspaceId) => {
  const [
    totalCampaigns,
    totalOwnedLeads,
    totalSnapshotLeads,
    analyzedLeads,
    goldLeads,
    highLeads,
    recentCampaigns,
    recentLeads,
    creditBalance,
    creditsUsedThisMonth,
  ] = await Promise.all([
    prisma.searchCampaign.count({ where: { userId, workspaceId } }),
    prisma.lead.count({ where: { userId, workspaceId } }),
    prisma.leadListLead.count({ where: { leadList: { userId, workspaceId } } }),
    prisma.leadAnalysis.count({ where: { userId, workspaceId } }),
    prisma.leadAnalysis.count({ where: { userId, workspaceId, scoreLevel: 'GOLD' } }),
    prisma.leadAnalysis.count({ where: { userId, workspaceId, scoreLevel: 'HIGH' } }),
    prisma.searchCampaign.findMany({
      where: { userId, workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, status: true, resultCount: true, creditsUsed: true, createdAt: true, completedAt: true },
    }),
    prisma.leadListLead.findMany({
      where: { leadList: { userId, workspaceId } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        lead: {
          select: { id: true, businessName: true, category: true, city: true, source: true, rating: true, status: true, createdAt: true },
        },
        catalogLead: {
          select: { id: true, businessName: true, category: true, city: true, source: true, rating: true, createdAt: true },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { creditsBalance: true } }),
    prisma.creditLedger.aggregate({
      where: {
        userId,
        type: 'CREDIT_USED',
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalCampaigns,
    totalLeads: totalOwnedLeads + totalSnapshotLeads,
    analyzedLeads,
    goldOpportunities: goldLeads,
    highOpportunities: highLeads,
    creditsBalance: creditBalance?.creditsBalance || 0,
    creditsUsedThisMonth: creditsUsedThisMonth._sum.amount || 0,
    recentCampaigns,
    recentLeads: recentLeads
      .map((item) => item.lead || (item.catalogLead ? { ...item.catalogLead, status: 'NEW', catalogLeadId: item.catalogLead.id } : null))
      .filter(Boolean),
  };
};

export const getCampaignAnalytics = async (campaignId, userId) => {
  const campaign = await prisma.searchCampaign.findFirst({
    where: { id: campaignId, userId },
    select: { id: true, name: true, status: true, resultCount: true, creditsUsed: true, city: true, country: true, createdAt: true, completedAt: true },
  });

  if (!campaign) return null;

  const [scoreDistribution, signalCounts, sourceCounts, cityCounts, categoryCounts, statusCounts, topLeads] = await Promise.all([
    prisma.leadAnalysis.groupBy({
      by: ['scoreLevel'],
      where: { campaignId, userId },
      _count: true,
    }),
    prisma.lead.findMany({
      where: { campaignId, userId },
      select: { detectedSignals: true },
    }),
    prisma.lead.groupBy({
      by: ['source'],
      where: { campaignId, userId },
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['city'],
      where: { campaignId, userId },
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['category'],
      where: { campaignId, userId },
      _count: true,
    }),
    prisma.lead.groupBy({
      by: ['status'],
      where: { campaignId, userId },
      _count: true,
    }),
    prisma.lead.findMany({
      where: { campaignId, userId },
      include: { analyses: { orderBy: { opportunityScore: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  // Aggregate signal counts
  const signalMap = {};
  for (const lead of signalCounts) {
    const signals = Array.isArray(lead.detectedSignals) ? lead.detectedSignals : [];
    for (const sig of signals) {
      signalMap[sig] = (signalMap[sig] || 0) + 1;
    }
  }

  // Sort top leads by score
  const sortedTopLeads = topLeads
    .filter((l) => l.analyses.length > 0)
    .sort((a, b) => (b.analyses[0]?.opportunityScore || 0) - (a.analyses[0]?.opportunityScore || 0))
    .slice(0, 10);

  return {
    campaign,
    scoreDistribution: scoreDistribution.map((d) => ({ level: d.scoreLevel, count: d._count })),
    signalBreakdown: Object.entries(signalMap).map(([signal, count]) => ({ signal, count })).sort((a, b) => b.count - a.count),
    sourceBreakdown: sourceCounts.map((s) => ({ source: s.source, count: s._count })),
    cityBreakdown: cityCounts.map((c) => ({ city: c.city, count: c._count })),
    categoryBreakdown: categoryCounts.filter((c) => c.category).map((c) => ({ category: c.category, count: c._count })),
    statusBreakdown: statusCounts.map((s) => ({ status: s.status, count: s._count })),
    topLeads: sortedTopLeads,
  };
};
