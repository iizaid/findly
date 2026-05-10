import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'node:dns';
import { validateAndResolveSafeUrl, safeFetchTextWithLimit, isSafeIp } from '../../src/utils/safeFetch.js';

// Mock DNS
vi.mock('node:dns', () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

const mockDnsResponse = (address, family = 4) => {
  dns.promises.lookup.mockResolvedValue([{ address, family }]);
};

const mockFetchResponse = (ok, status, text, headers = {}) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    headers: new Headers(headers),
    text: async () => text,
    body: {
      getReader: () => {
        let readCalled = false;
        return {
          read: async () => {
            if (readCalled) return { done: true };
            readCalled = true;
            return { done: false, value: new TextEncoder().encode(text) };
          },
        };
      },
    },
  });
};

const mockRedirectResponse = (location) => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 301,
    headers: new Headers({ location }),
  });
};

describe('safeFetch SSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('isSafeIp', () => {
    it('blocks private IPv4 ranges', () => {
      expect(isSafeIp('127.0.0.1', 4)).toBe(false);
      expect(isSafeIp('10.0.0.5', 4)).toBe(false);
      expect(isSafeIp('172.16.0.1', 4)).toBe(false);
      expect(isSafeIp('192.168.1.1', 4)).toBe(false);
      expect(isSafeIp('169.254.169.254', 4)).toBe(false);
      expect(isSafeIp('0.0.0.0', 4)).toBe(false);
    });

    it('blocks private IPv6 ranges', () => {
      expect(isSafeIp('::1', 6)).toBe(false);
      expect(isSafeIp('fc00::1', 6)).toBe(false);
      expect(isSafeIp('fe80::1', 6)).toBe(false);
      expect(isSafeIp('::ffff:127.0.0.1', 6)).toBe(false);
      expect(isSafeIp('::ffff:192.168.1.1', 6)).toBe(false);
    });

    it('allows public IPs', () => {
      expect(isSafeIp('8.8.8.8', 4)).toBe(true);
      expect(isSafeIp('1.1.1.1', 4)).toBe(true);
      expect(isSafeIp('2606:4700:4700::1111', 6)).toBe(true);
    });
  });

  describe('validateAndResolveSafeUrl', () => {
    it('rejects invalid URLs', async () => {
      await expect(validateAndResolveSafeUrl('not-a-url')).rejects.toThrow('Invalid URL format.');
    });

    it('rejects unsupported protocols', async () => {
      await expect(validateAndResolveSafeUrl('ftp://example.com')).rejects.toThrow('Only http and https protocols are allowed.');
      await expect(validateAndResolveSafeUrl('file:///etc/passwd')).rejects.toThrow('Only http and https protocols are allowed.');
    });

    it('rejects credentials in URL', async () => {
      await expect(validateAndResolveSafeUrl('https://user:pass@example.com')).rejects.toThrow('URLs with credentials are not allowed.');
    });

    it('rejects banned hostnames', async () => {
      await expect(validateAndResolveSafeUrl('http://localhost:4000')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://metadata.google.internal')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://169.254.169.254')).rejects.toThrow('Hostname is not allowed.');
    });

    it('rejects hostnames that resolve to private IPs', async () => {
      mockDnsResponse('127.0.0.1', 4);
      await expect(validateAndResolveSafeUrl('http://looks-public.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');

      mockDnsResponse('10.0.0.5', 4);
      await expect(validateAndResolveSafeUrl('http://looks-public.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('allows public resolving hostnames', async () => {
      mockDnsResponse('8.8.8.8', 4);
      const url = await validateAndResolveSafeUrl('https://www.example.com/path?x=1');
      expect(url.href).toBe('https://www.example.com/path?x=1');
    });
  });

  describe('safeFetchTextWithLimit', () => {
    it('fetches text safely from a public URL', async () => {
      mockDnsResponse('8.8.8.8', 4);
      mockFetchResponse(true, 200, '<html>safe content</html>', { 'content-type': 'text/html' });

      const result = await safeFetchTextWithLimit('https://example.com');
      expect(result.text).toBe('<html>safe content</html>');
      expect(result.ok).toBe(true);
      expect(result.contentType).toBe('text/html');
    });

    it('rejects unsafe redirects', async () => {
      mockDnsResponse('8.8.8.8', 4); // First check passes
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'http://169.254.169.254/latest/meta-data' }),
        });

      await expect(safeFetchTextWithLimit('https://example.com')).rejects.toThrow('Hostname is not allowed.');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    
    it('rejects redirects to private IPs via DNS rebinding on redirect', async () => {
      // First DNS check passes
      dns.promises.lookup.mockResolvedValueOnce([{ address: '8.8.8.8', family: 4 }]);
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          headers: new Headers({ location: 'http://redirect-to-private.com' }),
        });

      // Second DNS check for the redirect target fails
      dns.promises.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);

      await expect(safeFetchTextWithLimit('https://example.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('follows safe redirects', async () => {
      // Both DNS checks pass
      dns.promises.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
      
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://example.com/safe' }),
        });

      // Actually, we need to mock the second fetch call
      // Wait, we mocked fetch completely, so it'll just keep returning 301 and max out redirects
      // if we don't mock the second response differently.
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 301,
          headers: new Headers({ location: 'https://example.com/safe' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'text/html' }),
          text: async () => 'redirected content',
          body: {
            getReader: () => {
              let readCalled = false;
              return {
                read: async () => {
                  if (readCalled) return { done: true };
                  readCalled = true;
                  return { done: false, value: new TextEncoder().encode('redirected content') };
                },
              };
            },
          },
        });

      const result = await safeFetchTextWithLimit('https://example.com');
      expect(result.text).toBe('redirected content');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects too many redirects', async () => {
      mockDnsResponse('8.8.8.8', 4);
      mockRedirectResponse('https://example.com');

      await expect(safeFetchTextWithLimit('https://example.com')).rejects.toThrow('Too many redirects.');
    });
  });
});
