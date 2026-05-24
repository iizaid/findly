import { describe, expect, it } from 'vitest';
import { validateVitestDatabaseConfig } from '../../scripts/runVitest.js';

describe('runVitest database guard', () => {
  it('rejects missing database configuration', () => {
    expect(() => validateVitestDatabaseConfig({
      NODE_ENV: 'test',
    })).toThrow(/Refusing to run tests without TEST_DATABASE_URL or DATABASE_URL/i);
  });

  it('rejects non-test databases unless explicitly overridden', () => {
    expect(() => validateVitestDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
    })).toThrow(/Refusing to run tests against a non-test database/i);

    const prepared = validateVitestDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
      TEST_DATABASE_ALLOW_DEV_OVERWRITE: 'true',
    });

    expect(prepared.DATABASE_URL).toContain('/findly');
  });

  it('prefers TEST_DATABASE_URL when provided', () => {
    const prepared = validateVitestDatabaseConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly',
      TEST_DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/findly_test',
    });

    expect(prepared.DATABASE_URL).toContain('findly_test');
  });
});
