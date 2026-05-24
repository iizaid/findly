import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { AppError, errorCodes } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import { ANALYSIS_CREDITS, deductCredits } from '../credits/credit.service.js';
import { buildRuleBasedAnalysisData, toLeadAnalysisCreateData } from './analysis.service.js';
import { runLeadAnalysisAiReview } from '../ai/leadAnalysisAi.service.js';

export const LEAD_LIST_ANALYSIS_JOB_TYPE = 'LEAD_LIST_ANALYSIS_RUN';

const defaultProfile = { serviceType: 'Digital Presence Improvement' };

const nowIso = () => new Date().toISOString();

const toJobSummary = ({
  totalAnalyzed = 0,
  aiAssistedCount = 0,
  ruleBasedCount = 0,
  failedCount = 0,
  creditsUsed = 0,
  highQualityCount = 0,
  mediumQualityCount = 0,
  lowQualityCount = 0,
  outreachReadyCount = 0,
  needsMoreEvidenceCount = 0,
  skippedExistingCount = 0,
  topOpportunities = [],
} = {}) => ({
  totalAnalyzed,
  aiAssistedCount,
  ruleBasedCount,
  failedCount,
  creditsUsed,
  highQualityCount,
  mediumQualityCount,
  lowQualityCount,
  outreachReadyCount,
  needsMoreEvidenceCount,
  skippedExistingCount,
  topOpportunities,
});

const analysisMetaFromFilters = (filters = {}) => {
  const analysis = filters?.analysis;
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return {};
  return analysis;
};

const mergeLeadListAnalysisFilters = (filters = {}, patch = {}) => ({
  ...(filters || {}),
  analysis: {
    ...analysisMetaFromFilters(filters),
    ...patch,
  },
});

const inferAnalysisMetadata = (analysisData = {}, aiResult = null) => ({
  analysisSource: analysisData.analysisSource || 'RULE_BASED',
  aiProvider: analysisData.aiProvider || (aiResult?.ok ? aiResult.provider : null),
  aiModel: analysisData.aiModel || (aiResult?.ok ? aiResult.model : null),
  aiErrorType: aiResult && !aiResult.ok ? aiResult.errorType || null : null,
});

const enrichAnalysisDataForPersistence = ({ analysisData, aiResult }) => {
  const persistedSource = (analysisData.analysisSource || 'RULE_BASED') === 'AI_FALLBACK'
    ? 'RULE_BASED'
    : (analysisData.analysisSource || 'RULE_BASED');
  const detectedFindings = [
    ...(analysisData.detectedSignals || []),
    `ANALYSIS_SOURCE_${persistedSource}`,
  ];

  if (aiResult?.ok && aiResult.provider) {
    detectedFindings.push(`AI_PROVIDER_${String(aiResult.provider).toUpperCase()}`);
  }

  const reasons = [...(analysisData.reasons || [])];
  if (analysisData.aiDataQualityNotes?.length) {
    reasons.push(...analysisData.aiDataQualityNotes.map((note) => `Data quality: ${note}`));
  }
  if (analysisData.aiRiskNotes?.length) {
    reasons.push(...analysisData.aiRiskNotes.map((note) => `Risk note: ${note}`));
  }

  return {
    ...analysisData,
    analysisSource: analysisData.analysisSource || persistedSource,
    aiProvider: aiResult?.ok ? aiResult.provider : (analysisData.aiProvider || null),
    aiModel: aiResult?.ok ? aiResult.model : (analysisData.aiModel || null),
    detectedSignals: [...new Set(detectedFindings)].slice(0, 24),
    reasons: reasons.slice(0, 18),
  };
};

const buildTopOpportunity = (analysis, metadata = {}) => ({
  id: analysis.id,
  leadListLeadId: analysis.leadListLeadId,
  score: analysis.opportunityScore,
  level: analysis.scoreLevel,
  service: analysis.suggestedService,
  analysisSource: metadata.analysisSource || 'RULE_BASED',
});

const isOutreachReady = (analysisData = {}) => (
  analysisData.dataQualityLevel === 'HIGH'
  || analysisData.nextBestAction === 'Send outreach message'
  || analysisData.nextBestAction === 'Prepare personalized pitch'
);

