/**
 * Enhanced rule-based analysis engine for Findly.
 * Produces fitScore, opportunityScore, signals, reasons, suggested service,
 * outreach angle, message draft, confidence, and nextBestAction.
 */

const SERVICE_MATCH_MAP = {
  'Website Development': ['NO_WEBSITE', 'WEBSITE_MISSING_FOR_VISUAL_BUSINESS'],
  'Website Redesign': ['HAS_WEBSITE', 'WEBSITE_PRESENT_BUT_WEAK_SIGNAL'],
  'Digital Menu': ['FOOD_BUSINESS', 'NEEDS_DIGITAL_MENU_POSSIBLE'],
  'Booking System': ['SERVICE_BUSINESS', 'NEEDS_BOOKING_POSSIBLE'],
  'E-commerce Catalog': ['LOCAL_BUSINESS', 'HAS_WEBSITE'],
  'Automation': ['HIGH_REVIEW_COUNT', 'STRONG_LOCAL_PRESENCE'],
  'Lead Capture System': ['HAS_WEBSITE', 'HIGH_RATING'],
  'Digital Presence Improvement': ['NO_WEBSITE', 'LOW_REVIEW_COUNT'],
  'SEO': ['HAS_WEBSITE', 'LOW_REVIEW_COUNT'],
  'Social Media Management': ['LOCAL_BUSINESS', 'FOOD_BUSINESS'],
};

const VISUAL_CATEGORIES = ['restaurant', 'cafe', 'bakery', 'salon', 'spa', 'hotel', 'gym', 'fitness', 'yoga', 'photography', 'florist', 'gallery', 'boutique', 'fashion'];
const SERVICE_CATEGORIES = ['clinic', 'dental', 'doctor', 'lawyer', 'accounting', 'consulting', 'cleaning', 'plumbing', 'repair', 'tutoring', 'therapy', 'massage'];
const FOOD_CATEGORIES = ['restaurant', 'cafe', 'bakery', 'coffee', 'pizza', 'burger', 'food', 'kitchen', 'catering', 'bar', 'grill', 'sushi', 'shawarma', 'falafel'];
const BOOKING_CATEGORIES = ['salon', 'spa', 'clinic', 'dental', 'doctor', 'gym', 'fitness', 'yoga', 'therapy', 'massage', 'hotel'];

export const normalizeLeadForAnalysis = (input) => {
  return {
    businessName: input.businessName,
    category: input.category,
    country: input.country,
    city: input.city,
    address: input.address,
    websiteUrl: input.websiteUrl,
    instagramUrl: input.instagramUrl,
    instagramUsername: input.instagramUsername,
    facebookUrl: input.facebookUrl,
    googleMapsUrl: input.googleMapsUrl,
    phone: input.phone,
    whatsappNumber: input.whatsappNumber,
    email: input.email,
    rating: input.rating,
    reviewCount: input.reviewCount,
    detectedSignals: input.detectedSignals || [],
    rawData: input.rawData,
    source: input.source,
  };
};

