export function getAssetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('data:')) return path;

  const envBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
  const isProd = import.meta.env.PROD;
  const baseUrl = envBaseUrl || (isProd ? '' : 'http://localhost:4000');
  
  if (!baseUrl) return path;

  // Ensure no double slashes when joining
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}