const summarizeLeadListJob = ({
  analyses = [],
  failedCount = 0,
  creditsUsed = 0,
  skippedExistingCount = 0,
} = {}) => {
  const summary = toJobSummary({
    totalAnalyzed: analyses.length,
    failedCount,
    creditsUsed,
    skippedExistingCount,
  });

  for (const item of analyses) {
    if (item.analysisSource === 'AI_ASSISTED') summary.aiAssistedCount += 1;
    else summary.ruleBasedCount += 1;

    if (item.dataQualityLevel === 'HIGH') summary.highQualityCount += 1;
    else if (item.dataQualityLevel === 'MEDIUM') summary.mediumQualityCount += 1;
    else summary.lowQualityCount += 1;

    if (isOutreachReady(item)) summary.outreachReadyCount += 1;
    else summary.needsMoreEvidenceCount += 1;
  }

  summary.topOpportunities = analyses
    .slice()
    .sort((left, right) => (right.opportunityScore || 0) - (left.opportunityScore || 0))
    .slice(0, 3)
    .map((item) => buildTopOpportunity(item, item));

  return summary;
};

const buildJobSnapshot = ({ job, leadList = null, analyzedLeadCount = 0, totalLeadCount = 0 }) => {
  const summary = job?.payload?.summary || leadList?.filters?.analysis?.summary || null;
  const progressCurrent = job?.payload?.progressCurrent ?? leadList?.filters?.analysis?.progressCurrent ?? 0;
  const progressTotal = job?.payload?.progressTotal ?? leadList?.filters?.analysis?.progressTotal ?? totalLeadCount;
  const status = job?.status || leadList?.filters?.analysis?.status || 'NOT_ANALYZED';
  const startedAt = job?.startedAt || leadList?.filters?.analysis?.startedAt || null;
  const completedAt = job?.completedAt || leadList?.filters?.analysis?.completedAt || null;
  const errorMessage = job?.errorMessage || leadList?.filters?.analysis?.errorMessage || null;

  let listStatus = 'NOT_ANALYZED';
  if (status === 'RUNNING' || status === 'QUEUED') listStatus = 'ANALYSIS_RUNNING';
  else if (status === 'FAILED' || status === 'CANCELLED') listStatus = 'ANALYSIS_FAILED';
  else if (summary && analyzedLeadCount >= totalLeadCount && totalLeadCount > 0) listStatus = 'ANALYSIS_COMPLETE';
  else if (summary && analyzedLeadCount > 0) listStatus = 'NEEDS_REANALYSIS';

  return {
    jobId: job?.id || leadList?.filters?.analysis?.jobId || null,
    status,
    progressCurrent,
    progressTotal,
    startedAt,
    completedAt,
    errorMessage,
    summary,
    leadListId: leadList?.id || job?.payload?.leadListId || null,
    analyzedLeadCount,
    totalLeadCount,
    listStatus,
    updatedAt: job?.updatedAt || leadList?.filters?.analysis?.updatedAt || null,
  };
};

const getLeadListWithCounts = async ({ listId, userId }) => {
  const leadList = await prisma.leadList.findFirst({
    where: { id: listId, userId },
    include: {
      campaign: {
        include: {
          serviceProfile: true,
        },
      },
      _count: {
        select: { leadItems: true },
      },
    },
  });

  if (!leadList) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);
  }

  const analyzedLeadCount = await prisma.leadListLead.count({
    where: {
      leadListId: listId,
      OR: [
        { analysisStatus: 'COMPLETED' },
        { analyses: { some: {} } },
      ],
    },
  });

  return {
    leadList,
    analyzedLeadCount,
    totalLeadCount: leadList._count?.leadItems || 0,
  };
};

export const getLeadListAnalysisJob = async ({ listId, jobId = null, userId }) => {
  let leadListData = null;
  if (listId) {
    leadListData = await getLeadListWithCounts({ listId, userId });
  }

  const resolvedJobId = jobId
    || leadListData?.leadList?.filters?.analysis?.jobId
    || null;

  const job = resolvedJobId
    ? await prisma.job.findFirst({
      where: {
        id: resolvedJobId,
        userId,
        type: LEAD_LIST_ANALYSIS_JOB_TYPE,
      },
    })
    : null;

  if (!job && !leadListData) {
    throw new AppError(errorCodes.NOT_FOUND, 'Analysis job not found.', 404);
  }

  return buildJobSnapshot({
    job,
    leadList: leadListData?.leadList || null,
    analyzedLeadCount: leadListData?.analyzedLeadCount || 0,
    totalLeadCount: leadListData?.totalLeadCount || 0,
  });
};

