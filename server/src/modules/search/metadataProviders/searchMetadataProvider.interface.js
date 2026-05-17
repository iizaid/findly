export const SEARCH_METADATA_PROVIDERS = Object.freeze({
  SERPER: 'serper',
  SERPAPI: 'serpapi',
});

export const normalizeProviderName = (value) => String(value || '').trim().toLowerCase();

export const normalizeProviderResult = ({ title, link, displayedLink, snippet, position, provider, rawMetadata = {} }) => {
  let safeLink;
  try {
    const parsed = new URL(link);
    safeLink = ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }

  if (!safeLink) return null;

  return {
    title: title ? String(title).trim() : null,
    link: safeLink,
    displayedLink: displayedLink ? String(displayedLink).trim() : null,
    snippet: snippet ? String(snippet).trim() : null,
    position: Number.isFinite(Number(position)) ? Number(position) : null,
    provider,
    rawMetadata,
  };
};
