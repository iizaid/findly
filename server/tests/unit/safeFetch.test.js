import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { validateAndResolveSafeUrl, safeFetchTextWithLimit, isSafeIp } from '../../src/utils/safeFetch.js';

vi.mock('node:dns', () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

vi.mock('node:http', () => ({
  default: {
    request: vi.fn(),
  },
}));

vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
}));

const mockDnsResponse = (addresses) => {
  if (!Array.isArray(addresses)) {
    addresses = [addresses];
  }
  dns.promises.lookup.mockResolvedValue(addresses.map((address) => ({ address })));
};

const mockHttpRequest = (mockType, options = {}) => {
  const requestMock = {
    on: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  };

  const setupMock = (reqModule) => {
    reqModule.request.mockImplementation((reqOpts, callback) => {
      // Simulate calling the custom lookup immediately
      if (reqOpts.lookup) {
        reqOpts.lookup(reqOpts.hostname, {}, (_err, _address, _family) => {
           // lookup called
        });
      }

      if (mockType === 'success') {
        const res = {
          statusCode: options.status || 200,
          headers: options.headers || { 'content-type': 'text/html' },
          resume: vi.fn(),
          on: (event, handler) => {
            if (event === 'data' && options.text) {
               handler(Buffer.from(options.text));
            }
            if (event === 'end') {
               handler();
            }
          },
          destroy: vi.fn(),
        };
        setTimeout(() => callback(res), 0);
      } else if (mockType === 'redirect') {
        const res = {
          statusCode: options.status || 301,
          headers: options.headers || { location: options.location },
          resume: vi.fn(),
          on: vi.fn(),
          destroy: vi.fn(),
        };
        setTimeout(() => callback(res), 0);
      } else if (mockType === 'timeout') {
         // do not call callback, trigger timeout
         setTimeout(() => {
           const timeoutHandler = requestMock.on.mock.calls.find(call => call[0] === 'timeout');
           if (timeoutHandler) timeoutHandler[1]();
         }, 0);
      }
      
      return requestMock;
    });
  };

  setupMock(http);
  setupMock(https);
  return requestMock;
};

