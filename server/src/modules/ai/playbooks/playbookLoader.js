import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CACHE = {
  systemPrompt: null,
  rubric: null,
  styleGuide: null,
  examples: new Map(),
};

const safeReadFile = (filename) => {
  try {
    return fs.readFileSync(path.join(__dirname, filename), 'utf8');
  } catch (error) {
    console.error(`[PlaybookLoader] Failed to read ${filename}:`, error.message);
    return null;
  }
};

const loadSystemPrompt = () => {
  if (!CACHE.systemPrompt) {
    CACHE.systemPrompt = safeReadFile('lead-analysis.system.md') || 'Be strict. Score objectively.';
  }
  return CACHE.systemPrompt;
};

const loadRubric = () => {
  if (!CACHE.rubric) {
    const raw = safeReadFile('lead-scoring-rubric.json');
    try {
      CACHE.rubric = JSON.parse(raw);
    } catch {
      CACHE.rubric = { serviceFit: 25, digitalGap: 25, businessQuality: 15, contactability: 15, urgency: 10, dataQuality: 10 };
    }
  }
  return CACHE.rubric;
};

const loadStyleGuide = () => {
  if (!CACHE.styleGuide) {
    CACHE.styleGuide = safeReadFile('outreach-style-guide.md') || 'Keep messages short and polite.';
  }
  return CACHE.styleGuide;
};

const loadExamples = (serviceType) => {
  if (!serviceType) return null;
  const key = serviceType.toLowerCase().replace(/\s+/g, '-');
  if (CACHE.examples.has(key)) return CACHE.examples.get(key);

  const raw = safeReadFile(`examples/${key}.examples.json`);
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  CACHE.examples.set(key, parsed);
  return parsed;
};

export const getLeadAnalysisPlaybook = ({ serviceProfile }) => {
  const systemPrompt = loadSystemPrompt();
  const rubric = loadRubric();
  const styleGuide = loadStyleGuide();
  const examples = loadExamples(serviceProfile?.serviceType);

  return {
    systemPrompt,
    rubric,
    styleGuide,
    examples,
    version: '1.0.0',
  };
};

export const clearPlaybookCache = () => {
  CACHE.systemPrompt = null;
  CACHE.rubric = null;
  CACHE.styleGuide = null;
  CACHE.examples.clear();
};
