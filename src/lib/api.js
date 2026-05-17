const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.PROD ? '' : 'http://localhost:4000');
const CSRF_EXEMPT = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/verify-email',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
]);

let csrfTokenPromise = null;

class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new ApiError(
      'CONFIGURATION_ERROR',
      'Findly is not configured correctly. Please contact support.',
      500,
    );
  }

  return API_BASE_URL;
};

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_RESPONSE', 'The server returned an invalid response.', response.status);
  }
};

const isMutatingMethod = (method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

const apiRequestInternal = async (path, options = {}, retryState = { csrfRetried: false }) => {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  if (isMutatingMethod(method) && !CSRF_EXEMPT.has(`${method} ${path}`)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...options,
    method,
    headers,
  });

  const payload = await parseJson(response);

  if (!response.ok || payload?.success === false) {
    const code = payload?.error?.code || 'REQUEST_FAILED';
    if (
      isMutatingMethod(method)
      && code === 'CSRF_TOKEN_INVALID'
      && !retryState.csrfRetried
      && !CSRF_EXEMPT.has(`${method} ${path}`)
    ) {
      csrfTokenPromise = null;
      await getCsrfToken();
      return apiRequestInternal(path, options, { csrfRetried: true });
    }

    throw new ApiError(
      code,
      payload?.error?.message || 'Request failed.',
      response.status,
    );
  }

  return payload;
};

export const apiRequest = (path, options = {}) => apiRequestInternal(path, options);

export const getCsrfToken = async () => {
  csrfTokenPromise ??= fetch(`${getApiBaseUrl()}/api/csrf-token`, {
    credentials: 'include',
  })
    .then(parseJson)
    .then((payload) => {
      if (payload?.success === false || !payload?.data?.csrfToken) {
        throw new ApiError('CSRF_TOKEN_UNAVAILABLE', 'Could not prepare a secure request.', 500);
      }

      return payload.data.csrfToken;
    })
    .catch((error) => {
      csrfTokenPromise = null;
      throw error;
    });

  return csrfTokenPromise;
};

export { ApiError };
