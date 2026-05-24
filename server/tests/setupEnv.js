if (process.env.NODE_ENV === 'test' && !process.env.TEST_DATABASE_URL) {
  // Vitest runs against the local PostGIS development container in this workspace.
  // Keep the guard explicit for test runs without weakening production behavior.
  process.env.TEST_DATABASE_ALLOW_DEV_OVERWRITE ??= 'true';
}
