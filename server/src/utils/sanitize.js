const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export const normalizeEmail = (email) => email.trim().toLowerCase();

export const sanitizeText = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(CONTROL_CHARS, '').trim();
};

export const sanitizeOptionalText = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return sanitizeText(value);
};

export const validateSafeUrl = (value) => {
  const parsed = new URL(value);
  return ['http:', 'https:'].includes(parsed.protocol);
};
