import { env } from '../config/env.js';
import { redactSensitive } from '../modules/ai/aiSecurity.service.js';

const levels = {
  silent: 0,
  error: 10,
  warn: 20,
  info: 30,
  debug: 40,
};

const activeLevel = levels[env.LOG_LEVEL] ?? levels.info;

const write = (level, message, meta = {}) => {
  if ((levels[level] ?? levels.info) > activeLevel || activeLevel === levels.silent) return;

  const payload = {
    level,
    message,
    service: 'findly-api',
    timestamp: new Date().toISOString(),
    ...redactSensitive(meta),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export const logger = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
