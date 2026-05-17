import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE = {
  systemPrompt: null,
  rubric: null,
  styleGuide: null,
  dataQualityPolicy: null,
  serviceMatchingPolicy: null,
  antiHallucinationPolicy: null,
  examples: new Map(),
};

const safeReadFile = (filename) => {
  try {
    return fs.readFileSync(path.join(__dirname, filename), 'utf8');
  } catch (error) {
    logger.warn(`[PlaybookLoader] Failed to read ${filename}`, { error: error.message });
    return null;
  }
};

const safeParseJson = (raw, fallback) => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const loadSystemPrompt = () => {
  if (!CACHE.systemPrompt) {
    CACHE.systemPrompt = safeReadFile('lead-analysis.system.md') || 'Score leads objectively. Return valid JSON only.';
  }
  return CACHE.systemPrompt;
};

const loadRubric = () => {
  if (!CACHE.rubric) {
    const raw = safeReadFile('lead-scoring-rubric.json');
    CACHE.rubric = safeParseJson(raw, {
      version: '1.0.0',
      dimensions: { serviceFit: 25, digitalGap: 25, businessQuality: 15, contactability: 15, urgency: 10, dataQuality: 10 },
    });
  }
  return CACHE.rubric;
};

const loadStyleGuide = () => {
  if (!CACHE.styleGuide) {
    CACHE.styleGuide = safeReadFile('outreach-style-guide.md') || 'Keep messages short and polite. No spammy language.';
  }
  return CACHE.styleGuide;
};

const loadDataQualityPolicy = () => {
  if (!CACHE.dataQualityPolicy) {
    CACHE.dataQualityPolicy = safeReadFile('data-quality-policy.md') || 'Low data quality means low confidence. Do not fabricate differences.';
  }
  return CACHE.dataQualityPolicy;
};

const loadServiceMatchingPolicy = () => {
  if (!CACHE.serviceMatchingPolicy) {
    CACHE.serviceMatchingPolicy = safeReadFile('service-matching-policy.md') || 'Lower serviceFit when the service does not match the business type.';
  }
  return CACHE.serviceMatchingPolicy;
};

const loadAntiHallucinationPolicy = () => {
  if (!CACHE.antiHallucinationPolicy) {
    CACHE.antiHallucinationPolicy = safeReadFile('anti-hallucination-policy.md') || 'Never invent facts. Use only provided data.';
  }
  return CACHE.antiHallucinationPolicy;
};

const normalizeServiceSlug = (serviceType) => {
  if (!serviceType) return 'generic';
  return serviceType
    .toLowerCase()
    .replace(/[\/\\]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const loadExamples = (serviceType) => {
  const key = normalizeServiceSlug(serviceType);
  if (CACHE.examples.has(key)) return CACHE.examples.get(key);

  const raw = safeReadFile(`examples/${key}.examples.json`);
  let parsed = safeParseJson(raw, null);

  // Fallback to generic if service-specific file is missing
  if (!parsed && key !== 'generic') {
    const genericRaw = safeReadFile('examples/generic.examples.json');
    parsed = safeParseJson(genericRaw, null);
  }

  CACHE.examples.set(key, parsed);
  return parsed;
};

export const getLeadAnalysisPlaybook = ({ serviceProfile } = {}) => {
  const systemPrompt = loadSystemPrompt();
  const rubric = loadRubric();
  const styleGuide = loadStyleGuide();
  const dataQualityPolicy = loadDataQualityPolicy();
  const serviceMatchingPolicy = loadServiceMatchingPolicy();
  const antiHallucinationPolicy = loadAntiHallucinationPolicy();
  const examples = loadExamples(serviceProfile?.serviceType);

  return {
    systemPrompt,
    rubric,
    styleGuide,
    dataQualityPolicy,
    serviceMatchingPolicy,
    antiHallucinationPolicy,
    examples,
    version: '1.1.0',
  };
};

export const clearPlaybookCache = () => {
  CACHE.systemPrompt = null;
  CACHE.rubric = null;
  CACHE.styleGuide = null;
  CACHE.dataQualityPolicy = null;
  CACHE.serviceMatchingPolicy = null;
  CACHE.antiHallucinationPolicy = null;
  CACHE.examples.clear();
};