export const buildRuleBasedAnalysisData = ({ lead, profile }) => {
  let opportunityScore = 0;
  let fitScore = 0;
  let dataQualityScore = 0;
  let contactabilityScore = 0;
  let digitalGapScore = 0;
  let businessQualityScore = 0;
  let urgencyScore = 0;

  const detectedSignals = [];
  const reasons = [];

  const normalizedLead = normalizeLeadForAnalysis(lead);
  const categoryStr = (normalizedLead.category || '').toLowerCase();
  const serviceType = (profile?.serviceType || '').toLowerCase();

  // ═══════════════════════════════════════
  // SIGNAL DETECTION & DIMENSION SCORING
  // ═══════════════════════════════════════

  // Data Quality & Contactability
  if (normalizedLead.businessName) dataQualityScore += 20;
  if (normalizedLead.address) dataQualityScore += 10;
  if (normalizedLead.category) dataQualityScore += 10;

  if (normalizedLead.phone) {
    detectedSignals.push('HAS_PHONE');
    detectedSignals.push('CONTACT_AVAILABLE');
    detectedSignals.push('OUTREACH_READY');
    contactabilityScore += 50;
    dataQualityScore += 20;
    reasons.push('Direct phone number available — outreach is possible.');
  }

  if (normalizedLead.email) {
    detectedSignals.push('HAS_EMAIL');
    contactabilityScore += 30;
    dataQualityScore += 10;
  }

  if (normalizedLead.instagramUrl || normalizedLead.facebookUrl) {
    detectedSignals.push('HAS_SOCIAL');
    contactabilityScore += 20;
    dataQualityScore += 10;
  }

  // Business Quality
  if (normalizedLead.rating != null) {
    detectedSignals.push('HAS_GOOGLE_RATING');
    if (normalizedLead.rating >= 4.2) {
      detectedSignals.push('HIGH_RATING');
      businessQualityScore += 40;
      reasons.push(`Strong reputation with ${normalizedLead.rating}★ rating — established business worth serving.`);
    } else if (normalizedLead.rating >= 3.0) {
      businessQualityScore += 20;
      reasons.push(`Moderate ${normalizedLead.rating}★ rating — business may benefit from reputation improvement.`);
    } else {
      businessQualityScore += 5; // Real business, just poor rating
    }
  }

  if (normalizedLead.reviewCount != null) {
    if (normalizedLead.reviewCount >= 100) {
      detectedSignals.push('HIGH_REVIEW_COUNT');
      detectedSignals.push('STRONG_LOCAL_PRESENCE');
      businessQualityScore += 60;
      reasons.push(`${normalizedLead.reviewCount} reviews indicate a well-established area business.`);
    } else if (normalizedLead.reviewCount >= 30) {
      detectedSignals.push('HIGH_REVIEW_COUNT');
      businessQualityScore += 40;
      reasons.push(`${normalizedLead.reviewCount} reviews — active customer base.`);
    } else if (normalizedLead.reviewCount < 10) {
      detectedSignals.push('LOW_REVIEW_COUNT');
      businessQualityScore += 10;
    }
  }

  // Digital Gap & Opportunity
  if (!normalizedLead.websiteUrl) {
    detectedSignals.push('NO_WEBSITE');
    digitalGapScore += 70;
    opportunityScore += 30;
    urgencyScore += 20;
    reasons.push('No website listed — strong opportunity for web development services.');

    if (VISUAL_CATEGORIES.some((c) => categoryStr.includes(c))) {
      detectedSignals.push('WEBSITE_MISSING_FOR_VISUAL_BUSINESS');
      digitalGapScore += 20;
      opportunityScore += 15;
      urgencyScore += 20;
      reasons.push('Visual business without a website — high-impact opportunity.');
    }
  } else {
    detectedSignals.push('HAS_WEBSITE');
    opportunityScore += 5;
    dataQualityScore += 20;

    // If service is redesign-oriented
    if (serviceType.includes('redesign') || serviceType.includes('seo')) {
      detectedSignals.push('WEBSITE_PRESENT_BUT_WEAK_SIGNAL');
      digitalGapScore += 40;
      opportunityScore += 10;
      urgencyScore += 10;
      reasons.push('Has website — potential redesign or SEO improvement target.');
    }
  }

  // Category signals
  if (FOOD_CATEGORIES.some((c) => categoryStr.includes(c))) {
    detectedSignals.push('FOOD_BUSINESS');
    opportunityScore += 5;
    if (serviceType.includes('menu') || serviceType.includes('booking')) {
      detectedSignals.push('NEEDS_DIGITAL_MENU_POSSIBLE');
      opportunityScore += 12;
      digitalGapScore += 30;
      urgencyScore += 15;
      reasons.push('Food/café business — likely candidate for digital menu or ordering system.');
    }
  }

  if (SERVICE_CATEGORIES.some((c) => categoryStr.includes(c))) {
    detectedSignals.push('SERVICE_BUSINESS');
    if (BOOKING_CATEGORIES.some((c) => categoryStr.includes(c))) {
      detectedSignals.push('NEEDS_BOOKING_POSSIBLE');
      opportunityScore += 10;
      digitalGapScore += 30;
      urgencyScore += 15;
      reasons.push('Service business that likely needs an online booking system.');
    }
  }

  if (!detectedSignals.includes('FOOD_BUSINESS') && !detectedSignals.includes('SERVICE_BUSINESS')) {
    detectedSignals.push('LOCAL_BUSINESS');
  }

  // ═══════════════════════════════════════
  // FIT SCORE & DIFFERENTIATION
  // ═══════════════════════════════════════

  if (profile?.serviceType) {
    const matchSignals = SERVICE_MATCH_MAP[profile.serviceType] || [];
    const matchCount = matchSignals.filter((s) => detectedSignals.includes(s)).length;
    fitScore = Math.min(Math.round((matchCount / Math.max(matchSignals.length, 1)) * 100), 100);

    if (fitScore >= 60) {
      opportunityScore += 10;
      urgencyScore += 10;
      reasons.push(`Strong fit for "${profile.serviceType}" — ${matchCount} matching signals.`);
    } else if (fitScore >= 30) {
      opportunityScore += 5;
    }
  } else {
    // Default fallback fit based on digital gap
    fitScore = Math.min(digitalGapScore, 100);
  }

  // Add slight variance to opportunity score based on fine-grained data so scores aren't identical
  opportunityScore += (businessQualityScore * 0.1);
  opportunityScore += (contactabilityScore * 0.05);

  // Cap dimensions
  opportunityScore = Math.max(0, Math.min(Math.round(opportunityScore), 100));
  fitScore = Math.max(0, Math.min(Math.round(fitScore), 100));
  dataQualityScore = Math.max(0, Math.min(Math.round(dataQualityScore), 100));
  contactabilityScore = Math.max(0, Math.min(Math.round(contactabilityScore), 100));
  digitalGapScore = Math.max(0, Math.min(Math.round(digitalGapScore), 100));
  businessQualityScore = Math.max(0, Math.min(Math.round(businessQualityScore), 100));
  urgencyScore = Math.max(0, Math.min(Math.round(urgencyScore), 100));

  let scoreLevel = 'LOW';
  if (opportunityScore > 75) scoreLevel = 'GOLD';
  else if (opportunityScore > 55) scoreLevel = 'HIGH';
  else if (opportunityScore > 30) scoreLevel = 'MEDIUM';

  // ═══════════════════════════════════════
  // SUGGESTED SERVICE & TEXTS
  // ═══════════════════════════════════════
  let suggestedService = profile?.serviceType || 'Digital Presence Improvement';

  if (!normalizedLead.websiteUrl && !profile?.serviceType) {
    suggestedService = 'Website Development';
  } else if (detectedSignals.includes('NEEDS_DIGITAL_MENU_POSSIBLE')) {
    suggestedService = 'Digital Menu';
  } else if (detectedSignals.includes('NEEDS_BOOKING_POSSIBLE')) {
    suggestedService = 'Booking System';
  }

  let outreachAngle;
  if (!normalizedLead.websiteUrl) {
    outreachAngle = `${normalizedLead.businessName} has no website despite ${normalizedLead.reviewCount ? normalizedLead.reviewCount + ' Google reviews' : 'being listed on Google'}. Offer a quick, professional web presence to capture more nearby search traffic.`;
  } else if (normalizedLead.rating >= 4.0) {
    outreachAngle = `Compliment their ${normalizedLead.rating}★ rating and suggest ways to turn that reputation into more online bookings or leads through an upgraded digital presence.`;
  } else {
    outreachAngle = `${normalizedLead.businessName} is an active business in ${normalizedLead.city || 'the area'}. Position your service as a way to stand out from competitors and attract more customers.`;
  }

  const greeting = `Hi ${normalizedLead.businessName}`;
  let body;
  if (!normalizedLead.websiteUrl) {
    body = `I noticed you don't have a website yet — but your ${normalizedLead.rating ? normalizedLead.rating + '-star rating' : 'Google presence'} shows you're clearly doing great work. A simple, professional website could help you show up in more nearby searches and convert more visitors into customers.`;
  } else {
    body = `I came across your business${normalizedLead.rating ? ` and noticed your impressive ${normalizedLead.rating}-star rating` : ''}. I think there's an opportunity to strengthen your online presence and attract more customers.`;
  }
  const cta = `I specialize in ${suggestedService.toLowerCase()} for businesses like yours. Would you be open to a quick chat this week?`;
  const messageDraft = `${greeting},\n\n${body}\n\n${cta}\n\nBest regards`;

  let confidence = 'low';
  if (dataQualityScore >= 80 && detectedSignals.length >= 4) confidence = 'high';
  else if (dataQualityScore >= 50 && detectedSignals.length >= 2) confidence = 'medium';

  let nextBestAction = 'Review lead details';
  if (detectedSignals.includes('OUTREACH_READY') && scoreLevel === 'GOLD') {
    nextBestAction = 'Send outreach message';
  } else if (scoreLevel === 'HIGH') {
    nextBestAction = 'Prepare personalized pitch';
  } else if (scoreLevel === 'MEDIUM') {
    nextBestAction = 'Research business further';
  }

  return {
    fitScore,
    opportunityScore,
    scoreLevel,
    detectedSignals,
    reasons,
    suggestedService,
    outreachAngle,
    messageDraft,
    confidence,
    nextBestAction,
    dimensionScores: {
      serviceFit: fitScore,
      digitalGap: digitalGapScore,
      businessQuality: businessQualityScore,
      contactability: contactabilityScore,
      urgency: urgencyScore,
      dataQuality: dataQualityScore,
    },
  };
};

