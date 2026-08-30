# Railway deployment

Nexo is a shared npm-workspaces monorepo. Configure two Railway services from the same repository,
both with the root directory set to `/`. Do not set a service root to `apps/api` or `apps/web`,
because the build needs the root `package.json`, `package-lock.json`, and shared packages.

## API service

```text
Root directory: /
Build command: npm run build:api
Pre-deploy command: npm run db:migrate
Start command: npm run start:api
Healthcheck path: /api/v1/health
```

The API binds to `0.0.0.0` and consumes Railway's injected `PORT` value. `API_PORT` remains a local
fallback only.

## Web service

```text
Root directory: /
Build command: npm run build:web
Start command: npm run start:web
Healthcheck path: /health
```

The web build output is `apps/web/dist`. The production server serves that directory, applies a
single-page-app fallback for extensionless routes, and consumes Railway's injected `PORT` value.
Set `VITE_API_BASE_URL` before the build to the public API origin.

## Variables

Set these on the API service:

```text
NODE_ENV=production
BETTER_AUTH_URL=https://api.example.com
WEB_ORIGIN=https://app.example.com
BETTER_AUTH_SECRET=<32+ random characters>
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
SMTP_HOST=...
SMTP_PORT=587
SMTP_REQUIRE_TLS=true
EMAIL_FROM=...
```

`TRUST_PROXY_CIDRS` is optional and should contain only trusted proxy networks. `INVITATION_TTL_HOURS`
is optional and defaults to 168 hours.

Railway's private `DATABASE_URL` and `REDIS_URL` references may use plain database protocols because
Railway encrypts service-to-service traffic over its private network. Do not replace these with
public TCP proxy URLs unless the resulting database URL includes an allowed `sslmode` and the Redis
URL uses `rediss://`.

Set this on the web service before building:

```text
VITE_API_BASE_URL=https://api.example.com
```

Run the migration before the API receives traffic. Keep the database and Redis private to the
Railway project/network, and generate HTTPS domains for both public services.
