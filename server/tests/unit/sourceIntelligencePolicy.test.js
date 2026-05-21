import { describe, it, expect } from 'vitest';
import {
  getSourcePolicy,
  listRuntimeAllowedSources,
  listBlockedRuntimeSources,
  listSourcesAllowedForStage,
  listSourcesBlockedForStage,
  assertSourceAllowedForStage,
  STAGES,
  RISK_LEVELS,
} from '../../src/modules/search/sourceIntelligencePolicy.service.js';

describe('Source Intelligence Policy', () => {
  it('correctly configures LOCAL_DATASET', () => {
    const policy = getSourcePolicy('LOCAL_DATASET');
    expect(policy).toBeDefined();
    expect(policy.runtimeAllowed).toBe(true);
    expect(policy.costLevel).toBe('FREE');
    expect(policy.riskLevel).toBe('LOW');
  });

  it('blocks social scraping targets in runtime', () => {
    const policy = getSourcePolicy('SPIDERFOOT');
    expect(policy).toBeDefined();
    expect(policy.runtimeAllowed).toBe(false);
    expect(policy.adminOnly).toBe(true);
    expect(policy.riskLevel).toBe(RISK_LEVELS.HIGH);
  });

  it('allows SERPER and SERPAPI for live discovery', () => {
    const serper = getSourcePolicy('SERPER');
    const serpapi = getSourcePolicy('SERPAPI');
    expect(serper.runtimeAllowed).toBe(true);
    expect(serpapi.runtimeAllowed).toBe(true);
    expect(serper.allowedStages).toContain(STAGES.LIVE_DISCOVERY);
    expect(serpapi.allowedStages).toContain(STAGES.LIVE_DISCOVERY);
  });

  it('lists runtime allowed sources correctly', () => {
    const allowed = listRuntimeAllowedSources();
    expect(allowed.some(p => p.key === 'SERPER')).toBe(true);
    expect(allowed.some(p => p.key === 'GOOGLE_PLACES')).toBe(true);
    expect(allowed.some(p => p.key === 'OPEN_WEB_EVIDENCE')).toBe(true);
    expect(allowed.some(p => p.key === 'CSV_IMPORT')).toBe(false);
    expect(allowed.some(p => p.key === 'SPIDERFOOT')).toBe(false);
  });

  it('lists blocked runtime sources accurately', () => {
    const blocked = listBlockedRuntimeSources();
    expect(blocked.some(p => p.key === 'COMMON_CRAWL')).toBe(true);
    expect(blocked.some(p => p.key === 'SPIDERFOOT')).toBe(true);
    expect(blocked.some(p => p.key === 'CSV_IMPORT')).toBe(true);
    expect(blocked.some(p => p.key === 'GOOGLE_MAPS_SCRAPER_OUTPUT')).toBe(true);
    expect(blocked.some(p => p.key === 'WEBSITE_METADATA')).toBe(true);
    expect(blocked.some(p => p.key === 'SNOV_IO')).toBe(true);
    expect(blocked.some(p => p.key === 'SERPER')).toBe(false);
  });

  it('lists live discovery sources separately from offline and enrichment tools', () => {
    const allowedLive = listSourcesAllowedForStage(STAGES.LIVE_DISCOVERY).map(p => p.key);
    const blockedLive = listSourcesBlockedForStage(STAGES.LIVE_DISCOVERY).map(p => p.key);

    expect(allowedLive).toEqual(expect.arrayContaining(['SERPER', 'SERPAPI', 'OPEN_WEB_EVIDENCE']));
    expect(allowedLive).not.toContain('GOOGLE_PLACES');
    expect(allowedLive).not.toContain('WEBSITE_METADATA');
    expect(blockedLive).toEqual(expect.arrayContaining([
      'COMMON_CRAWL',
      'HUGGING_FACE_DATASETS',
      'SPIDERFOOT',
      'GOOGLE_MAPS_SCRAPER_OUTPUT',
      'CSV_IMPORT',
      'XLSX_IMPORT',
      'JSON_IMPORT',
      'WEBSITE_METADATA',
      'SNOV_IO',
    ]));
  });

  it('enforces stage assertions', () => {
    const localCheck = assertSourceAllowedForStage('LOCAL_DATASET', STAGES.LOCAL_SEARCH);
    expect(localCheck.allowed).toBe(true);

    const enrichCheck = assertSourceAllowedForStage('WEBSITE_METADATA', STAGES.LIVE_DISCOVERY);
    expect(enrichCheck.allowed).toBe(false);
    expect(enrichCheck.reason).toContain('blocked');

    const cacheCheck = assertSourceAllowedForStage('LEAD_EVIDENCE_CACHE', STAGES.EVIDENCE_REUSE);
    expect(cacheCheck.allowed).toBe(true);
  });

  it('scopes WEBSITE_METADATA to enrichment only', () => {
    const policy = getSourcePolicy('WEBSITE_METADATA');
    expect(policy).toBeDefined();
    expect(policy.allowedStages).toContain(STAGES.WEBSITE_ENRICHMENT);
    expect(policy.blockedStages).toContain(STAGES.LIVE_DISCOVERY);
    expect(policy.userCampaignAllowed).toBe(false);
    expect(policy.canRunForUserCampaign).toBe(false);
    expect(policy.canCreateEvidence).toBe(true);
    expect(policy.canPromoteToCatalog).toBe(false);
    expect(assertSourceAllowedForStage('WEBSITE_METADATA', STAGES.WEBSITE_ENRICHMENT).allowed).toBe(true);
    expect(assertSourceAllowedForStage('WEBSITE_METADATA', STAGES.LIVE_DISCOVERY).allowed).toBe(false);
  });

  it('allows controlled admin imports without enabling live runtime scraping', () => {
    expect(assertSourceAllowedForStage('JSON_IMPORT', STAGES.ADMIN_IMPORT).allowed).toBe(true);
    expect(assertSourceAllowedForStage('GOOGLE_MAPS_SCRAPER_OUTPUT', STAGES.ADMIN_IMPORT).allowed).toBe(true);
    expect(assertSourceAllowedForStage('COMMON_CRAWL', STAGES.ADMIN_IMPORT).allowed).toBe(true);
    expect(assertSourceAllowedForStage('HUGGING_FACE_DATASETS', STAGES.ADMIN_IMPORT).allowed).toBe(true);
    expect(assertSourceAllowedForStage('GOOGLE_MAPS_SCRAPER_OUTPUT', STAGES.LIVE_DISCOVERY).allowed).toBe(false);
    expect(assertSourceAllowedForStage('COMMON_CRAWL', STAGES.LIVE_DISCOVERY).allowed).toBe(false);
    expect(assertSourceAllowedForStage('OPEN_WEB_EVIDENCE', STAGES.LIVE_DISCOVERY).allowed).toBe(true);
    expect(assertSourceAllowedForStage('SPIDERFOOT', STAGES.ADMIN_IMPORT).allowed).toBe(false);

    const hf = getSourcePolicy('HUGGING_FACE_DATASETS');
    expect(hf.requiresLicenseReview).toBe(true);
    expect(hf.requiresManualReview).toBe(true);
  });
});
