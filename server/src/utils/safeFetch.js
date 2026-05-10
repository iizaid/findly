import dns from 'node:dns';
import { AppError, errorCodes } from './AppError.js';

// Convert IPv4 string to 32-bit integer for range checking
const ip4ToInt = (ip) => {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
};

// Private/Internal IPv4 Ranges in CIDR notation
const PRIVATE_IPV4_RANGES = [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
].map(([ip, prefixLength]) => {
  const mask = ~((1 << (32 - prefixLength)) - 1) >>> 0;
  return { network: ip4ToInt(ip) & mask, mask };
});

const isPrivateIpV4 = (ip) => {
  const ipInt = ip4ToInt(ip);
  return PRIVATE_IPV4_RANGES.some(({ network, mask }) => (ipInt & mask) === network);
};

// Simplified IPv6 Private/Internal checks
const isPrivateIpV6 = (ip) => {
  const lowerIp = ip.toLowerCase();
  
  if (lowerIp === '::1' || lowerIp === '::') return true;
  
  // Link-local (fe80::/10)
  if (lowerIp.startsWith('fe8') || lowerIp.startsWith('fe9') || lowerIp.startsWith('fea') || lowerIp.startsWith('feb')) return true;
  
  // Unique local (fc00::/7) -> fc or fd
  if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true;
  
  // Multicast (ff00::/8)
  if (lowerIp.startsWith('ff')) return true;
  
  // IPv4-mapped IPv6
  if (lowerIp.startsWith('::ffff:')) {
    const ipv4Part = lowerIp.substring(7);
    if (ipv4Part.includes('.')) {
      return isPrivateIpV4(ipv4Part);
    }
    return true;
  }
  
  return false;
};

export const isSafeIp = (ip, family) => {
  if (family === 4) return !isPrivateIpV4(ip);
  if (family === 6) return !isPrivateIpV6(ip);
  return false;
};

const BANNED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  '169.254.169.254', // also covered by IP check, but good to ban hostname directly
]);

export const validateAndResolveSafeUrl = async (urlString) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Invalid URL format.', 400);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Only http and https protocols are allowed.', 400);
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'URLs with credentials are not allowed.', 400);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  
  // Drop trailing dot for resolution/check
  const cleanHostname = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;

  if (BANNED_HOSTNAMES.has(cleanHostname)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Hostname is not allowed.', 400);
  }

  try {
    // Resolve all IPs for the hostname
    const addresses = await dns.promises.lookup(cleanHostname, { all: true });
    
    if (!addresses || addresses.length === 0) {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'DNS resolution failed or no addresses found.', 400);
    }

    for (const { address, family } of addresses) {
      if (!isSafeIp(address, family)) {
        throw new AppError(errorCodes.VALIDATION_ERROR, 'Hostname resolves to a private or internal IP address.', 400);
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'DNS resolution failed.', 400);
  }

  return parsedUrl;
};

export const safeFetchTextWithLimit = async (url, options = {}, redirectCount = 0) => {
  const MAX_REDIRECTS = 5;
  
  if (redirectCount > MAX_REDIRECTS) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Too many redirects.', 400);
  }

  const parsedUrl = await validateAndResolveSafeUrl(url);

  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 512_000;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      redirect: 'manual', // Prevent automatic redirects
      ...options,
      headers: {
        'User-Agent': 'FindlyBot/0.1 (+https://findly.local; compliant public metadata fetch)',
        Accept: 'text/html,application/xhtml+xml',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    // Handle redirects manually
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Redirect location missing.', 400);
      }
      
      const redirectUrl = new URL(location, parsedUrl.toString()).toString();
      clearTimeout(timeout);
      
      // Calculate remaining timeout
      const remainingTimeout = timeoutMs; // For simplicity in this implementation, we restart timeout, but you could subtract elapsed time.
      
      return safeFetchTextWithLimit(redirectUrl, { ...options, timeoutMs: remainingTimeout }, redirectCount + 1);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        text: '',
        truncated: false,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        text: await response.text(),
        truncated: false,
      };
    }

    const chunks = [];
    let received = 0;
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        truncated = true;
        break;
      }
      chunks.push(value);
    }

    const text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));

    return {
      ok: response.ok,
      status: response.status,
      contentType,
      text,
      truncated,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'AbortError') {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch timed out.', 504);
    }
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch failed safely.', 502);
  } finally {
    clearTimeout(timeout);
  }
};
