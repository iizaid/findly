import { describe, expect, it } from 'vitest';
import { ensureDevelopmentOnly, FIXTURE_PATTERNS } from '../../scripts/cleanTestFixtures.js';

describe('clean test fixtures guard', () => {
  it('refuses cleanup outside development', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    expect(() => ensureDevelopmentOnly()).toThrow(/allowed only in development/i);
    process.env.NODE_ENV = 'production';
    expect(() => ensureDevelopmentOnly()).toThrow(/allowed only in development/i);
    process.env.NODE_ENV = original;
  });

  it('tracks expected generated fixture patterns', () => {
    expect(FIXTURE_PATTERNS).toEqual(expect.arrayContaining([
      'filter-test',
      'concurrent',
      'reuse',
      'invalidai',
      'AI Cafe',
      'mpi',
      'mpj',
    ]));
  });
});
