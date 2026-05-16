import { AI_TASKS, ANALYSIS_SOURCE } from './ai.types.js';
import { buildLeadAnalysisPrompt } from './aiRequestBuilder.js';
import { runAiTask } from './aiRouter.service.js';

const clampScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const scoreLevelFromScore = (score) => {
  if (score > 75) return 'GOLD';
  if (score > 55) return 'HIGH';
  if (score > 30) return 'MEDIUM';
  return 'LOW';
};

const aiWeightForConfidence = (confidence) => {
  if (confidence === 'high') return 0.6;
  if (confidence === 'medium') return 0.5;
  return 0.3;
};

export const mergeRuleBasedAndAiAnalysis = ({ ruleBasedAnalysis, aiAnalysis }) => {
  if (!aiAnalysis) {
    return {
      ...ruleBasedAnalysis,
      analysisSource: ANALYSIS_SOURCE.RULE_BASED,
      aiDataQualityNotes: [],
      aiRiskNotes: [],
    };
  }

  const aiWeight = aiWeightForConfidence(aiAnalysis.confidence);
  const ruleWeight = 1 - aiWeight;
  const opportunityScore = clampScore(
    (ruleBasedAnalysis.opportunityScore * ruleWeight) + (aiAnalysis.aiOpportunityScore * aiWeight),
  );
  const fitScore = clampScore((ruleBasedAnalysis.fitScore * ruleWeight) + (aiAnalysis.aiFitScore * aiWeight));

  return {
    ...ruleBasedAnalysis,
    fitScore,
    opportunityScore,
    scoreLevel: scoreLevelFromScore(opportunityScore),
    suggestedService: aiAnalysis.bestServiceToOffer || ruleBasedAnalysis.suggestedService,
    outreachAngle: aiAnalysis.personalizedOutreachAngle || ruleBasedAnalysis.outreachAngle,
    messageDraft: aiAnalysis.messageDraft || ruleBasedAnalysis.messageDraft,
    confidence: aiAnalysis.confidence || ruleBasedAnalysis.confidence,
    nextBestAction: aiAnalysis.nextBestAction || ruleBasedAnalysis.nextBestAction,
    reasons: [
      ...(ruleBasedAnalysis.reasons || []),
      ...(aiAnalysis.whyThisLeadFits || []).map((reason) => `AI fit: ${reason}`),
      ...(aiAnalysis.whyThisLeadMayNotFit || []).map((reason) => `AI caution: ${reason}`),
    ].slice(0, 12),
    detectedSignals: [
      ...(ruleBasedAnalysis.detectedSignals || []),
      ...(aiAnalysis.detectedDigitalGaps || []).map((gap) => `AI_GAP:${gap}`),
    ].slice(0, 20),
    shouldContact: aiAnalysis.shouldContact,
    contactPriority: aiAnalysis.contactPriority,
    analysisSource: ANALYSIS_SOURCE.AI_ASSISTED,
    aiDataQualityNotes: aiAnalysis.dataQualityNotes || [],
    aiRiskNotes: aiAnalysis.riskNotes || [],
  };
};

export const runLeadAnalysisAiReview = async ({
  lead,
  profile,
  campaign = null,
  ruleBasedAnalysis,
  routerOptions = {},
} = {}) => {
  const { systemPrompt, userPrompt, input } = buildLeadAnalysisPrompt({
    lead,
    profile,
    campaign,
    ruleBasedAnalysis,
  });

  const result = await runAiTask({
    task: AI_TASKS.LEAD_ANALYSIS,
    systemPrompt,
    userPrompt,
    input,
    requireJson: true,
    ...routerOptions,
  });

  if (!result.ok) {
    return {
      analysis: {
        ...ruleBasedAnalysis,
        analysisSource: ANALYSIS_SOURCE.AI_FALLBACK,
      },
      aiResult: result,
    };
  }

  return {
    analysis: mergeRuleBasedAndAiAnalysis({ ruleBasedAnalysis, aiAnalysis: result.json }),
    aiResult: result,
  };
};
