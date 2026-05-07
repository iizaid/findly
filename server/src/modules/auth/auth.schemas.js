import { z } from 'zod';
import { normalizeEmail, sanitizeText } from '../../utils/sanitize.js';

const commonPasswords = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'findly123',
]);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .refine((value) => /[a-z]/.test(value), 'Password must include a lowercase letter.')
  .refine((value) => /[A-Z]/.test(value), 'Password must include an uppercase letter.')
  .refine((value) => /\d/.test(value), 'Password must include a number.')
  .refine((value) => !commonPasswords.has(value.toLowerCase()), 'Password is too common.');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().transform(sanitizeText).pipe(z.string().min(2).max(80)),
    email: z.string().email().max(255).transform(normalizeEmail),
    password: passwordSchema,
    companyWebsite: z.literal('').optional(),
  }).strict().superRefine((value, ctx) => {
    const password = value.password.toLowerCase();
    const emailLocalPart = value.email.split('@')[0]?.toLowerCase();
    const nameParts = value.name.toLowerCase().split(/\s+/).filter((part) => part.length >= 3);

    if (emailLocalPart && password.includes(emailLocalPart)) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not contain your email.',
      });
    }

    if (nameParts.some((part) => password.includes(part))) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Password must not contain your name.',
      });
    }
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email().max(255).transform(normalizeEmail),
    password: z.string().min(1).max(128),
  }).strict(),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});
