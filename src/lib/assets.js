import { safeAssetUrl } from './urlSafety';

export function getAssetUrl(path) {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const isProd = import.meta.env.PROD;
  const baseUrl = envBaseUrl || (isProd ? '' : 'http://localhost:4000');

  return safeAssetUrl(path, baseUrl);
}
