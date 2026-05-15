const baseUrl = process.env.BASE_URL || 'http://localhost:4000';

export const config = {
  baseUrl,
  email: process.env.TEST_EMAIL,
  password: process.env.TEST_PASSWORD,
  workspaceId: process.env.WORKSPACE_ID,
};

export const createClient = () => {
  let cookie = '';

  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers || {}),
      },
    });

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(',').map((part) => part.split(';')[0]).join('; ');
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { response, body };
  };

  const csrf = async () => {
    const { body } = await request('/api/csrf-token');
    return body?.data?.csrfToken;
  };

  return { request, csrf };
};

export const requireLoadEnv = () => {
  for (const key of ['TEST_EMAIL', 'TEST_PASSWORD', 'WORKSPACE_ID']) {
    if (!process.env[key]) {
      throw new Error(`${key} is required for this load test.`);
    }
  }
};
