const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const API_BASE_URL = configuredApiBaseUrl || (import.meta.env.PROD ? '' : 'http://localhost:4000');
const CSRF_EXEMPT = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/2fa/login/verify',
  'POST /api/auth/2fa/login/cancel',
  'POST /api/auth/verify-email',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
]);

let csrfTokenPromise = null;

class ApiError extends Error {
  constructor(code, message, status, limitName = null, retryAfterSeconds = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.limitName = limitName;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new ApiError(
      'CONFIGURATION_ERROR',
      'Findly is not configured correctly. Please contact support.',
      500,
    );
  }

  return API_BASE_URL;
};

export const getOAuthStartUrl = (provider, returnTo = '/dashboard') => {
  const safeProvider = String(provider || '').toLowerCase();
  if (!['google', 'github', 'discord'].includes(safeProvider)) {
    throw new ApiError('VALIDATION_ERROR', 'Unsupported sign-in provider.', 400);
  }
  const query = new URLSearchParams();
  if (returnTo) query.set('returnTo', returnTo);
  return `${getApiBaseUrl()}/api/auth/oauth/${encodeURIComponent(safeProvider)}/start?${query.toString()}`;
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
      payload?.error?.limitName || null,
      payload?.error?.retryAfterSeconds || null,
    );
  }

  return payload;
};

export const apiRequest = (path, options = {}) => apiRequestInternal(path, options);

export const getCatalogLeadWebsiteIntelligence = (catalogLeadId) => apiRequest(
  `/api/admin/catalog-leads/${encodeURIComponent(catalogLeadId)}/website-intelligence`,
);

export const enrichCatalogLeadWebsite = (catalogLeadId, body = {}) => apiRequest(
  `/api/admin/catalog-leads/${encodeURIComponent(catalogLeadId)}/enrich-website`,
  {
    method: 'POST',
    body: JSON.stringify(body),
  },
);

export const createWebsiteEnrichmentJob = (body = {}) => apiRequest(
  '/api/admin/website-intelligence/jobs',
  {
    method: 'POST',
    body: JSON.stringify(body),
  },
);

export const getWebsiteEnrichmentJobs = (params = {}) => {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiRequest(`/api/admin/website-intelligence/jobs${suffix}`);
};

export const getWebsiteEnrichmentJob = (jobId) => apiRequest(
  `/api/admin/website-intelligence/jobs/${encodeURIComponent(jobId)}`,
);

export const processWebsiteEnrichmentJob = (jobId) => apiRequest(
  `/api/admin/website-intelligence/jobs/${encodeURIComponent(jobId)}/process-next`,
  { method: 'POST', body: JSON.stringify({}) },
);

export const getLeadMap = ({ leadIds = [], listId = null } = {}) => {
  const params = new URLSearchParams();
  if (leadIds.length) params.set('leadIds', leadIds.join(','));
  if (listId) params.set('listId', listId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/api/lead-map${suffix}`);
};

export const startLeadMapEnrichment = ({ leadIds = [], listId = null, forceRefresh = false } = {}) => apiRequest(
  '/api/lead-map/enrich',
  {
    method: 'POST',
    body: JSON.stringify({
      leadIds,
      ...(listId ? { listId } : {}),
      forceRefresh,
    }),
  },
);

export const getGeoEnrichmentJob = (jobId) => apiRequest(
  `/api/geo/enrichment/jobs/${encodeURIComponent(jobId)}`,
);

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

export const getTwoFactorStatus = () => apiRequest('/api/auth/2fa/status');

export const startTwoFactorSetup = () => apiRequest('/api/auth/2fa/setup/start', {
  method: 'POST',
  body: JSON.stringify({}),
});

export const confirmTwoFactorSetup = (code) => apiRequest('/api/auth/2fa/setup/confirm', {
  method: 'POST',
  body: JSON.stringify({ code }),
});

export const disableTwoFactor = ({ password, code }) => apiRequest('/api/auth/2fa/disable', {
  method: 'POST',
  body: JSON.stringify({ password, code }),
});

export const regenerateBackupCodes = (code) => apiRequest('/api/auth/2fa/backup-codes/regenerate', {
  method: 'POST',
  body: JSON.stringify({ code }),
});

export const verifyTwoFactorLogin = ({ challengeToken, code }) => apiRequest('/api/auth/2fa/login/verify', {
  method: 'POST',
  body: JSON.stringify(challengeToken ? { challengeToken, code } : { code }),
});

export const cancelTwoFactorLogin = (challengeToken) => apiRequest('/api/auth/2fa/login/cancel', {
  method: 'POST',
  body: JSON.stringify(challengeToken ? { challengeToken } : {}),
});

export { ApiError };
