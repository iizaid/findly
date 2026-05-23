const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
const compact = (value) => (value || '').toString().trim().toLowerCase();

const normalizeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

const hasValue = (value) => value !== null && value !== undefined && value !== '';

const hasSocialPresence = (lead = {}) => Boolean(
  lead.instagramUrl
  || lead.facebookUrl
  || lead.instagramUsername
  || lead.googleMapsUrl
  || compact(JSON.stringify(lead.rawData || {})).includes('instagram')
  || compact(JSON.stringify(lead.rawData || {})).includes('facebook'),
);

const hasBookingHint = (lead = {}) => {
  const text = compact([
    lead.category,
    lead.websiteUrl,
    JSON.stringify(lead.rawData || {}),
  ].join(' '));
  return /(book|booking|reserve|appointment|schedule|menu|order)/.test(text);
};

const categoryTerms = {
  cafes: ['cafe', 'coffee', 'roastery', 'espresso', 'مقهى', 'قهوة', 'كوفي'],
  clinics: ['clinic', 'medical', 'dental', 'physio', 'aesthetic', 'spa clinic', 'عيادة', 'طبي'],
  restaurants: ['restaurant', 'burger', 'pizza', 'shawarma', 'food', 'grill', 'مطعم', 'شاورما'],
  salons: ['salon', 'beauty', 'hair', 'nails', 'spa', 'صالون', 'تجميل'],
  gyms: ['gym', 'fitness', 'training', 'crossfit', 'نادي', 'جيم', 'لياقة'],
};

const getCategoryBucket = (value = '') => {
  const text = compact(value);
  return Object.entries(categoryTerms).find(([, terms]) => terms.some((term) => text.includes(term)))?.[0] || null;
};

const normalizeRequestedTypes = (campaign = {}) => {
  const types = Array.isArray(campaign.businessTypes) ? campaign.businessTypes : [];
  return types.map((item) => compact(item)).filter(Boolean);
};

const scoreLevelFromScore = (score) => {
  if (score >= 80) return 'GOLD';
  if (score >= 62) return 'HIGH';
  if (score >= 42) return 'MEDIUM';
  return 'LOW';
};

const pushDimension = (dimensions, { key, label, value, weight, reason }) => {
  dimensions.push({
    key,
    label,
    value: clamp(value),
    weight,
    reason,
  });
};

