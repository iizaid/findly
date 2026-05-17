import { describe, it, expect } from 'vitest';
import {
  getSourcePolicy,
  listRuntimeAllowedSources,
  listAdminOnlySources,
  assertSourceAllowedForStage,
  canSourceCreateEvidence,
  canSourcePromoteToCatalog,
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
    expect(allowed.some(p => p.key === 'CSV_IMPORT')).toBe(false);
    expect(allowed.some(p => p.key === 'SPIDERFOOT')).toBe(false);
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
});
