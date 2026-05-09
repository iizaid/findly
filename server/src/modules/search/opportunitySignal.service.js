import { createHash } from 'node:crypto';

const INTENT_PATTERNS = [
  ['NEEDS_WEBSITE', ['need website', 'build a website', 'web designer', 'website developer', 'landing page']],
  ['NEEDS_BOOKING', ['booking system', 'appointment system', 'schedule appointments', 'online booking']],
  ['NEEDS_DIGITAL_MENU', ['digital menu', 'online menu', 'restaurant menu', 'qr menu']],
  ['LOOKING_FOR_FREELANCER', ['looking for freelancer', 'hire freelancer', 'need someone', 'freelancer needed']],
  ['ASKING_FOR_RECOMMENDATION', ['recommend', 'recommendation', 'best provider', 'anyone know']],
  ['BUSINESS_PAIN_POINT', ['struggling with', 'problem with', 'too slow', 'manual process', 'hard to manage']],
];

export const hashPublicAuthor = (author) => {
  if (!author) return null;
  return createHash('sha256').update(author.toLowerCase()).digest('hex');
};

export const detectSignalIntent = ({ title = '', body = '', keywords = [], serviceKeywords = [], locationKeywords = [] }) => {
  const text = `${title} ${body}`.toLowerCase();
  const matchedKeywords = [...new Set([...keywords, ...serviceKeywords, ...locationKeywords]
    .filter(Boolean)
    .filter((keyword) => text.includes(keyword.toLowerCase())))];

  let detectedIntent = 'GENERAL_DISCUSSION';
  for (const [intent, patterns] of INTENT_PATTERNS) {
    if (patterns.some((pattern) => text.includes(pattern))) {
      detectedIntent = intent;
      break;
    }
  }

  const intentScore = detectedIntent === 'GENERAL_DISCUSSION' ? 10 : 45;
  const keywordScore = Math.min(matchedKeywords.length * 12, 35);
  const locationScore = locationKeywords.some((keyword) => text.includes(keyword.toLowerCase())) ? 10 : 0;
  const confidence = Math.max(0, Math.min(100, intentScore + keywordScore + locationScore));

  return {
    detectedIntent,
    matchedKeywords,
    confidence,
  };
};

export const analyzeOpportunitySignal = (signal, serviceProfile) => {
  const serviceType = serviceProfile?.serviceType || 'Digital Presence Improvement';
  const shouldBecomeLead = signal.confidence >= 70 && ['NEEDS_WEBSITE', 'NEEDS_BOOKING', 'NEEDS_DIGITAL_MENU', 'LOOKING_FOR_FREELANCER'].includes(signal.detectedIntent);

  return {
    signalScore: signal.confidence,
    intentType: signal.detectedIntent,
    confidence: signal.confidence,
    suggestedAction: shouldBecomeLead ? 'Research the business context before outreach.' : 'Use this as market insight and monitor related discussions.',
    outreachStrategy: `Do not spam Reddit users. Treat this ${signal.source} post as a demand signal for ${serviceType}; validate business context before any outreach.`,
    shouldBecomeLead,
  };
};