export const buildLeadScoreBreakdown = ({ lead = {}, campaign = {}, sourceConfidence = null, aiConfidence = null } = {}) => {
  const dimensions = [];
  const category = compact(lead.category);
  const categoryBucket = getCategoryBucket(category);
  const requestedTypes = normalizeRequestedTypes(campaign);
  const requestedJoined = requestedTypes.join(' ');
  const requestedBucket = getCategoryBucket(requestedJoined);
  const locationCity = compact(lead.city);
  const locationCountry = compact(lead.country);
  const requestedCity = compact(campaign.city);
  const requestedCountry = compact(campaign.country);
  const websiteDomain = normalizeUrl(lead.websiteUrl);
  const rating = Number(lead.rating) || 0;
  const reviewCount = Number(lead.reviewCount) || 0;
  const confidenceFromSource = sourceConfidence ?? lead.confidenceScore ?? lead.localDatasetScore ?? 50;

  let serviceFit = 40;
  if (!requestedTypes.length) serviceFit = 55;
  else if (requestedTypes.some((type) => category.includes(type) || type.includes(category))) serviceFit = 90;
  else if (requestedBucket && categoryBucket && requestedBucket === categoryBucket) serviceFit = 78;
  else if (categoryBucket) serviceFit = 52;
  pushDimension(dimensions, {
    key: 'service_fit',
    label: 'Service fit',
    value: serviceFit,
    weight: 0.18,
    reason: requestedTypes.length
      ? `Matched against ${requestedTypes.join(', ')}.`
      : 'No business type filter reduced the match window.',
  });

  let categoryUrgency = 38;
  if (['clinics', 'salons', 'gyms'].includes(categoryBucket)) categoryUrgency = 72;
  else if (['cafes', 'restaurants'].includes(categoryBucket)) categoryUrgency = 64;
  pushDimension(dimensions, {
    key: 'category_urgency',
    label: 'Category urgency',
    value: categoryUrgency,
    weight: 0.08,
    reason: categoryBucket ? `${categoryBucket} tends to convert well for digital services.` : 'Generic business category.',
  });

  const websiteGap = !websiteDomain ? 92 : 36;
  pushDimension(dimensions, {
    key: 'website_gap',
    label: 'Website gap',
    value: websiteGap,
    weight: 0.15,
    reason: websiteDomain ? `Website exists on ${websiteDomain}.` : 'No website found.',
  });

  const websiteQuality = !websiteDomain ? 22 : (hasBookingHint(lead) ? 64 : 42);
  pushDimension(dimensions, {
    key: 'website_quality',
    label: 'Website quality',
    value: websiteQuality,
    weight: 0.08,
    reason: !websiteDomain
      ? 'Missing website limits online conversion.'
      : (hasBookingHint(lead) ? 'Website shows clear conversion paths.' : 'Website exists but conversion paths look limited.'),
  });

  const contactPath = hasValue(lead.phone) || hasValue(lead.email) || hasValue(lead.whatsappNumber)
    ? 68
    : 28;
  pushDimension(dimensions, {
    key: 'contact_path',
    label: 'Contact path',
    value: contactPath,
    weight: 0.08,
    reason: contactPath >= 60 ? 'Direct contact route exists.' : 'Direct contact route is weak or missing.',
  });

  const socialPresence = hasSocialPresence(lead) ? 74 : 26;
  pushDimension(dimensions, {
    key: 'social_presence',
    label: 'Social presence',
    value: socialPresence,
    weight: 0.08,
    reason: socialPresence >= 60 ? 'Public social presence detected.' : 'No strong public social presence detected.',
  });

  const commerceNeed = hasBookingHint(lead) ? 71 : (websiteDomain ? 44 : 58);
  pushDimension(dimensions, {
    key: 'commerce_need',
    label: 'Booking/menu need',
    value: commerceNeed,
    weight: 0.08,
    reason: hasBookingHint(lead)
      ? 'Public data suggests booking, menu, or order flow demand.'
      : 'No clear booking/menu demand inferred from current evidence.',
  });

  const reviewStrength = reviewCount >= 200 ? 88 : reviewCount >= 75 ? 72 : reviewCount >= 20 ? 54 : reviewCount > 0 ? 34 : 18;
  pushDimension(dimensions, {
    key: 'review_count',
    label: 'Review count',
    value: reviewStrength,
    weight: 0.07,
    reason: reviewCount ? `${reviewCount} public reviews found.` : 'No review count found.',
  });

  const ratingStrength = rating >= 4.6 ? 86 : rating >= 4.2 ? 72 : rating >= 3.8 ? 56 : rating > 0 ? 36 : 24;
  pushDimension(dimensions, {
    key: 'rating',
    label: 'Rating',
    value: ratingStrength,
    weight: 0.05,
    reason: rating ? `${rating} public rating found.` : 'No public rating found.',
  });

  pushDimension(dimensions, {
    key: 'source_confidence',
    label: 'Source confidence',
    value: clamp(confidenceFromSource),
    weight: 0.06,
    reason: 'Confidence derived from the available source evidence.',
  });

  const evidenceRichness = clamp(
    (hasValue(lead.address) ? 18 : 0)
    + (hasValue(lead.phone) ? 18 : 0)
    + (hasValue(lead.websiteUrl) ? 18 : 0)
    + (hasValue(lead.instagramUrl) || hasValue(lead.facebookUrl) ? 18 : 0)
    + (hasValue(lead.googleMapsUrl) ? 14 : 0)
    + (reviewCount > 0 ? 14 : 0),
  );
  pushDimension(dimensions, {
    key: 'evidence_richness',
    label: 'Evidence richness',
    value: evidenceRichness,
    weight: 0.05,
    reason: 'Higher when contact, profile, and review evidence is present.',
  });

  let locationMatch = 42;
  if (requestedCity && locationCity && requestedCity === locationCity) locationMatch = 92;
  else if (requestedCountry && locationCountry && requestedCountry === locationCountry) locationMatch = 68;
  pushDimension(dimensions, {
    key: 'location_match',
    label: 'Location match',
    value: locationMatch,
    weight: 0.06,
    reason: locationMatch >= 90
      ? 'Exact city match.'
      : locationMatch >= 60
        ? 'Country match only.'
        : 'Weak location match.',
  });

  if (aiConfidence !== null) {
    pushDimension(dimensions, {
      key: 'ai_confidence',
      label: 'AI confidence',
      value: clamp(aiConfidence),
      weight: 0.06,
      reason: 'Applied only when AI review completed successfully.',
    });
  }

  const weightedTotal = dimensions.reduce((sum, item) => sum + (item.value * item.weight), 0);
  const finalScore = clamp(weightedTotal);

  return {
    finalScore,
    scoreLevel: scoreLevelFromScore(finalScore),
    dimensions,
    scoringSource: aiConfidence !== null ? 'HYBRID' : 'RULE_BASED',
  };
};

export const scoreLeadCandidate = ({ lead = {}, campaign = {}, sourceConfidence = null, aiConfidence = null } = {}) => {
  const breakdown = buildLeadScoreBreakdown({ lead, campaign, sourceConfidence, aiConfidence });
  return {
    ...breakdown,
    score: breakdown.finalScore,
  };
};
