import cors from 'cors';
import { env } from './env.js';

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (env.CLIENT_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    if (!env.IS_PRODUCTION) {
      console.warn(`[CORS] Allowing unconfigured origin in DEV mode: "${origin}"`);
      return callback(null, true);
    }

    console.error(`[CORS REJECTED] Origin not allowed: "${origin}"`);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
});
