import { z } from 'zod';

const providerSchema = z.enum(['google', 'github', 'discord']);

export const oauthStartSchema = z.object({
  params: z.object({
    provider: providerSchema,
  }),
  query: z.object({
    returnTo: z.string().max(300).optional(),
  }).optional(),
});

export const oauthCallbackSchema = z.object({
  params: z.object({
    provider: providerSchema,
  }),
  query: z.object({
    code: z.string().min(1).max(4096).optional(),
    state: z.string().min(16).max(256).optional(),
    error: z.string().max(200).optional(),
  }).passthrough(),
});
