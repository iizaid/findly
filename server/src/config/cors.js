import cors from 'cors';
import { env } from './env.js';

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (env.CLIENT_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
});
