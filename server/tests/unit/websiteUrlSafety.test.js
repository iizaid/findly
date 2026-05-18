import { describe, expect, it } from 'vitest';
import { normalizeWebsiteUrl } from '../../src/modules/search/websiteMetadata.service.js';

describe('website metadata URL safety', () => {
  it('accepts public http and https URLs and normalizes domains without schemes', () => {
    expect(normalizeWebsiteUrl('https://example.com')).toBe('https://example.com/');
    expect(normalizeWebsiteUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');
    expect(normalizeWebsiteUrl(' www.example.com/path#frag ')).toBe('https://www.example.com/path');
  });

  it('removes common tracking query params and fragments', () => {
    expect(normalizeWebsiteUrl('https://example.com/?utm_source=x&keep=1#section')).toBe('https://example.com/?keep=1');
  });

  it('rejects unsafe protocols and internal hosts', () => {
    expect(() => normalizeWebsiteUrl('javascript:alert(1)')).toThrow(/http or https/);
    expect(() => normalizeWebsiteUrl('file:///etc/passwd')).toThrow(/http or https/);
    expect(() => normalizeWebsiteUrl('data:text/html,hi')).toThrow(/http or https/);
    expect(() => normalizeWebsiteUrl('ftp://example.com')).toThrow(/http or https/);
    expect(() => normalizeWebsiteUrl('http://localhost')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://127.0.0.1')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://0.0.0.0')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://[::1]')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://169.254.169.254')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://10.0.0.1')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://172.16.0.1')).toThrow(/not allowed/);
    expect(() => normalizeWebsiteUrl('http://192.168.1.1')).toThrow(/not allowed/);
  });
});
