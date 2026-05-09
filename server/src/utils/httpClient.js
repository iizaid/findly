import { AppError, errorCodes } from './AppError.js';

const providerErrorForStatus = (status) => {
  if (status === 401 || status === 403) return errorCodes.PROVIDER_AUTH_FAILED;
  if (status === 429) return errorCodes.PROVIDER_RATE_LIMITED;
  if (status >= 500) return errorCodes.PROVIDER_UNAVAILABLE;
  return errorCodes.PROVIDER_BAD_RESPONSE;
};

export const fetchJsonWithTimeout = async (url, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code = providerErrorForStatus(response.status);
      throw new AppError(
        code,
        'Provider request failed.',
        response.status >= 500 ? 502 : 400,
        { providerStatus: response.status },
      );
    }

    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'AbortError') {
      throw new AppError(errorCodes.PROVIDER_TIMEOUT, 'Provider request timed out.', 504);
    }
    throw new AppError(errorCodes.PROVIDER_UNAVAILABLE, 'Provider request failed safely.', 502);
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchTextWithLimit = async (url, options = {}) => {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxBytes = options.maxBytes ?? 512_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      ...options,
      headers: {
        'User-Agent': 'FindlyBot/0.1 (+https://findly.local; compliant public metadata fetch)',
        Accept: 'text/html,application/xhtml+xml',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

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
    if (error.name === 'AbortError') {
      throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch timed out.', 504);
    }
    throw new AppError(errorCodes.SOURCE_UNAVAILABLE, 'Website fetch failed safely.', 502);
  } finally {
    clearTimeout(timeout);
  }
};
