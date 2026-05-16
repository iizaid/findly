export function getAssetUrl(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('data:')) return path;

  // Use VITE_API_BASE_URL if available, otherwise default to local dev server
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  
  // Ensure no double slashes when joining
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}
