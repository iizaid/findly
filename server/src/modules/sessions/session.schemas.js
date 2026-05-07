import { z } from 'zod';

export const cuidSchema = z.string().regex(/^c[a-z0-9]{24}$/i, 'Invalid id.');

export const sessionIdParamSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: cuidSchema,
  }),
  query: z.object({}).optional(),
});
