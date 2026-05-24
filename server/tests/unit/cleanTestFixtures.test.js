import { describe, expect, it } from 'vitest';
import { ensureDevelopmentOnly, FIXTURE_PATTERNS, isFixtureShapedName, parseCleanupArgs } from '../../scripts/cleanTestFixtures.js';

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
      '/^AI Cafe /i',
      '/^Lead A filter-test/i',
    ]));
  });

  it('defaults to dry run unless --confirm is passed', () => {
    expect(parseCleanupArgs([])).toEqual({ dryRun: true, confirm: false });
    expect(parseCleanupArgs(['--confirm'])).toEqual({ dryRun: false, confirm: true });
  });

  it('matches only precise generated fixture names', () => {
    expect(isFixtureShapedName('AI Cafe concurrent abc123')).toBe(true);
    expect(isFixtureShapedName('Lead A filter-test abc123')).toBe(true);
    expect(isFixtureShapedName('Specialty Roastery mpiabcd')).toBe(true);
    expect(isFixtureShapedName('Specialty Roastery mpjabcd')).toBe(true);
    expect(isFixtureShapedName('Olympia Cafe')).toBe(false);
    expect(isFixtureShapedName('Empire Bakery')).toBe(false);
  });
});
