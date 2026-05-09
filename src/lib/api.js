const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const CSRF_EXEMPT = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/verify-email',
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

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('INVALID_RESPONSE', 'The server returned an invalid response.', response.status);
  }
};

export const apiRequest = async (path, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !CSRF_EXEMPT.has(`${method} ${path}`)) {
    headers['X-CSRF-Token'] = await getCsrfToken();
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    method,
    headers,
  });

  const payload = await parseJson(response);

  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.error?.code || 'REQUEST_FAILED',
      payload?.error?.message || 'Request failed.',
      response.status,
    );
  }

  return payload;
};

export const getCsrfToken = async () => {
  csrfTokenPromise ??= fetch(`${API_BASE_URL}/api/csrf-token`, {
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