export const toLeadAnalysisCreateData = ({
  lead,
  analysisData,
  userId,
  workspaceId,
  campaignId,
  leadListLeadId,
}) => {
  if (!leadListLeadId && !lead.id) {
    throw new Error('Analysis requires either a leadId or a leadListLeadId');
  }

  return {
    userId,
    workspaceId,
    leadId: leadListLeadId ? null : lead.id,
    leadListLeadId: leadListLeadId || null,
    campaignId,
    fitScore: analysisData.fitScore,
    opportunityScore: analysisData.opportunityScore,
    scoreLevel: analysisData.scoreLevel,
    detectedSignals: analysisData.detectedSignals || [],
    reasons: analysisData.reasons || [],
    suggestedService: analysisData.suggestedService,
    outreachAngle: analysisData.outreachAngle,
    messageDraft: analysisData.messageDraft,
    confidence: analysisData.confidence,
    nextBestAction: analysisData.nextBestAction,
  };
};

export const runRuleBasedAnalysis = async ({ tx, lead, profile, userId, workspaceId, campaignId, leadListLeadId }) => {
  const analysisData = buildRuleBasedAnalysisData({ lead, profile });
  return tx.leadAnalysis.create({
    data: toLeadAnalysisCreateData({
      lead,
      analysisData,
      userId,
      workspaceId,
      campaignId,
      leadListLeadId,
    }),
  });
};