export const startLeadListAnalysisJob = async ({ listId, userId }) => {
  const { leadList, analyzedLeadCount, totalLeadCount } = await getLeadListWithCounts({ listId, userId });
  const existingJobId = analysisMetaFromFilters(leadList.filters).jobId || null;

  if (existingJobId) {
    const existingJob = await prisma.job.findFirst({
      where: {
        id: existingJobId,
        userId,
        type: LEAD_LIST_ANALYSIS_JOB_TYPE,
      },
    });

    if (existingJob && ['QUEUED', 'RUNNING'].includes(existingJob.status)) {
      return {
        reused: true,
        job: buildJobSnapshot({
          job: existingJob,
          leadList,
          analyzedLeadCount,
          totalLeadCount,
        }),
      };
    }
  }

  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.job.create({
      data: {
        userId,
        workspaceId: leadList.workspaceId,
        campaignId: leadList.campaignId,
        type: LEAD_LIST_ANALYSIS_JOB_TYPE,
        maxAttempts: 1,
        payload: {
          leadListId: leadList.id,
          progressCurrent: 0,
          progressTotal: totalLeadCount,
          summary: leadList.filters?.analysis?.summary || null,
        },
      },
    });

    await tx.leadList.update({
      where: { id: leadList.id },
      data: {
        filters: mergeLeadListAnalysisFilters(leadList.filters, {
          jobId: createdJob.id,
          status: 'QUEUED',
          progressCurrent: 0,
          progressTotal: totalLeadCount,
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          updatedAt: nowIso(),
          summary: leadList.filters?.analysis?.summary || null,
        }),
      },
    });

    return createdJob;
  });

  return {
    reused: false,
    job: buildJobSnapshot({
      job,
      leadList,
      analyzedLeadCount,
      totalLeadCount,
    }),
  };
};

const persistAnalysisJobState = async ({
  tx,
  leadList,
  jobId,
  status,
  progressCurrent,
  progressTotal,
  summary = null,
  errorMessage = null,
  startedAt = null,
  completedAt = null,
}) => {
  const nextPayload = {
    ...(await tx.job.findUnique({ where: { id: jobId }, select: { payload: true } }))?.payload,
    leadListId: leadList.id,
    progressCurrent,
    progressTotal,
    summary,
  };

  await tx.job.update({
    where: { id: jobId },
    data: {
      payload: nextPayload,
      ...(status === 'COMPLETED' ? {
        status: 'COMPLETED',
        completedAt: completedAt || new Date(),
        lockedAt: null,
        lockedBy: null,
        lastHeartbeatAt: null,
        errorCode: null,
        errorMessage: null,
      } : {}),
      ...(status === 'FAILED' ? {
        status: 'FAILED',
        failedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastHeartbeatAt: null,
        errorCode: errorCodes.INTERNAL_ERROR,
        errorMessage: errorMessage || 'Lead list analysis job failed.',
      } : {}),
    },
  });

  await tx.leadList.update({
    where: { id: leadList.id },
    data: {
      filters: mergeLeadListAnalysisFilters(leadList.filters, {
        jobId,
        status,
        progressCurrent,
        progressTotal,
        startedAt: startedAt ? startedAt.toISOString() : leadList.filters?.analysis?.startedAt || null,
        completedAt: completedAt ? completedAt.toISOString() : null,
        errorMessage,
        updatedAt: nowIso(),
        summary,
      }),
    },
  });
};

