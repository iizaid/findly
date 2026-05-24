# Development and Test Database Isolation

- The development database is for manual product checks only.
- The automated test suite must run against a separate test database.
- In `NODE_ENV=test`, Findly now refuses to start unless:
  - `TEST_DATABASE_URL` is set, or
  - `DATABASE_URL` clearly points to a test database name.
- Override is blocked by default. Use `TEST_DATABASE_ALLOW_DEV_OVERWRITE=true` only when you are intentionally replacing a disposable local database.

## Cleanup command

Use this only in development:

```bash
npm run db:clean-test-fixtures
```

It removes obvious generated fixture records such as:

- `AI Cafe`
- `filter-test`
- `concurrent`
- `reuse`
- `invalidai`
- `Lead A`
- `mpi`
- `mpj`

The script refuses to run in `test` and `production`.
