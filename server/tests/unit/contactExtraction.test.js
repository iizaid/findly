import { describe, expect, it, vi } from 'vitest';
import { extractPublicContactData } from '../../src/modules/search/contactExtraction.service.js';

describe('contact extraction', () => {
  it('extracts public contact methods from a small official site set', async () => {
    const htmlByUrl = new Map([
      ['https://clinic.example/', `
        <html><body>
          <a href="/contact">Contact</a>
          <a href="https://instagram.com/clinic.example">Instagram</a>
          <a href="mailto:hello@clinic.example">hello@clinic.example</a>
          <a href="tel:+962799999999">Call</a>
        </body></html>
      `],
      ['https://clinic.example/contact', `
        <html><body>
          <a href="https://wa.me/962799999999">WhatsApp</a>
          <a href="mailto:ads@doubleclick.net">Ignore</a>
          +962 7 9999 9999
        </body></html>
      `],
    ]);

    const fetcher = vi.fn(async (url) => ({
      finalUrl: url,
      text: htmlByUrl.get(url) || '',
    }));

    const result = await extractPublicContactData({
      websiteUrl: 'https://clinic.example/',
      businessName: 'Clinic Example',
      city: 'Amman',
      country: 'Jordan',
      fetcher,
    });

    expect(result.phoneNumbers).toContain('+962799999999');
    expect(result.emails).toContain('hello@clinic.example');
    expect(result.emails).not.toContain('ads@doubleclick.net');
    expect(result.instagramUrl).toBe('https://instagram.com/clinic.example');
    expect(result.contactPageUrl).toBe('https://clinic.example/contact');
    expect(result.whatsappLinks).toContain('https://wa.me/962799999999');
  });
});