describe('safeFetch SSRF protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isSafeIp', () => {
    it('blocks private IPv4 ranges', () => {
      expect(isSafeIp('127.0.0.1')).toBe(false);
      expect(isSafeIp('127.127.127.127')).toBe(false);
      expect(isSafeIp('10.0.0.5')).toBe(false);
      expect(isSafeIp('172.16.0.1')).toBe(false);
      expect(isSafeIp('172.31.255.255')).toBe(false);
      expect(isSafeIp('192.168.1.1')).toBe(false);
      expect(isSafeIp('169.254.169.254')).toBe(false);
      expect(isSafeIp('0.0.0.0')).toBe(false);
      expect(isSafeIp('100.64.0.1')).toBe(false);
      expect(isSafeIp('198.18.0.1')).toBe(false);
    });

    it('blocks private IPv6 ranges', () => {
      expect(isSafeIp('::1')).toBe(false);
      expect(isSafeIp('::')).toBe(false);
      expect(isSafeIp('fc00::1')).toBe(false);
      expect(isSafeIp('fd00::1')).toBe(false);
      expect(isSafeIp('fe80::1')).toBe(false);
      expect(isSafeIp('ff00::1')).toBe(false);
      expect(isSafeIp('100::1')).toBe(false);
      expect(isSafeIp('2001:db8::1')).toBe(false);
    });

    it('blocks IPv4-mapped IPv6 private ranges', () => {
      expect(isSafeIp('::ffff:127.0.0.1')).toBe(false);
      expect(isSafeIp('::ffff:192.168.1.1')).toBe(false);
    });

    it('allows public IPs', () => {
      expect(isSafeIp('8.8.8.8')).toBe(true);
      expect(isSafeIp('1.1.1.1')).toBe(true);
      expect(isSafeIp('2606:4700:4700::1111')).toBe(true);
    });
  });

  describe('validateAndResolveSafeUrl', () => {
    it('rejects invalid URLs', async () => {
      await expect(validateAndResolveSafeUrl('not-a-url')).rejects.toThrow('Invalid URL format.');
    });

    it('rejects unsupported protocols', async () => {
      await expect(validateAndResolveSafeUrl('ftp://example.com')).rejects.toThrow('Only http and https protocols are allowed.');
      await expect(validateAndResolveSafeUrl('file:///etc/passwd')).rejects.toThrow('Only http and https protocols are allowed.');
      await expect(validateAndResolveSafeUrl('data:text/html,hello')).rejects.toThrow('Only http and https protocols are allowed.');
      await expect(validateAndResolveSafeUrl('gopher://example.com')).rejects.toThrow('Only http and https protocols are allowed.');
    });

    it('rejects credentials in URL', async () => {
      await expect(validateAndResolveSafeUrl('https://user:pass@example.com')).rejects.toThrow('URLs with credentials are not allowed.');
    });

    it('rejects banned hostnames', async () => {
      await expect(validateAndResolveSafeUrl('http://localhost')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://localhost.')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://LOCALHOST')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://metadata.google.internal')).rejects.toThrow('Hostname is not allowed.');
      await expect(validateAndResolveSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('rejects hostnames that resolve to private IPs', async () => {
      mockDnsResponse('127.0.0.1');
      await expect(validateAndResolveSafeUrl('http://looks-public.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');

      mockDnsResponse('10.0.0.5');
      await expect(validateAndResolveSafeUrl('http://looks-public.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('rejects if ANY resolved IP is unsafe', async () => {
      mockDnsResponse(['8.8.8.8', '127.0.0.1']);
      await expect(validateAndResolveSafeUrl('http://looks-public.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('allows public resolving hostnames', async () => {
      mockDnsResponse('8.8.8.8');
      const { parsedUrl, safeIp } = await validateAndResolveSafeUrl('https://www.example.com/path?x=1');
      expect(parsedUrl.href).toBe('https://www.example.com/path?x=1');
      expect(safeIp).toBe('8.8.8.8');
    });

    it('rejects IPv6 URL literals', async () => {
      await expect(validateAndResolveSafeUrl('http://[::1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://[fc00::1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://[fd00::1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://[fe80::1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://[ff00::1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://[::ffff:127.0.0.1]')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('rejects direct IPv4 and weird forms', async () => {
      await expect(validateAndResolveSafeUrl('http://127.0.0.1')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://0.0.0.0')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://10.0.0.1')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      // Node's URL parses these:
      await expect(validateAndResolveSafeUrl('http://2130706433')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
      await expect(validateAndResolveSafeUrl('http://0177.0.0.1')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });
  });

  describe('safeFetchTextWithLimit', () => {
    it('fetches text safely from a public URL', async () => {
      mockDnsResponse('8.8.8.8');
      mockHttpRequest('success', { text: '<html>safe content</html>' });

      const result = await safeFetchTextWithLimit('https://example.com');
      expect(result.text).toBe('<html>safe content</html>');
      expect(result.ok).toBe(true);
      expect(result.contentType).toBe('text/html');
    });

    it('rejects unsafe redirects', async () => {
      mockDnsResponse('8.8.8.8'); // First check passes
      mockHttpRequest('redirect', { location: 'http://169.254.169.254/latest/meta-data' });

      await expect(safeFetchTextWithLimit('https://example.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });
    
    it('rejects redirects to private IPs via DNS rebinding on redirect', async () => {
      // First DNS check passes
      dns.promises.lookup.mockResolvedValueOnce([{ address: '8.8.8.8' }]);
      mockHttpRequest('redirect', { location: 'http://redirect-to-private.com' });

      // Second DNS check for the redirect target fails
      dns.promises.lookup.mockResolvedValueOnce([{ address: '127.0.0.1' }]);

      await expect(safeFetchTextWithLimit('https://example.com')).rejects.toThrow('Hostname resolves to a private or internal IP address.');
    });

    it('follows safe redirects', async () => {
      dns.promises.lookup.mockResolvedValue([{ address: '8.8.8.8' }]);
      
      // We need to mock sequential http requests
      http.request.mockImplementationOnce((_opts, cb) => {
        setTimeout(() => cb({ statusCode: 301, headers: { location: 'http://example.com/safe' }, resume: vi.fn(), on: vi.fn(), destroy: vi.fn() }), 0);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      }).mockImplementationOnce((_opts, cb) => {
        setTimeout(() => {
          const res = {
            statusCode: 200, headers: { 'content-type': 'text/html' },
            resume: vi.fn(),
            on: (e, h) => { if (e === 'data') h(Buffer.from('redirected content')); if (e === 'end') h(); },
            destroy: vi.fn(),
          };
          cb(res);
        }, 0);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      });

      const result = await safeFetchTextWithLimit('http://example.com');
      expect(result.text).toBe('redirected content');
    });

    it('rejects too many redirects', async () => {
      mockDnsResponse('8.8.8.8');
      
      http.request.mockImplementation((_opts, cb) => {
        setTimeout(() => cb({ statusCode: 301, headers: { location: 'http://example.com/loop' }, resume: vi.fn(), on: vi.fn(), destroy: vi.fn() }), 0);
        return { on: vi.fn(), end: vi.fn(), destroy: vi.fn() };
      });

      await expect(safeFetchTextWithLimit('http://example.com')).rejects.toThrow('Too many redirects.');
    });
  });
});
