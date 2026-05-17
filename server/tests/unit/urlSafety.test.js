import { describe, expect, it } from 'vitest';
import { safeAssetUrl, safeExternalUrl } from '../../../src/lib/urlSafety.js';

describe('frontend URL safety helpers', () => {
  it('rejects unsafe external URL schemes and malformed values', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalUrl('vbscript:msgbox(1)')).toBeNull();
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
    expect(safeExternalUrl('not a url')).toBeNull();
  });

  it('accepts http and https external URLs', () => {
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com');
    expect(safeExternalUrl('http://example.com')).toBe('http://example.com');
  });

  it('accepts only internal upload asset paths', () => {
    expect(safeAssetUrl('/uploads/avatar.jpg')).toBe('/uploads/avatar.jpg');
    expect(safeAssetUrl('/uploads/avatar.jpg', 'https://api.findly.example')).toBe('https://api.findly.example/uploads/avatar.jpg');
    expect(safeAssetUrl('https://example.com/avatar.jpg')).toBeNull();
    expect(safeAssetUrl('data:image/png;base64,abc')).toBeNull();
    expect(safeAssetUrl('/uploads/../secret.txt')).toBeNull();
    expect(safeAssetUrl('/not-uploads/avatar.jpg')).toBeNull();
  });
});
