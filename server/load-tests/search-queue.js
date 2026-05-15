import { config, createClient, requireLoadEnv } from './helpers.js';

requireLoadEnv();

const run = async () => {
  const campaigns = Number(process.env.CAMPAIGNS || 20);
  const client = createClient();
  const login = await client.request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!login.response.ok) throw new Error(`Login failed: ${login.response.status}`);
  const csrfToken = await client.csrf();

  let queued = 0;
  let rejected = 0;

  for (let index = 0; index < campaigns; index += 1) {
    const campaign = await client.request('/api/search/campaigns', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        workspaceId: config.workspaceId,
        name: `Load Search ${Date.now()} ${index}`,
        query: 'cafes in Amman',
        country: 'Jordan',
        city: 'Amman',
        businessTypes: ['Cafes'],
        sources: ['INSTAGRAM'],
        filters: { goal: 'Find businesses without websites' },
        requestedLimit: 10,
      }),
    });

    if (!campaign.response.ok) {
      rejected += 1;
      continue;
    }

    const runResponse = await client.request(`/api/search/campaigns/${campaign.body.data.campaign.id}/run`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({}),
    });

    if (runResponse.response.status === 202) queued += 1;
    else rejected += 1;
  }

  console.log(JSON.stringify({ test: 'search-queue', campaigns, queued, rejected }, null, 2));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
