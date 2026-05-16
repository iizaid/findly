const INTERNAL_SOURCE_LABELS = new Set([
  'LOCAL_DATASET',
  'DATASET_IMPORT',
  'MANUAL_ADMIN',
  'INSTAGRAM_DATASET',
  'GOOGLE_MAPS_DATASET',
  'CSV',
]);

const pickDefined = (input) => Object.fromEntries(
  Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
);

const safeSourceLabel = (source) => {
  if (!source) return undefined;
  if (INTERNAL_SOURCE_LABELS.has(source)) return 'Online business source';
  return source.toString().replace(/_/g, ' ').toLowerCase();
};

export const sanitizeLeadForAi = (lead = {}) => pickDefined({
  businessName: lead.businessName,
  category: lead.category,
  country: lead.country,
  city: lead.city,
  address: lead.address,
  websiteUrl: lead.websiteUrl,
  instagramUrl: lead.instagramUrl,
  instagramUsername: lead.instagramUsername,
  facebookUrl: lead.facebookUrl,
  googleMapsUrl: lead.googleMapsUrl,
  phone: lead.phone,
  whatsappNumber: lead.whatsappNumber,
  email: lead.email,
  rating: lead.rating,
  reviewCount: lead.reviewCount,
  source: safeSourceLabel(lead.source),
  existingDetectedSignals: Array.isArray(lead.detectedSignals) ? lead.detectedSignals.slice(0, 12) : [],
});

export const sanitizeProfileForAi = (profile = {}) => pickDefined({
  serviceType: profile.serviceType,
  offerDescription: profile.offerDescription,
  targetBusinessTypes: profile.targetBusinessTypes,
  targetLocations: profile.targetLocations,
  idealSignals: profile.idealSignals,
});

export const sanitizeRuleBasedAnalysisForAi = (analysis = {}) => pickDefined({
  fitScore: analysis.fitScore,
  opportunityScore: analysis.opportunityScore,
  scoreLevel: analysis.scoreLevel,
  detectedSignals: Array.isArray(analysis.detectedSignals) ? analysis.detectedSignals.slice(0, 12) : [],
  reasons: Array.isArray(analysis.reasons) ? analysis.reasons.slice(0, 8) : [],
  suggestedService: analysis.suggestedService,
  outreachAngle: analysis.outreachAngle,
  confidence: analysis.confidence,
  nextBestAction: analysis.nextBestAction,
});

export const buildLeadAnalysisPrompt = ({ lead, profile, campaign = null, ruleBasedAnalysis = null } = {}) => {
  const input = {
    userService: sanitizeProfileForAi(profile),
    campaign: campaign ? pickDefined({
      searchGoal: campaign.searchGoal,
      query: campaign.query,
      country: campaign.country,
      city: campaign.city,
      businessType: campaign.businessType,
    }) : undefined,
    lead: sanitizeLeadForAi(lead),
    ruleBasedAnalysis: ruleBasedAnalysis ? sanitizeRuleBasedAnalysisForAi(ruleBasedAnalysis) : undefined,
  };

  const systemPrompt = [
    'You are Findly lead analysis infrastructure.',
    'Analyze whether the business is worth contacting for the user service.',
    'Do not invent facts, URLs, phone numbers, ratings, social accounts, prices, or claims.',
    'If data is missing, say it is missing in notes.',
    'Do not over-score weak service-to-business matches.',
    'Return JSON only and match the requested schema exactly.',
  ].join(' ');

  const userPrompt = [
    'Given what the user sells, decide if this business is worth contacting.',
    'Explain why, what should be offered first, and what outreach message should be sent.',
    JSON.stringify(input),
  ].join('\n\n');

  return { systemPrompt, userPrompt, input };
};
