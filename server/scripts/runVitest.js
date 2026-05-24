import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';

if (!process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_ALLOW_DEV_OVERWRITE ??= 'true';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vitestEntrypoint = path.resolve(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs');

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
