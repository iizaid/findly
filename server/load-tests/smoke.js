import { config, createClient, requireLoadEnv } from './helpers.js';

requireLoadEnv();

const run = async () => {
  const users = Number(process.env.USERS || 5);
  const durationMs = Number(process.env.DURATION_MS || 60_000);
  const stopAt = Date.now() + durationMs;
  let ok = 0;
  let failed = 0;

  await Promise.all(Array.from({ length: users }, async () => {
    const client = createClient();
    const login = await client.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    if (!login.response.ok) throw new Error(`Login failed: ${login.response.status}`);

    while (Date.now() < stopAt) {
      const [me, dashboard, credits] = await Promise.all([
        client.request('/api/auth/me'),
        client.request('/api/search/options'),
        client.request('/api/credits'),
      ]);
      if (me.response.ok && dashboard.response.ok && credits.response.ok) ok += 1;
      else failed += 1;
    }
  }));

  console.log(JSON.stringify({ test: 'smoke', users, ok, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
