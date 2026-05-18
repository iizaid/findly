import { describe, expect, it, vi } from 'vitest';
import {
  analyzeWebsiteMetadata,
  extractWebsiteMetadata,
  generateWebsiteOpportunitySignals,
} from '../../src/modules/search/websiteMetadata.service.js';

const richHtml = `
<!doctype html>
<html lang="en">
  <head>
    <title>Example Cafe Amman</title>
    <meta name="description" content="A neighborhood cafe in Amman with specialty coffee, breakfast, and reservations.">
    <meta property="og:title" content="Example Cafe">
    <meta property="og:description" content="Coffee and breakfast in Amman.">
    <link rel="canonical" href="/home">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"CafeOrCoffeeShop","name":"Example Cafe","address":{"@type":"PostalAddress","addressLocality":"Amman"},"openingHours":"Mo-Su 08:00-22:00","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8"}}
    </script>
  </head>
  <body>
    <a href="/contact">Contact us</a>
    <a href="/menu">Menu</a>
    <a href="/reservations">Book a table</a>
    <a href="https://wa.me/962799999999">WhatsApp</a>
    <a href="mailto:hello@example.com">Email</a>
    <a href="tel:+962799999999">Call</a>
    <a href="https://instagram.com/examplecafe">Instagram</a>
    <a href="https://facebook.com/examplecafe">Facebook</a>
    <a href="https://google.com/maps/place/example">Map</a>
  </body>
</html>`;

describe('website metadata extraction', () => {
  it('extracts safe homepage metadata, links, and schema summary without raw HTML', () => {
    const metadata = extractWebsiteMetadata({ html: richHtml, finalUrl: 'https://example.com/' });

    expect(metadata.title).toBe('Example Cafe Amman');
    expect(metadata.description).toContain('neighborhood cafe');
    expect(metadata.canonicalUrl).toBe('https://example.com/home');
    expect(metadata.ogTitle).toBe('Example Cafe');
    expect(metadata.language).toBe('en');
    expect(metadata.links.contactLinks[0]).toBe('https://example.com/contact');
    expect(metadata.links.menuLinks[0]).toBe('https://example.com/menu');
    expect(metadata.links.bookingLinks[0]).toBe('https://example.com/reservations');
    expect(metadata.links.whatsAppLinks[0]).toContain('wa.me');
    expect(metadata.links.emailHints[0]).toBe('hello@example.com');
    expect(metadata.links.phoneHints[0]).toBe('+962799999999');
    expect(metadata.links.socialLinks).toEqual(expect.arrayContaining([
      'https://instagram.com/examplecafe',
      'https://facebook.com/examplecafe',
    ]));
    expect(metadata.schema.hasJsonLd).toBe(true);
    expect(metadata.schema.hasLocalBusinessSchema).toBe(true);
    expect(metadata.schema.hasOpeningHours).toBe(true);
    expect(metadata.schema.hasAggregateRating).toBe(true);
    expect(metadata.schema.hasAddress).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain('<html');
  });

  it('generates opportunity and positive conversion signals deterministically', () => {
    const richMetadata = extractWebsiteMetadata({ html: richHtml, finalUrl: 'https://example.com/' });
    const richSignals = generateWebsiteOpportunitySignals({ reachable: true, statusCode: 200, metadata: richMetadata });
    expect(richSignals.map((item) => item.key)).toEqual(expect.arrayContaining([
      'WEBSITE_REACHABLE',
      'HAS_CONTACT_LINK',
      'HAS_MENU_LINK',
      'HAS_BOOKING_LINK',
      'HAS_WHATSAPP_LINK',
      'HAS_INSTAGRAM_LINK',
      'HAS_FACEBOOK_LINK',
      'HAS_SCHEMA_ORG',
      'HAS_LOCAL_BUSINESS_SCHEMA',
      'STRONG_CONVERSION_PATH',
    ]));

    const weakMetadata = extractWebsiteMetadata({ html: '<html><head><title>X</title></head><body>Coming soon</body></html>', finalUrl: 'https://weak.example/' });
    const weakSignals = generateWebsiteOpportunitySignals({ reachable: true, statusCode: 200, metadata: weakMetadata });
    expect(weakSignals.map((item) => item.key)).toEqual(expect.arrayContaining([
      'WEAK_TITLE',
      'WEAK_META_DESCRIPTION',
      'MISSING_CONTACT_LINK',
      'MISSING_MENU_LINK',
      'MISSING_BOOKING_LINK',
      'POSSIBLE_PLACEHOLDER_SITE',
      'WEAK_CONVERSION_PATH',
    ]));
  });

  it('handles non-html and unreachable fetches without returning raw HTML', async () => {
    const nonHtmlFetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      contentType: 'application/json',
      text: '',
      truncated: false,
      finalUrl: 'https://example.com/',
      redirectsFollowed: 0,
    }));

    const nonHtml = await analyzeWebsiteMetadata({ websiteUrl: 'https://example.com', fetcher: nonHtmlFetcher });
    expect(nonHtml.warnings).toContain('WEBSITE_NON_HTML');
    expect(nonHtml.signals.map((item) => item.key)).toContain('WEBSITE_NON_HTML');
    expect(nonHtml.metadata).toBeNull();

    const timeoutFetcher = vi.fn(async () => {
      throw new Error('Website fetch timed out.');
    });
    const timeout = await analyzeWebsiteMetadata({ websiteUrl: 'https://example.com', fetcher: timeoutFetcher });
    expect(timeout.reachable).toBe(false);
    expect(timeout.warnings).toContain('WEBSITE_TIMEOUT');
    expect(timeout.signals[0].key).toBe('WEBSITE_TIMEOUT');
  });
});
