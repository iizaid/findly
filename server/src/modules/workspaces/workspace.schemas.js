import { z } from 'zod';
import { cuidSchema } from '../sessions/session.schemas.js';

export const workspaceIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: cuidSchema,
  }),
  query: z.object({}).optional(),
});

export const updateWorkspaceSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
  }).strict(),
  params: z.object({
    id: cuidSchema,
  }),
  query: z.object({}).optional(),
});
