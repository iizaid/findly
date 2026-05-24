import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DATABASE_PATTERN = /(test|_test|test_|findly_test)/i;

const isSafeTestDatabaseUrl = (value) => TEST_DATABASE_PATTERN.test(String(value || ''));

const applyTestDatabaseUrlOverride = (source = process.env) => {
  if (source.NODE_ENV !== 'test') return source;
  if (source.TEST_DATABASE_URL && source.DATABASE_URL !== source.TEST_DATABASE_URL) {
    source.DATABASE_URL = source.TEST_DATABASE_URL;
  }
  return source;
};

export const validateVitestDatabaseConfig = (source = process.env) => {
  source.NODE_ENV = 'test';
  applyTestDatabaseUrlOverride(source);

  const candidateDatabaseUrl = source.TEST_DATABASE_URL || source.DATABASE_URL;
  const explicitOverride = String(source.TEST_DATABASE_ALLOW_DEV_OVERWRITE || '').toLowerCase() === 'true';

  if (!candidateDatabaseUrl) {
    throw new Error('Refusing to run tests without TEST_DATABASE_URL or DATABASE_URL in test mode.');
  }

  if (!explicitOverride && !isSafeTestDatabaseUrl(candidateDatabaseUrl)) {
    throw new Error('Refusing to run tests against a non-test database. Set TEST_DATABASE_URL or use TEST_DATABASE_ALLOW_DEV_OVERWRITE=true explicitly.');
  }

  return source;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vitestEntrypoint = path.resolve(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs');
const isDirectRun = fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  validateVitestDatabaseConfig(process.env);

  const child = spawn(
    process.execPath,
    [vitestEntrypoint, 'run'],
    {
      stdio: 'inherit',
      env: process.env,
      shell: false,
    },
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
