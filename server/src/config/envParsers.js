import { z } from 'zod';

export const createBooleanParser = (defaultValue) => z.preprocess((val) => {
  if (val === undefined || val === '') return defaultValue;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
  }
  if (typeof val === 'number') {
    if (val === 1) return true;
    if (val === 0) return false;
  }
  return val; // let zod validation fail on invalid values
}, defaultValue === undefined ? z.boolean().optional() : z.boolean());
