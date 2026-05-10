import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';
import { AppError, errorCodes } from './AppError.js';

const BLOCKED_IPV4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '255.255.255.255/32',
].map((r) => ipaddr.parseCIDR(r));

const BLOCKED_IPV6_RANGES = [
  '::/128',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
  'ff00::/8',
  '100::/64',
  '2001:db8::/32',
].map((r) => ipaddr.parseCIDR(r));

// Any IPv4 mapped to IPv6 like ::ffff:127.0.0.1 (::ffff:0:0/96)
// Will be converted to IPv4 by ipaddr.js if possible and then checked against IPv4 ranges.

export const isSafeIp = (ipString) => {
  let addr;
  try {
    addr = ipaddr.parse(ipString);
  } catch {
    return false;
  }

  // Handle IPv4-mapped IPv6
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }

  if (addr.kind() === 'ipv4') {
    return !BLOCKED_IPV4_RANGES.some((range) => addr.match(range));
  } else {
    // Also block IPv6 mapped to IPv4 ranges
    return !BLOCKED_IPV6_RANGES.some((range) => addr.match(range));
  }
};

const BANNED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const isBannedHostname = (hostname) => {
  if (BANNED_HOSTNAMES.has(hostname)) return true;
  if (hostname.endsWith('.localhost')) return true;
  return false;
};

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
  const cleanHostname = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;

  if (isBannedHostname(cleanHostname)) {
    throw new AppError(errorCodes.VALIDATION_ERROR, 'Hostname is not allowed.', 400);
  }

  // If the hostname itself parses as an IP address, check it immediately.
  // This handles direct IP literals like http://127.0.0.1 or http://[::1]
  // Node's URL parser also normalizes some forms like 0177.0.0.1 to 127.0.0.1.
  let ipCheckStr = cleanHostname;
  if (ipCheckStr.startsWith('[') && ipCheckStr.endsWith(']')) {
    ipCheckStr = ipCheckStr.slice(1, -1);
  }

  if (ipaddr.isValid(ipCheckStr)) {
    if (!isSafeIp(ipCheckStr)) {
      throw new AppError(errorCodes.VALIDATION_ERROR, 'Hostname resolves to a private or internal IP address.', 400);
    }
  }

  try {
    const addresses = await dns.promises.lookup(cleanHostname, { all: true });
    
    if (!addresses || addresses.length === 0) {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'DNS resolution failed or no addresses found.', 400);
    }

    for (const { address } of addresses) {
      if (!isSafeIp(address)) {
        throw new AppError(errorCodes.VALIDATION_ERROR, 'Hostname resolves to a private or internal IP address.', 400);
      }
    }

    // All resolved IPs are safe. Pick the first one to pin.
    return { parsedUrl, safeIp: addresses[0].address };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'DNS resolution failed.', 400);
  }
};

const safeHttpGetText = (parsedUrl, safeIp, options) => {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 5000;
    const maxBytes = options.maxBytes ?? 512_000;
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const requestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname, // Needed for Host header / SNI
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'FindlyBot/0.1 (+https://findly.local; compliant public metadata fetch)',
        Accept: 'text/html,application/xhtml+xml',
        ...(options.headers || {}),
      },
      lookup: (hostname, dnsOptions, callback) => {
        // Pin the connection to the pre-validated safe IP
        // The callback signature expects (err, address, family)
        const family = ipaddr.parse(safeIp).kind() === 'ipv6' ? 6 : 4;
        callback(null, safeIp, family);
      },
      timeout: timeoutMs,
    };

    const req = requestModule.request(requestOptions, (res) => {
      const statusCode = res.statusCode;
      const headers = res.headers;
      
      const contentType = headers['content-type'] || '';
      
      if (statusCode >= 300 && statusCode < 400) {
        // Redirect
        res.resume(); // consume response data to free up memory
        return resolve({ isRedirect: true, statusCode, headers });
      }

      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        res.resume();
        return resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, contentType, text: '', truncated: false });
      }

      const chunks = [];
      let received = 0;
      let truncated = false;

      res.on('data', (chunk) => {
        received += chunk.length;
        if (received > maxBytes) {
          truncated = true;
          res.destroy(); // Cancel stream
        } else {
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          contentType,
          text,
          truncated,
        });
      });
      
      res.on('error', (err) => {
         // If error is just stream destroyed due to truncation, ignore
         if (truncated) {
             const text = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
             return resolve({ ok: statusCode >= 200 && statusCode < 300, status: statusCode, contentType, text, truncated });
         }
         reject(new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch failed safely.', 502));
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch timed out.', 504));
    });

    req.on('error', (err) => {
      reject(new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch failed safely.', 502));
    });

    req.end();
  });
};

export const safeFetchTextWithLimit = async (url, options = {}, redirectCount = 0) => {
  const MAX_REDIRECTS = 5;

  if (redirectCount > MAX_REDIRECTS) {
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Too many redirects.', 400);
  }

  const { parsedUrl, safeIp } = await validateAndResolveSafeUrl(url);

  const response = await safeHttpGetText(parsedUrl, safeIp, options);

  if (response.isRedirect) {
    const location = response.headers.location;
    if (!location) {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Redirect location missing.', 400);
    }
    
    let redirectUrl;
    try {
      redirectUrl = new URL(location, parsedUrl.toString()).toString();
    } catch {
       throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Invalid redirect location.', 400);
    }
    
    // We should pass a reduced timeout if we had a start time, but for simplicity we'll pass the same options
    // as max timeout is not infinite and each step has a timeout limit.
    return safeFetchTextWithLimit(redirectUrl, options, redirectCount + 1);
  }

  return response;
};
