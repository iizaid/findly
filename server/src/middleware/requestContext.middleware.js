import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

export const requestContext = (req, res, next) => {
  const requestId = req.get('x-request-id') || randomUUID();
  const startedAt = Date.now();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('request.completed', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id,
      ipAddress: req.ip,
    });
  });

  next();
};