export const processLeadListAnalysisJob = async ({ jobId }) => {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
  });

  if (!job || job.type !== LEAD_LIST_ANALYSIS_JOB_TYPE) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead list analysis job not found.', 404);
  }

  const leadListId = job.payload?.leadListId;
  if (!leadListId) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Lead list analysis job is missing a lead list id.', 400);
  }

  const leadList = await prisma.leadList.findFirst({
    where: { id: leadListId, userId: job.userId },
    include: {
      campaign: {
        include: { serviceProfile: true },
      },
    },
  });

  if (!leadList) {
    throw new AppError(errorCodes.NOT_FOUND, 'Lead list not found.', 404);
  }

  const items = await prisma.leadListLead.findMany({
    where: { leadListId },
    include: {
      lead: true,
      catalogLead: true,
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: [{ rank: 'asc' }, { createdAt: 'asc' }],
    take: 500,
  });

  const progressTotal = items.length;
  const startedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await persistAnalysisJobState({
      tx,
      leadList,
      jobId,
      status: 'RUNNING',
      progressCurrent: 0,
      progressTotal,
      startedAt,
      summary: leadList.filters?.analysis?.summary || null,
    });
  });

  const profile = leadList.campaign?.serviceProfile || defaultProfile;
  const analyses = [];
  let failedCount = 0;
  let skippedExistingCount = 0;
  let creditsUsed = 0;
  const concurrency = Math.max(1, Math.min(Number(env.AI_ANALYSIS_CONCURRENCY) || 2, 5));

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    const chunkResults = await Promise.all(chunk.map(async (item) => {
      const sourceLead = item.lead || item.catalogLead;
      if (!sourceLead) {
        return { status: 'failed' };
      }

      if (item.analyses.length > 0 || item.analysisStatus === 'COMPLETED') {
        return { status: 'skipped' };
      }

      try {
        const ruleBasedAnalysis = buildRuleBasedAnalysisData({ lead: sourceLead, profile });
        const aiReview = await runLeadAnalysisAiReview({
          lead: sourceLead,
          profile,
          campaign: leadList.campaign,
          ruleBasedAnalysis,
        });
        const finalAnalysisData = enrichAnalysisDataForPersistence({
          analysisData: aiReview.analysis,
          aiResult: aiReview.aiResult,
        });
        const metadata = inferAnalysisMetadata(finalAnalysisData, aiReview.aiResult);

        const result = await prisma.$transaction(async (tx) => {
          const currentItem = await tx.leadListLead.findFirst({
            where: { id: item.id, leadListId },
            include: { analyses: { select: { id: true } } },
          });

          if (!currentItem || currentItem.analyses.length > 0 || currentItem.analysisStatus === 'COMPLETED') {
            return { status: 'skipped' };
          }

          await deductCredits({
            tx,
            userId: job.userId,
            workspaceId: leadList.workspaceId,
            amount: ANALYSIS_CREDITS,
            type: 'CREDIT_USED',
            reason: `Analyzed list item in batch: ${sourceLead.businessName}`,
            referenceType: 'LeadListLead',
            referenceId: item.id,
          });

          const analysis = await tx.leadAnalysis.create({
            data: toLeadAnalysisCreateData({
              lead: sourceLead,
              analysisData: finalAnalysisData,
              userId: job.userId,
              workspaceId: leadList.workspaceId,
              campaignId: leadList.campaignId,
              leadListLeadId: item.id,
            }),
          });

          await tx.leadListLead.update({
            where: { id: item.id },
            data: {
              analysisStatus: 'COMPLETED',
              analyzedAt: new Date(),
              score: analysis.opportunityScore,
              metadata: {
                ...(item.metadata || {}),
                analysisSource: metadata.analysisSource,
                dataQualityLevel: finalAnalysisData.dataQualityLevel,
                outreachReady: isOutreachReady(finalAnalysisData),
              },
            },
          });

          return {
            status: 'analyzed',
            analysis: {
              ...analysis,
              ...metadata,
              dataQualityLevel: finalAnalysisData.dataQualityLevel,
              nextBestAction: finalAnalysisData.nextBestAction,
            },
          };
        });

        return result;
      } catch (error) {
        logger.warn('lead_list_analysis.item_failed', {
          jobId,
          leadListId,
          itemId: item.id,
          errorCode: error instanceof AppError ? error.code : errorCodes.INTERNAL_ERROR,
        });
        return { status: 'failed' };
      }
    }));

    for (const result of chunkResults) {
      if (result.status === 'skipped') {
        skippedExistingCount += 1;
      } else if (result.status === 'failed') {
        failedCount += 1;
      } else if (result.status === 'analyzed') {
        analyses.push(result.analysis);
        creditsUsed += ANALYSIS_CREDITS;
      }
    }

    const summary = summarizeLeadListJob({
      analyses,
      failedCount,
      creditsUsed,
      skippedExistingCount,
    });

    await prisma.$transaction(async (tx) => {
      await persistAnalysisJobState({
        tx,
        leadList,
        jobId,
        status: 'RUNNING',
        progressCurrent: Math.min(index + chunk.length, progressTotal),
        progressTotal,
        startedAt,
        summary,
      });
    });
  }

  const completedAt = new Date();
  const summary = summarizeLeadListJob({
    analyses,
    failedCount,
    creditsUsed,
    skippedExistingCount,
  });

  await prisma.$transaction(async (tx) => {
    await persistAnalysisJobState({
      tx,
      leadList,
      jobId,
      status: 'COMPLETED',
      progressCurrent: progressTotal,
      progressTotal,
      startedAt,
      completedAt,
      summary,
    });

    await tx.auditLog.create({
      data: {
        userId: job.userId,
        action: 'LEAD_LIST_ANALYSIS_JOB_COMPLETED',
        entityType: 'LeadList',
        entityId: leadList.id,
        metadata: {
          workspaceId: leadList.workspaceId,
          jobId,
          ...summary,
        },
      },
    });
  });

  return buildJobSnapshot({
    job: await prisma.job.findUnique({ where: { id: jobId } }),
    leadList: await prisma.leadList.findUnique({ where: { id: leadList.id } }),
    analyzedLeadCount: await prisma.leadListLead.count({
      where: {
        leadListId: leadList.id,
        OR: [{ analysisStatus: 'COMPLETED' }, { analyses: { some: {} } }],
      },
    }),
    totalLeadCount: progressTotal,
  });
};
