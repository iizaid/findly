import { config, createClient, requireLoadEnv } from './helpers.js';

requireLoadEnv();

const run = async () => {
  const client = createClient();
  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!login.response.ok) throw new Error(`Login failed: ${login.response.status}`);

  const status = await client.request('/api/dashboard');
  const credits = await client.request('/api/credits');

  console.log(JSON.stringify({
    test: 'queue-metrics-read-path',
    dashboardStatus: status.response.status,
    creditsStatus: credits.response.status,
    ok: status.response.ok && credits.response.ok,
  }, null, 2));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
