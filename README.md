# Nexo

Nexo is a fast, focused collaborative task-management application for product and delivery teams.

This repository is a greenfield modular monolith. The canonical product contract is in `docs/product/product-contract.md`; architecture and decisions are under `docs/architecture/`.

## Prerequisites

- Node.js 24 or newer
- npm 11 or newer
- Docker Desktop for local PostgreSQL

## Local development

```sh
cp .env.example .env
docker compose up -d postgres mailpit redis
npm install
npm run db:migrate
npm run dev
```

`npm run dev` applies pending migrations before starting the API and web client.

The web app runs at `http://localhost:5173` and the API at `http://localhost:3000`.
Development verification and invitation emails are available in Mailpit at
`http://localhost:8025`.

## Validation

```sh
npm run check
npm run typecheck
npm test
npm run build
```

## Production deployment

Run the API behind an HTTPS reverse proxy and provide explicit production settings. Production
startup fails closed unless the database uses TLS (`sslmode=require`, `verify-ca`, or
`verify-full`), Redis uses `rediss://`, SMTP uses implicit TLS or STARTTLS, and both application
origins use HTTPS. Set `TRUST_PROXY_CIDRS` only to the proxy networks that are allowed to provide
client IP headers.

Build and run the compiled API from the repository root:

```sh
npm ci
npm run build
npm run start -w @nexo/api
```

For Railway, create separate API and web services with `/` as the root directory so both services
can access the shared workspace packages. Use `npm run build:api` / `npm run start:api` for the API
and `npm run build:web` / `npm run start:web` for the web service. Set `VITE_API_BASE_URL` on the
web service before its build. The web server listens on Railway's `PORT` and includes SPA fallback
routing for `/login`, `/signup`, and `/admin`.

Apply database migrations as a separate deployment step before serving traffic. Do not expose
PostgreSQL, Redis, or Mailpit to the public network; the ports in `compose.yaml` are localhost-only
for development.

## Browser smoke test

With PostgreSQL and Mailpit running, install the browser once and run the real authentication and
task lifecycle smoke test:

```sh
npx playwright install chromium
npm run test:e2e
```

The smoke test uses a unique verified account and removes its workspace, tasks, activity, identity,
and email after the run.

## Repository map

```text
apps/api          Fastify API and application modules
apps/web          React client
packages/contracts Shared transport contracts
packages/database PostgreSQL schema and persistence
packages/domain    Framework-independent domain rules
docs               Product, architecture, ADRs, and delivery plan
```
