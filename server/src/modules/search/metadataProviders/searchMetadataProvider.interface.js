export const SEARCH_METADATA_PROVIDERS = Object.freeze({
  SERPER: 'serper',
  SERPAPI: 'serpapi',
});

export const normalizeProviderName = (value) => String(value || '').trim().toLowerCase();

export const normalizeProviderResult = ({ title, link, displayedLink, snippet, position, provider, rawMetadata = {} }) => {
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) return null;

  return {
    title: title ? String(title).trim() : null,
    link: parsed.href,
    displayedLink: displayedLink ? String(displayedLink).trim() : null,
    snippet: snippet ? String(snippet).trim() : null,
    position: Number.isFinite(Number(position)) ? Number(position) : null,
    provider,
    rawMetadata,
  };
};
