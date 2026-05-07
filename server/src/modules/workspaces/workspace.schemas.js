import { z } from 'zod';
import { cuidSchema } from '../sessions/session.schemas.js';

export const workspaceIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: cuidSchema,
  }),
  query: z.object({}).optional(),
});
