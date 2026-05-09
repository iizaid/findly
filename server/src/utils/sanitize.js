export const normalizeEmail = (email) => email.trim().toLowerCase();

const removeControlCharacters = (value) => {
  return [...value].filter((char) => {
    const code = char.charCodeAt(0);
    return code > 31 && code !== 127;
  }).join('');
};

export const sanitizeText = (value) => {
  if (typeof value !== 'string') return value;
  return removeControlCharacters(value).trim();
};

export const sanitizeOptionalText = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return sanitizeText(value);
};

export const validateSafeUrl = (value) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};
